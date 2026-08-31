import os
import sys
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
import threading
from collections import deque
from flask import Flask, request, jsonify, render_template, send_from_directory, Response
from flask_cors import CORS
import desktop_helper
import nlp_parser
import memory_manager
import autonomous_agent
import voice_agent
import agentic_loop
import psutil
import platform
import time
import logger

# Setup flask app
# Ensure template and static folders are loaded from public directory (single source of truth)
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, 'public')

app = Flask(
    __name__, 
    template_folder=PUBLIC_DIR, 
    static_folder=PUBLIC_DIR,
    static_url_path=''
)
CORS(app)

def add_log(msg):
    logger.log_status('SYSTEM', msg)

# ----------------------------------------------------
# CONTENT NEGOTIATION & AGENTIC HELPERS
# ----------------------------------------------------

def parse_accept_header(accept_header):
    """
    Parses Accept header into a list of (media_type, q_value) tuples sorted by q_value descending.
    """
    if not accept_header:
        return []
    items = []
    for part in accept_header.split(','):
        part = part.strip()
        if not part:
            continue
        params = part.split(';')
        media_type = params[0].strip().lower()
        q = 1.0
        for param in params[1:]:
            param = param.strip()
            if param.startswith('q='):
                try:
                    q = float(param[2:])
                except ValueError:
                    q = 0.0
        items.append((media_type, q))
    items.sort(key=lambda x: x[1], reverse=True)
    return items

def prefers_markdown(req):
    """
    Checks whether the incoming request prefers or explicitly requests text/markdown.
    Complies with acceptmarkdown.com content negotiation.
    """
    accept = req.headers.get('Accept', '')
    if not accept:
        return False
    parsed = parse_accept_header(accept)
    md_q = None
    html_q = None
    for mtype, q in parsed:
        if mtype == 'text/markdown' and md_q is None:
            md_q = q
        elif (mtype == 'text/html' or mtype == '*/*') and html_q is None:
            html_q = q
    if md_q is not None:
        if html_q is None or md_q >= html_q:
            return True
    return False

def prefers_json(req):
    """
    Checks whether the incoming request prefers application/json or is an API endpoint.
    """
    if req.path.startswith('/api/'):
        return True
    accept = req.headers.get('Accept', '')
    if not accept:
        return False
    parsed = parse_accept_header(accept)
    json_q = None
    html_q = None
    for mtype, q in parsed:
        if mtype == 'application/json' and json_q is None:
            json_q = q
        elif mtype == 'text/html' and html_q is None:
            html_q = q
    if json_q is not None:
        if html_q is None or json_q >= html_q:
            return True
    return False

def api_error_response(code: str, message: str, status_code: int = 400, resolution: str = None, details: dict = None):
    """
    Standardized structured JSON error response conforming to agentic error standards.
    """
    payload = {
        "error": {
            "code": code,
            "message": message,
            "status": status_code,
            "resolution": resolution or "Consult the API documentation at /openapi.json or site index at /sitemap.xml",
            "docs_url": "https://vani-nzdrsr.web.app/openapi.json",
            "sitemap_url": "https://vani-nzdrsr.web.app/sitemap.xml"
        }
    }
    if details:
        payload["error"]["details"] = details
    resp = jsonify(payload)
    resp.status_code = status_code
    resp.headers['Content-Type'] = 'application/json'
    resp.headers['Vary'] = 'Accept, Accept-Encoding'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

def serve_page(html_filename, md_filename=None, status_code=200):
    """
    Serves either the HTML representation or Markdown representation based on Accept negotiation.
    Always includes 'Vary: Accept, Accept-Encoding' header.
    """
    if prefers_markdown(request):
        target_md = None
        if md_filename:
            target_md = md_filename
        else:
            base_name = os.path.splitext(html_filename)[0]
            candidate = f"{base_name}.md"
            if os.path.exists(os.path.join(PUBLIC_DIR, 'md', candidate)):
                target_md = os.path.join('md', candidate)
            elif os.path.exists(os.path.join(PUBLIC_DIR, candidate)):
                target_md = candidate
        
        if target_md and os.path.exists(os.path.join(PUBLIC_DIR, target_md)):
            with open(os.path.join(PUBLIC_DIR, target_md), 'r', encoding='utf-8') as f:
                content = f.read()
            resp = Response(content, status=status_code, mimetype='text/markdown; charset=utf-8')
            resp.headers['Vary'] = 'Accept, Accept-Encoding'
            resp.headers['Access-Control-Allow-Origin'] = '*'
            return resp

    if os.path.exists(os.path.join(PUBLIC_DIR, html_filename)):
        resp = send_from_directory(PUBLIC_DIR, html_filename)
        resp.status_code = status_code
        resp.headers['Vary'] = 'Accept, Accept-Encoding'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
        
    return handle_404()

@app.after_request
def add_common_headers(response):
    response.headers['Access-Control-Allow-Private-Network'] = 'true'
    response.headers['Access-Control-Allow-Origin'] = '*'
    
    # Ensure 'Accept' is in Vary header on all negotiable / cacheable responses
    vary = response.headers.get('Vary')
    if vary:
        vary_items = [v.strip() for v in vary.split(',')]
        if 'Accept' not in vary_items:
            vary_items.append('Accept')
        if 'Accept-Encoding' not in vary_items:
            vary_items.append('Accept-Encoding')
        response.headers['Vary'] = ', '.join(vary_items)
    else:
        response.headers['Vary'] = 'Accept, Accept-Encoding'
        
    return response

# ----------------------------------------------------
# MACHINE-READABLE & SPECIFICATION ROUTES
# ----------------------------------------------------

@app.route('/openapi.json')
@app.route('/api/openapi.json')
def serve_openapi_json():
    return send_from_directory(PUBLIC_DIR, 'openapi.json', mimetype='application/json')

@app.route('/openapi.yaml')
@app.route('/api/openapi.yaml')
def serve_openapi_yaml():
    return send_from_directory(PUBLIC_DIR, 'openapi.yaml', mimetype='text/yaml; charset=utf-8')

@app.route('/llms.txt')
def serve_llms_txt():
    return send_from_directory(PUBLIC_DIR, 'llms.txt', mimetype='text/plain; charset=utf-8')

@app.route('/llms-full.txt')
def serve_llms_full_txt():
    return send_from_directory(PUBLIC_DIR, 'llms-full.txt', mimetype='text/plain; charset=utf-8')

@app.route('/sitemap.xml')
def serve_sitemap_xml():
    return send_from_directory(PUBLIC_DIR, 'sitemap.xml', mimetype='application/xml')

@app.route('/robots.txt')
def serve_robots_txt():
    return send_from_directory(PUBLIC_DIR, 'robots.txt', mimetype='text/plain; charset=utf-8')

@app.route('/vani_history')
@app.route('/vani-history')
def serve_vani_history():
    return serve_page('vani_history.html')

@app.route('/.well-known/mcp.json', methods=['GET', 'POST'])
@app.route('/.well-known/mcp', methods=['GET', 'POST'])
@app.route('/api/mcp', methods=['GET', 'POST'])
@app.route('/mcp.json', methods=['GET', 'POST'])
def serve_mcp_manifest():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        req_id = data.get('id', 1)
        method = data.get('method', '')
        
        if method == 'initialize':
            return jsonify({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {"listChanged": False},
                        "prompts": {"listChanged": False},
                        "resources": {"subscribe": False, "listChanged": False}
                    },
                    "serverInfo": {
                        "name": "vani-xai",
                        "version": "1.0.0",
                        "description": "VANI-xAI Official Model Context Protocol Server"
                    }
                }
            })
        elif method == 'tools/list':
            try:
                with open(os.path.join(PUBLIC_DIR, '.well-known', 'mcp.json'), 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                tools_list = manifest.get('tools', [])
            except Exception:
                tools_list = []
            return jsonify({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": tools_list
                }
            })
        elif method == 'ping':
            return jsonify({"jsonrpc": "2.0", "id": req_id, "result": {}})
            
    return send_from_directory(PUBLIC_DIR, '.well-known/mcp.json', mimetype='application/json; charset=utf-8')

@app.route('/agent-instructions.txt')
def serve_agent_instructions():
    return send_from_directory(PUBLIC_DIR, 'agent-instructions.txt', mimetype='text/plain; charset=utf-8')

@app.route('/.well-known/agent-instructions.md')
@app.route('/agent-instructions.md')
def serve_agent_instructions_md():
    return send_from_directory(PUBLIC_DIR, '.well-known/agent-instructions.md', mimetype='text/markdown; charset=utf-8')

# ----------------------------------------------------
# WEB PAGE ROUTES (With Accept: text/markdown Negotiation)
# ----------------------------------------------------

@app.route('/')
@app.route('/index.html')
def index():
    return serve_page('index.html', os.path.join('md', 'index.md'))

@app.route('/about.html')
@app.route('/about')
def about_page():
    return serve_page('about.html', os.path.join('md', 'about.md'))

@app.route('/contact.html')
@app.route('/contact')
def contact_page():
    return serve_page('contact.html', os.path.join('md', 'contact.md'))

@app.route('/docs.html')
@app.route('/docs')
@app.route('/api-docs')
@app.route('/developers.html')
@app.route('/developers')
def docs_page():
    return serve_page('docs.html', os.path.join('md', 'docs.md'))

@app.route('/ai4consol.html')
@app.route('/ai4consol')
def ai4consol_page():
    return serve_page('ai4consol.html')

@app.route('/auth-vani-xai.html')
@app.route('/auth')
@app.route('/auth-vani-xai')
def auth_page():
    return serve_page('auth-vani-xai.html')

@app.route('/pin-vaniXai.html')
@app.route('/pin')
def pin_page():
    return serve_page('pin-vaniXai.html')

@app.route('/settings.html')
@app.route('/settings')
def settings_page():
    return serve_page('settings.html', os.path.join('md', 'settings.md'))

@app.route('/premium.html')
@app.route('/premium')
def premium_page():
    return serve_page('premium.html', os.path.join('md', 'premium.md'))

@app.route('/saras_web_search.html')
@app.route('/websearch')
@app.route('/saras_web_search')
def saras_web_search_page():
    return serve_page('saras_web_search.html', os.path.join('md', 'websearch.md'))

@app.route('/saras_vani_chat.html')
@app.route('/chat')
def saras_vani_chat_page():
    return serve_page('saras_vani_chat.html', os.path.join('md', 'chat.md'))

@app.route('/api/get_ip')
def get_client_ip():
    ip = request.headers.get('X-Forwarded-For', request.headers.get('X-Real-IP', request.remote_addr))
    if ip and ',' in ip:
        ip = ip.split(',')[0].strip()
    return jsonify({'ip': ip or '127.0.0.1', 'status': 'success'})

@app.route('/saras_vani_search.html')
@app.route('/radar')
@app.route('/saras_vani_search')
def saras_vani_search_page():
    return serve_page('saras_vani_search.html', os.path.join('md', 'radar.md'))

@app.route('/quantum_radar.html')
@app.route('/quantum_radar')
@app.route('/quantum_search')
@app.route('/quantum-search')
def quantum_radar_page():
    return serve_page('quantum_radar.html', os.path.join('md', 'radar.md'))

@app.route('/quantum_connect.html')
@app.route('/quantum_connect')
@app.route('/quantum-connect')
def quantum_connect_page():
    return serve_page('quantum_connect.html', os.path.join('md', 'chat.md'))

@app.route('/terms.html')
@app.route('/terms')
def terms_page():
    return serve_page('terms.html', os.path.join('md', 'terms.md'))

@app.route('/privacy.html')
@app.route('/privacy')
def privacy_page():
    return serve_page('privacy.html', os.path.join('md', 'privacy.md'))

@app.route('/faq.html')
@app.route('/faq')
def faq_page():
    return serve_page('faq.html', os.path.join('md', 'faq.md'))

@app.route('/about-founder.html')
@app.route('/about-founder')
@app.route('/about_founder')
def about_founder_page():
    return serve_page('about-founder.html', os.path.join('md', 'about-founder.md'))

@app.route('/about-developer.html')
@app.route('/about-developer')
@app.route('/about_developer')
def about_developer_page():
    return serve_page('about-developer.html', os.path.join('md', 'about-developer.md'))

@app.route('/connect-with-us.html')
@app.route('/connect-with-us')
def connect_with_us_page():
    return serve_page('connect-with-us.html', os.path.join('md', 'connect-with-us.md'))

@app.route('/users-details.html')
@app.route('/users-details')
def users_details_page():
    return serve_page('users-details.html')

@app.route('/admin-vaniXai.html')
@app.route('/admin')
def admin_page():
    return serve_page('admin-vaniXai.html')

@app.route('/admin-users-list.html')
def admin_users_list():
    return serve_page('admin-users-list.html')

@app.route('/admin-premium-requests.html')
def admin_premium_requests():
    return serve_page('admin-premium-requests.html')

@app.route('/activation-subplan.html')
def activation_subplan():
    return serve_page('activation-subplan.html')

@app.route('/blocked.html')
def blocked_page():
    return serve_page('blocked.html')

@app.route('/banned.html')
def banned_page():
    return serve_page('banned.html')

# ----------------------------------------------------
# ERROR HANDLERS (JSON, Markdown, and Agent 404 Recovery)
# ----------------------------------------------------

@app.errorhandler(400)
def handle_400(e):
    if prefers_json(request):
        return api_error_response('BAD_REQUEST', str(getattr(e, 'description', e)), 400, "Provide valid request parameters or JSON payload.")
    if prefers_markdown(request):
        return Response(f"# 400 Bad Request\n\n{e}\n\nPlease verify your request parameters.", status=400, mimetype='text/markdown; charset=utf-8')
    return send_from_directory(PUBLIC_DIR, '404.html'), 400

@app.errorhandler(404)
def handle_404(e=None):
    if prefers_json(request):
        return api_error_response('NOT_FOUND', 'The requested resource or endpoint was not found on this server.', 404, 'Check the requested URL or refer to the OpenAPI specification at /openapi.json or sitemap at /sitemap.xml.')
    if prefers_markdown(request):
        md_404_path = os.path.join(PUBLIC_DIR, 'md', '404.md')
        if os.path.exists(md_404_path):
            with open(md_404_path, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            content = "# 404 Not Found\n\nThe requested path was not found on VANI-xAI.\n\n## Recovery\n- Sitemap: [/sitemap.xml](/sitemap.xml)\n- LLMs Index: [/llms.txt](/llms.txt)\n- OpenAPI Spec: [/openapi.json](/openapi.json)\n"
        resp = Response(content, status=404, mimetype='text/markdown; charset=utf-8')
        resp.headers['Vary'] = 'Accept, Accept-Encoding'
        return resp
    return send_from_directory(PUBLIC_DIR, '404.html'), 404

@app.errorhandler(405)
def handle_405(e):
    if prefers_json(request):
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for the requested URL.", 405, "Check the allowed HTTP methods in /openapi.json.")
    if prefers_markdown(request):
        return Response(f"# 405 Method Not Allowed\n\nMethod {request.method} is not supported for {request.path}.", status=405, mimetype='text/markdown; charset=utf-8')
    return send_from_directory(PUBLIC_DIR, '404.html'), 405

@app.errorhandler(500)
def handle_500(e):
    if prefers_json(request):
        return api_error_response('INTERNAL_SERVER_ERROR', 'An unexpected error occurred during execution.', 500, 'Check server logs via /api/logs or verify service status.')
    if prefers_markdown(request):
        return Response("# 500 Internal Server Error\n\nAn internal error occurred on the server.", status=500, mimetype='text/markdown; charset=utf-8')
    return send_from_directory(PUBLIC_DIR, '404.html'), 500

# ----------------------------------------------------
# ----------------------------------------------------
# API ENDPOINTS
# ----------------------------------------------------

@app.route('/api/command', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def handle_command():
    if request.method != 'POST':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/command. Use POST.", 405, "Send a POST request with JSON body {'command': '...'}.")

    data = request.json or {}
    command = data.get('command', '').strip()

    if not command:
        return api_error_response('BAD_REQUEST', 'No command provided in request payload.', 400, "Provide a valid JSON body with a non-empty 'command' string field.")

    add_log(f"Received Command: '{command}'")
    
    # Store user command in memory
    memory_manager.add_message('user', command)
    
    personality = data.get('personality', 'human_girl')
    custom_api_key = request.headers.get('X-OpenRouter-Key') or data.get('apiKey')
    force_local = data.get('forceLocal', False) or request.headers.get('X-Force-Local') == 'true'
    preferred_local_model = data.get('localModel') or request.headers.get('X-Local-Model')
    
    # Parse the command (with local LLM support)
    parsed = nlp_parser.parse_command(
        command, 
        personality=personality, 
        api_key=custom_api_key,
        force_local=force_local,
        preferred_local_model=preferred_local_model
    )
    action = parsed.get('action')
    
    result_message = ""
    success = True

    try:
        if action == 'saras_web_search':
            query = parsed.get('query', '')
            result_message = parsed.get('message', f"Searching for '{query}' in Saras.WebSearch...")
            return jsonify({
                'success': True,
                'action': 'saras_web_search',
                'query': query,
                'message': result_message
            })

        elif action == 'open_desktop_app':
            app_name = parsed.get('app_name')
            add_log(f"Running execution: Open app '{app_name}'")
            result_message = desktop_helper.open_desktop_app(app_name)

        elif action == 'use_desktop_app':
            desktop_action = parsed.get('desktop_action')
            value = parsed.get('value')
            add_log(f"Running automation: {desktop_action} ('{value}')")
            result_message = desktop_helper.use_desktop_app(desktop_action, value)

        elif action == 'make_phone_call':
            success = True
            result_message = "Phone call handled by client browser."

        elif action == 'make_whatsapp_call':
            phone_number = parsed.get('phone_number')
            call_type = parsed.get('call_type', 'voice')
            add_log(f"Running execution: WhatsApp {call_type} call to '{phone_number}'")
            result_message = desktop_helper.make_desktop_whatsapp_call(phone_number, call_type)

        elif action == 'send_whatsapp_message':
            phone_number = parsed.get('phone_number')
            message_text = parsed.get('message_text')
            add_log(f"Running execution: Send WhatsApp message to '{phone_number}'")
            result_message = desktop_helper.send_desktop_whatsapp_message(phone_number, message_text)

        elif action == 'cross_device_whatsapp_paste':
            phone_number = parsed.get('phone_number')
            add_log(f"Running Swarm execution: Send clipboard to '{phone_number}'")
            clipboard_text = desktop_helper.get_clipboard_text()
            if not clipboard_text.strip():
                success = False
                result_message = "Clipboard is empty or could not be read."
            else:
                result_message = desktop_helper.send_desktop_whatsapp_message(phone_number, clipboard_text)

        elif action == 'autonomous_goal':
            goal = parsed.get('goal', '')
            add_log(f"Running autonomous execution: Goal '{goal}'")
            result_message = agentic_loop.agent_loop.start_goal(goal)

        elif action == 'lockdown':
            add_log("Triggering Web Terminal Lockdown...")
            return jsonify({'success': True, 'action_type': 'lockdown', 'message': 'Terminal locked.'})

        elif action == 'swarm_sync':
            add_log("Triggering Swarm Sync to Mobile...")
            return jsonify({'success': True, 'action_type': 'swarm_sync', 'message': 'Swarm Handoff Initiated.'})

        elif action == 'build_semantic_index':
            import semantic_search
            add_log("Running Semantic execution: Building index")
            semantic_search.searcher.build_index_async(WORKSPACE_DIR)
            result_message = "Started building semantic index in the background. This may take a while."
            
        elif action == 'semantic_search':
            query = parsed.get('query')
            import semantic_search
            add_log(f"Running Semantic execution: Searching for '{query}'")
            result_message = semantic_search.searcher.search(query)

        elif action == 'take_screenshot':
            add_log("Running execution: Capture screenshot")
            result_message = desktop_helper.take_desktop_screenshot()
            if isinstance(result_message, dict) and not result_message.get('success', True):
                success = False

        elif action == 'lock_windows':
            add_log("Running execution: Lock workstation")
            result_message = desktop_helper.lock_windows()

        elif action == 'set_volume':
            vol_action = parsed.get('volume_action', 'mute')
            add_log(f"Running execution: Adjust volume ({vol_action})")
            result_message = desktop_helper.set_volume(vol_action)

        elif action == 'open_url':
            url_val = parsed.get('url')
            add_log(f"Running execution: Open URL '{url_val}'")
            result_message = desktop_helper.open_url(url_val)

        elif action == 'analyze_screen':
            add_log("Running vision execution: Analyze screen")
            screen_data = desktop_helper.take_desktop_screenshot()
            if isinstance(screen_data, dict) and screen_data.get('success'):
                img_url = screen_data.get('image_url')
                import base64
                filepath = os.path.join(WORKSPACE_DIR, img_url.lstrip('/'))
                if os.path.exists(filepath):
                    with open(filepath, "rb") as image_file:
                        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                    
                    vision_prompt = command
                    import llm_router
                    messages = [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": vision_prompt},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_string}"}}
                            ]
                        }
                    ]
                    
                    try:
                        result_message = llm_router.call_llm_with_fallback(
                            messages,
                            models=llm_router.VISION_FREE_MODELS,
                            timeout_per_model=15,
                            custom_api_key=custom_api_key
                        )
                        success = True
                    except Exception as e:
                        success = False
                        result_message = f"Vision API failed: {e}"
                else:
                    success = False
                    result_message = "Screenshot file not found for analysis."
            else:
                success = False
                result_message = "Vision analysis: please upload an image or trigger web search."

        elif action == 'execute_python_script':
            script = parsed.get('script', '')
            add_log(f"Running execution sandbox: Python script")
            import subprocess
            temp_path = os.path.join(WORKSPACE_DIR, 'temp_exec.py')
            with open(temp_path, 'w', encoding='utf-8') as f:
                f.write(script)
            try:
                output = subprocess.check_output(['python', temp_path], stderr=subprocess.STDOUT, timeout=10, text=True)
                result_message = f"Script Output:\n{output.strip()}"
                success = True
            except subprocess.TimeoutExpired:
                success = False
                result_message = "Script execution timed out after 10 seconds."
            except subprocess.CalledProcessError as e:
                success = False
                result_message = f"Script execution failed:\n{e.output.strip()}"
            except Exception as e:
                success = False
                result_message = f"Failed to execute script: {e}"
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        elif action == 'chat':
            success = True
            result_message = parsed.get('message', 'No response generated.')

        elif action == 'unknown':
            success = True
            result_message = parsed.get('message', "Command not recognized.")

        else:
            success = False
            result_message = f"Unsupported action: '{action}'."

    except Exception as e:
        success = False
        result_message = f"Execution failed: {e}"
        add_log(f"Error executing action: {e}")
        return api_error_response('INTERNAL_SERVER_ERROR', f"Command execution failed: {e}", 500, "Check command syntax and server logs at /api/logs.")

    add_log(f"Result: {result_message}")
    
    # Store assistant response in memory if it's a valid string message
    if success and isinstance(result_message, str) and result_message.strip():
        memory_manager.add_message('assistant', result_message)
        # Voice agent logs/synthesizes response
        voice_agent.speak(result_message)
    
    response_data = {
        'success': success,
        'action': action,
        'parsed': parsed,
        'message': result_message
    }
    
    if isinstance(result_message, dict):
        response_data.update(result_message)
        
    return jsonify(response_data)

# Endpoint: Get logs
@app.route('/api/logs', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def get_logs_endpoint():
    if request.method != 'GET':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/logs. Use GET.", 405, "Send a GET request to retrieve logs.")
    logs_list = logger.get_logs()
    return jsonify({
        'logs': logs_list
    })

# Endpoint: System Stats
@app.route('/api/system-stats', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def get_system_stats():
    if request.method != 'GET':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/system-stats. Use GET.", 405, "Send a GET request to retrieve system statistics.")
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count(logical=True)
        cpu_freq = psutil.cpu_freq()
        
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        net = psutil.net_io_counters()
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        
        return jsonify({
            'status': 'success',
            'cpu': {
                'percent': cpu_percent,
                'cores': cpu_count,
                'frequency': cpu_freq.current if cpu_freq else 0
            },
            'memory': {
                'total': mem.total,
                'available': mem.available,
                'percent': mem.percent,
                'used': mem.used
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            },
            'network': {
                'bytes_sent': net.bytes_sent,
                'bytes_recv': net.bytes_recv
            },
            'system': {
                'os': platform.system(),
                'release': platform.release(),
                'uptime_seconds': uptime_seconds
            }
        })
    except Exception as e:
        return api_error_response('INTERNAL_SERVER_ERROR', f"Error gathering system telemetry: {e}", 500, "Check host permissions and psutil availability.")

# ----------------------------------------------------
# LOCAL LLM API ENDPOINTS
# ----------------------------------------------------

@app.route('/api/local-llm/status', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def get_local_llm_status_endpoint():
    if request.method != 'GET':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/local-llm/status. Use GET.", 405, "Send a GET request to retrieve local LLM status.")
    import llm_router
    url = request.args.get('url')
    status = llm_router.get_local_llm_status(local_url=url)
    return jsonify(status)

@app.route('/api/local-llm/config', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def handle_local_llm_config():
    import llm_router
    if request.method == 'POST':
        data = request.json or {}
        success, res = llm_router.save_local_config(data)
        if success:
            return jsonify({'success': True, 'config': res})
        return api_error_response('BAD_REQUEST', f"Failed to save local config: {res}", 400, "Provide valid endpoint URL and model configuration.")
    elif request.method == 'GET':
        config = llm_router.get_local_config()
        return jsonify({'success': True, 'config': config})
    else:
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/local-llm/config. Use GET or POST.", 405, "Send a GET or POST request to manage local configuration.")

@app.route('/api/local-llm/pull', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def pull_local_model_endpoint():
    if request.method != 'POST':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/local-llm/pull. Use POST.", 405, "Send a POST request with JSON body {'model': '...'}.")
    import llm_router
    data = request.json or {}
    model_name = data.get('model', '').strip()
    url = data.get('url')
    if not model_name:
        return api_error_response('BAD_REQUEST', 'No model name specified.', 400, "Provide a valid 'model' string (e.g. 'llama3:latest').")
    
    success, msg = llm_router.start_model_pull(model_name, local_url=url)
    if success:
        return jsonify({'success': True, 'message': msg})
    return api_error_response('CONFLICT', str(msg), 409, "Wait for current pull operation to finish or verify model name.")

@app.route('/api/local-llm/pull-status', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
def get_pull_status_endpoint():
    if request.method != 'GET':
        return api_error_response('METHOD_NOT_ALLOWED', f"The HTTP method {request.method} is not allowed for /api/local-llm/pull-status. Use GET.", 405, "Send a GET request to query model pull status.")
    import llm_router
    return jsonify(llm_router.PULL_STATUS)

# Catch-all file server for public assets
@app.route('/<path:path>')
def serve_public_files(path):
    full_path = os.path.join(PUBLIC_DIR, path)
    if os.path.isfile(full_path):
        mimetype = None
        if path.endswith('.json'):
            mimetype = 'application/json'
        elif path.endswith('.yaml') or path.endswith('.yml'):
            mimetype = 'text/yaml; charset=utf-8'
        elif path.endswith('.txt'):
            mimetype = 'text/plain; charset=utf-8'
        elif path.endswith('.md'):
            mimetype = 'text/markdown; charset=utf-8'
        return send_from_directory(PUBLIC_DIR, path, mimetype=mimetype)
    elif os.path.isfile(os.path.join(PUBLIC_DIR, f"{path}.html")):
        return serve_page(f"{path}.html")
    return handle_404()

if __name__ == '__main__':
    # Start Autonomous Agent
    autonomous_agent.start_agent()
    
    # Start Voice Agent
    voice_agent.start_agent()
    
    # Run Flask server locally
    app.run(host='127.0.0.1', port=5000, debug=True)
