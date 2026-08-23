import unittest
import json
import yaml
import re
import warnings
import os
from app import app, PUBLIC_DIR

class TestAgenticReadiness(unittest.TestCase):
    def setUp(self):
        warnings.simplefilter("ignore", ResourceWarning)
        self.client = app.test_client()

    # ----------------------------------------------------
    # 1. CONTENT WITHOUT JAVASCRIPT
    # ----------------------------------------------------
    def test_content_without_javascript_has_h1_and_rich_text(self):
        """Ensure homepage raw HTML contains prominent H1 and over 500+ chars of text."""
        response = self.client.get('/', headers={'Accept': 'text/html'})
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        
        # Verify H1 tag exists
        self.assertRegex(html, r'<h1[^>]*>.*?</h1>', "Raw HTML must contain an <h1> tag")
        
        # Strip tags and verify raw text content character count
        text_only = re.sub(r'<[^>]+>', ' ', html)
        text_clean = ' '.join(text_only.split())
        self.assertGreater(len(text_clean), 1500, f"Raw HTML must contain > 500 chars (found {len(text_clean)})")
        
        # Verify noscript fallback container is present
        self.assertIn('<noscript>', html)
        self.assertIn('V.A.N.I-xAI: Vāṇī Adhyātmik Navīn Intellect', html)
        
        # Verify machine-readable discovery links in head
        self.assertIn('rel="alternate" type="text/markdown"', html)
        self.assertIn('rel="describedby" type="application/json"', html)
        self.assertIn('rel="index" type="text/plain"', html)

    # ----------------------------------------------------
    # 2. AGENT-FRIENDLY 404s
    # ----------------------------------------------------
    def test_agent_friendly_404_status_and_markdown_recovery(self):
        """Verify non-existent paths return HTTP 404 with markdown recovery index and links."""
        response_md = self.client.get('/some-path-that-does-not-exist-12345', headers={'Accept': 'text/markdown'})
        self.assertEqual(response_md.status_code, 404)
        self.assertIn('text/markdown', response_md.content_type)
        self.assertIn('Accept', response_md.headers.get('Vary', ''))
        
        body_md = response_md.get_data(as_text=True)
        self.assertIn('404 Not Found', body_md)
        self.assertIn('/sitemap.xml', body_md)
        self.assertIn('/llms.txt', body_md)
        self.assertIn('/openapi.json', body_md)

        response_html = self.client.get('/some-path-that-does-not-exist-12345', headers={'Accept': 'text/html'})
        self.assertEqual(response_html.status_code, 404)
        body_html = response_html.get_data(as_text=True)
        self.assertIn('404', body_html)
        self.assertIn('/sitemap.xml', body_html)

    def test_agent_friendly_404_json_error(self):
        """Verify 404 on API / JSON request returns structured JSON error."""
        response = self.client.get('/api/some-nonexistent-endpoint', headers={'Accept': 'application/json'})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.content_type, 'application/json')
        
        data = response.get_json()
        self.assertIn('error', data)
        self.assertEqual(data['error']['code'], 'NOT_FOUND')
        self.assertEqual(data['error']['status'], 404)
        self.assertIn('resolution', data['error'])
        self.assertIn('docs_url', data['error'])
        self.assertIn('sitemap_url', data['error'])

    # ----------------------------------------------------
    # 3. OPENAPI SPECIFICATION PUBLISHED
    # ----------------------------------------------------
    def test_openapi_spec_json_published_and_valid(self):
        """Verify OpenAPI JSON spec is published and valid OpenAPI 3.x."""
        for endpoint in ['/openapi.json', '/api/openapi.json']:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 200, f"Endpoint {endpoint} should return 200")
            self.assertEqual(response.content_type, 'application/json')
            
            data = response.get_json()
            self.assertIn('openapi', data)
            self.assertTrue(data['openapi'].startswith('3.'))
            self.assertIn('info', data)
            self.assertIn('paths', data)
            self.assertIn('/api/command', data['paths'])
            self.assertIn('/api/logs', data['paths'])
            self.assertIn('/api/system-stats', data['paths'])
            self.assertIn('/api/local-llm/status', data['paths'])
            self.assertIn('components', data)
            self.assertIn('schemas', data['components'])
            self.assertIn('ErrorResponse', data['components']['schemas'])

    def test_openapi_spec_yaml_published_and_valid(self):
        """Verify OpenAPI YAML spec is published and valid YAML."""
        for endpoint in ['/openapi.yaml', '/api/openapi.yaml']:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 200, f"Endpoint {endpoint} should return 200")
            
            yaml_text = response.get_data(as_text=True)
            parsed = yaml.safe_load(yaml_text)
            self.assertIsInstance(parsed, dict)
            self.assertTrue(parsed.get('openapi', '').startswith('3.'))
            self.assertIn('/api/command', parsed.get('paths', {}))

    # ----------------------------------------------------
    # 4. JSON ERROR RESPONSES
    # ----------------------------------------------------
    def test_structured_json_error_responses(self):
        """Verify API returns structured JSON error responses with codes, messages, and resolutions."""
        res_400 = self.client.post('/api/command', json={'command': ''})
        self.assertEqual(res_400.status_code, 400)
        self.assertEqual(res_400.content_type, 'application/json')
        data_400 = res_400.get_json()
        self.assertIn('error', data_400)
        self.assertEqual(data_400['error']['code'], 'BAD_REQUEST')
        self.assertEqual(data_400['error']['status'], 400)
        self.assertIn('message', data_400['error'])
        self.assertIn('resolution', data_400['error'])
        self.assertIn('docs_url', data_400['error'])

        res_405 = self.client.get('/api/command', headers={'Accept': 'application/json'})
        self.assertEqual(res_405.status_code, 405)
        self.assertEqual(res_405.content_type, 'application/json')
        data_405 = res_405.get_json()
        self.assertIn('error', data_405)
        self.assertEqual(data_405['error']['code'], 'METHOD_NOT_ALLOWED')
        self.assertEqual(data_405['error']['status'], 405)

    # ----------------------------------------------------
    # 5. MARKDOWN CONTENT NEGOTIATION (acceptmarkdown.com)
    # ----------------------------------------------------
    def test_markdown_content_negotiation_and_vary_header(self):
        """Verify acceptmarkdown.com compliance: Content-Type text/markdown and Vary: Accept."""
        endpoints = [
            ('/', '# VANI-xAI'),
            ('/index.html', '# VANI-xAI'),
            ('/about', '# About VANI-xAI'),
            ('/contact', '# Contact VANI-xAI'),
            ('/docs', '# VANI-xAI REST APIs & Developer Documentation'),
            ('/saras_web_search.html', '# Saras.WebSearch'),
            ('/saras_vani_chat.html', '# Saras_VANI.Chat'),
            ('/saras_vani_search.html', '# Saras_VANI.Search'),
            ('/faq.html', '# Frequently Asked Questions'),
            ('/terms.html', '# Terms & Conditions'),
            ('/privacy.html', '# Privacy Policy'),
            ('/about-founder.html', '# About the Founder'),
            ('/about-developer.html', '# About the Developer'),
            ('/premium.html', '# Free Unlimited Plan'),
        ]

        for path, expected_header in endpoints:
            response = self.client.get(path, headers={'Accept': 'text/markdown'})
            self.assertEqual(response.status_code, 200, f"Path {path} should return 200 for text/markdown")
            self.assertIn('text/markdown', response.content_type, f"Path {path} Content-Type must be text/markdown")
            
            vary = response.headers.get('Vary', '')
            self.assertIn('Accept', vary, f"Path {path} Vary header must contain 'Accept'")
            
            body = response.get_data(as_text=True)
            self.assertIn(expected_header, body, f"Path {path} markdown body must start with expected heading")

    # ----------------------------------------------------
    # 6. DEVELOPER RESOURCE DISCOVERABILITY & DOCS
    # ----------------------------------------------------
    def test_developer_resource_discoverability(self):
        """Verify developer resources are discoverable at /docs, /api-docs, /developers."""
        for path in ['/docs', '/docs.html', '/api-docs', '/developers']:
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200, f"Path {path} must return 200")
            html = res.get_data(as_text=True)
            self.assertIn('API &amp; Developer Documentation', html)
            self.assertIn('/openapi.json', html)
            self.assertIn('/.well-known/mcp.json', html)

    # ----------------------------------------------------
    # 7. AGENT INSTRUCTIONS & WHEN-TO-USE GUIDANCE
    # ----------------------------------------------------
    def test_agent_instructions_and_when_to_use(self):
        """Verify agent instructions file and when-to-use section in llms.txt."""
        res_txt = self.client.get('/agent-instructions.txt')
        self.assertEqual(res_txt.status_code, 200)
        body = res_txt.get_data(as_text=True)
        self.assertIn('When to Reach for VANI-xAI', body)
        self.assertIn('/api/command', body)

        res_llms = self.client.get('/llms.txt')
        self.assertEqual(res_llms.status_code, 200)
        llms_body = res_llms.get_data(as_text=True)
        self.assertIn('When to Use VANI-xAI (Agent Decision Guide)', llms_body)
        self.assertIn('Zero-Tab Real-Time Web Research', llms_body)

    # ----------------------------------------------------
    # 8. API SCHEMA COMPLEXITY & FUNCTION CALLING COMPATIBILITY
    # ----------------------------------------------------
    def test_api_schema_complexity_and_function_calling(self):
        """Verify operations have unique operationIds, typed parameters, requestBody, and response schemas."""
        res = self.client.get('/openapi.json')
        self.assertEqual(res.status_code, 200)
        spec = res.get_json()
        
        op_ids = set()
        for path, methods in spec.get('paths', {}).items():
            for method, op in methods.items():
                if method in ['get', 'post', 'put', 'delete', 'patch']:
                    self.assertIn('operationId', op, f"Path {path} {method} missing operationId")
                    op_id = op['operationId']
                    self.assertNotIn(op_id, op_ids, f"Duplicate operationId: {op_id}")
                    op_ids.add(op_id)
                    self.assertIn('description', op, f"Path {path} {method} missing description")
                    self.assertIn('responses', op, f"Path {path} {method} missing responses")

    # ----------------------------------------------------
    # 9. ORGANIZATION SCHEMA COMPLETENESS
    # ----------------------------------------------------
    def test_organization_schema_has_contact_point_and_address(self):
        """Verify Organization JSON-LD has contactPoint and address."""
        res = self.client.get('/')
        html = res.get_data(as_text=True)
        
        # Extract JSON-LD script blocks
        json_ld_matches = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        self.assertTrue(len(json_ld_matches) > 0, "Must have JSON-LD script block")
        
        found_org = False
        for block in json_ld_matches:
            data = json.loads(block)
            graph = data.get('@graph', [data])
            for item in graph:
                if item.get('@type') == 'Organization':
                    found_org = True
                    self.assertIn('contactPoint', item)
                    self.assertIsInstance(item['contactPoint'], list)
                    self.assertTrue(len(item['contactPoint']) > 0)
                    self.assertIn('email', item['contactPoint'][0])
                    self.assertIn('contactType', item['contactPoint'][0])
                    self.assertIn('address', item)
                    self.assertEqual(item['address'].get('@type'), 'PostalAddress')
                    self.assertIn('addressCountry', item['address'])
        self.assertTrue(found_org, "Organization schema must be present")

    # ----------------------------------------------------
    # 10. TRUST ANCHOR PAGES (/about, /contact, /privacy)
    # ----------------------------------------------------
    def test_trust_anchor_pages(self):
        """Verify /about, /contact, and /privacy have real content (> 500 chars) and H1 tags."""
        for path in ['/about', '/contact', '/privacy']:
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200, f"Path {path} should return 200")
            html = res.get_data(as_text=True)
            self.assertRegex(html, r'<h1[^>]*>.*?</h1>', f"Path {path} must have an <h1> tag")
            
            text_only = re.sub(r'<[^>]+>', ' ', html)
            text_clean = ' '.join(text_only.split())
            self.assertGreater(len(text_clean), 500, f"Path {path} must contain > 500 chars (found {len(text_clean)})")

    # ----------------------------------------------------
    # 11. PUBLIC API / DOCS LINKED FROM HOMEPAGE
    # ----------------------------------------------------
    def test_homepage_links_to_docs_and_trust_anchors(self):
        """Verify homepage raw HTML links to /docs, /about, /contact, and /openapi.json."""
        res = self.client.get('/')
        html = res.get_data(as_text=True)
        self.assertIn('href="/docs"', html)
        self.assertIn('href="/about"', html)
        self.assertIn('href="/contact"', html)
        self.assertIn('href="/openapi.json"', html)

    # ----------------------------------------------------
    # 12. JSON-LD STRUCTURED DATA (SoftwareApplication)
    # ----------------------------------------------------
    def test_json_ld_software_application_completeness(self):
        """Verify SoftwareApplication schema has url, applicationCategory, offers, and author."""
        res = self.client.get('/')
        html = res.get_data(as_text=True)
        
        json_ld_matches = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        found_app = False
        for block in json_ld_matches:
            data = json.loads(block)
            graph = data.get('@graph', [data])
            for item in graph:
                if item.get('@type') == 'SoftwareApplication':
                    found_app = True
                    self.assertIn('name', item)
                    self.assertIn('url', item)
                    self.assertIn('applicationCategory', item)
                    self.assertIn('offers', item)
                    self.assertIn('author', item)
        self.assertTrue(found_app, "SoftwareApplication schema must be present")

    # ----------------------------------------------------
    # 13. MCP (MODEL CONTEXT PROTOCOL) SERVER MANIFEST
    # ----------------------------------------------------
    def test_mcp_server_manifest(self):
        """Verify MCP server manifest is published at /.well-known/mcp.json and has tools."""
        for path in ['/.well-known/mcp.json', '/.well-known/mcp', '/mcp.json']:
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200, f"Path {path} must return 200")
            data = res.get_json()
            self.assertIn('name', data)
            self.assertEqual(data['name'], 'vani-xai')
            self.assertIn('tools', data)
            self.assertTrue(len(data['tools']) >= 4)
            tool_names = [t['name'] for t in data['tools']]
            self.assertIn('saras_web_search', tool_names)
            self.assertIn('execute_command', tool_names)
            self.assertIn('get_system_stats', tool_names)

    # ----------------------------------------------------
    # 14. TELEMETRY & LOGS REGRESSION TESTS
    # ----------------------------------------------------
    def test_system_stats_and_logs(self):
        """Verify /api/system-stats and /api/logs."""
        res_stats = self.client.get('/api/system-stats')
        self.assertEqual(res_stats.status_code, 200)
        self.assertEqual(res_stats.get_json().get('status'), 'success')

        res_logs = self.client.get('/api/logs')
        self.assertEqual(res_logs.status_code, 200)
        self.assertIn('logs', res_logs.get_json())

if __name__ == '__main__':
    unittest.main()
