<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
    exclude-result-prefixes="s">
    <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>
    
    <xsl:template match="/">
        <html lang="en">
        <head>
            <meta charset="UTF-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>XML Sitemap Directory | VANI-xAI Platform Index</title>
            <link rel="shortcut icon" href="/vani_icon.png" type="image/x-icon"/>
            <link rel="preconnect" href="https://fonts.googleapis.com"/>
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap" rel="stylesheet"/>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
            <style>
                :root {
                    --bg-gradient: linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 35%, #fff1f2 70%, #fefce8 100%);
                    --card-bg: #ffffff;
                    --text-primary: #0f172a;
                    --text-secondary: #475569;
                    --text-muted: #64748b;
                    --border-color: #e2e8f0;
                    --font-main: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
                    --font-display: 'Outfit', sans-serif;
                    --font-mono: 'JetBrains Mono', monospace;
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    background: var(--bg-gradient);
                    background-attachment: fixed;
                    color: var(--text-primary);
                    font-family: var(--font-main);
                    min-height: 100vh;
                    padding: 30px 20px 60px;
                    line-height: 1.6;
                }

                .sitemap-container {
                    max-width: 1200px;
                    margin: 0 auto;
                }

                /* Top Switch Banner */
                .visual-switch-banner {
                    background: linear-gradient(135deg, #e0e7ff 0%, #fae8ff 50%, #fce7f3 100%);
                    border: 1px solid rgba(99, 102, 241, 0.25);
                    border-radius: 16px;
                    padding: 14px 22px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 14px;
                    margin-bottom: 24px;
                    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.08);
                }
                .visual-switch-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: #312e81;
                }
                .visual-switch-info i {
                    font-size: 1.25rem;
                    color: #6366f1;
                }
                .btn-visual-switch {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: #ffffff !important;
                    text-decoration: none;
                    padding: 8px 18px;
                    border-radius: 10px;
                    font-size: 0.88rem;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.25s ease;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
                }
                .btn-visual-switch:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 18px rgba(79, 70, 229, 0.35);
                }

                /* Main Header Card */
                .header-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 24px;
                    padding: 36px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
                    margin-bottom: 24px;
                    position: relative;
                    overflow: hidden;
                }
                .header-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 6px;
                    background: linear-gradient(90deg, #06b6d4, #3b82f6, #6366f1, #d946ef, #f59e0b);
                }
                .brand-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(99, 102, 241, 0.1);
                    color: #4338ca;
                    padding: 6px 14px;
                    border-radius: 9999px;
                    font-size: 0.82rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 14px;
                    border: 1px solid rgba(99, 102, 241, 0.2);
                }
                .sitemap-title {
                    font-family: var(--font-display);
                    font-size: 2.2rem;
                    font-weight: 900;
                    color: #0f172a;
                    line-height: 1.2;
                    margin-bottom: 10px;
                    background: linear-gradient(135deg, #0f172a 0%, #334155 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .sitemap-subtitle {
                    color: var(--text-secondary);
                    font-size: 1.05rem;
                    max-width: 820px;
                    margin-bottom: 24px;
                }

                /* Stats Row */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                }
                .stat-box {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    transition: transform 0.2s ease, border-color 0.2s ease;
                }
                .stat-box:hover {
                    transform: translateY(-2px);
                    border-color: #cbd5e1;
                }
                .stat-icon {
                    width: 46px;
                    height: 46px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    color: #ffffff;
                    flex-shrink: 0;
                }
                .stat-label {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .stat-value {
                    font-family: var(--font-display);
                    font-size: 1.4rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }

                /* Search and Filter Bar */
                .control-panel {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 18px 24px;
                    margin-bottom: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 16px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
                }
                .search-wrapper {
                    position: relative;
                    flex: 1;
                    min-width: 280px;
                }
                .search-icon {
                    position: absolute;
                    left: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #94a3b8;
                    font-size: 1rem;
                }
                .search-input {
                    width: 100%;
                    padding: 12px 16px 12px 44px;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    font-family: inherit;
                    font-size: 0.95rem;
                    color: var(--text-primary);
                    background: #f8fafc;
                    outline: none;
                    transition: all 0.2s ease;
                }
                .search-input:focus {
                    border-color: #6366f1;
                    background: #ffffff;
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12);
                }

                .filter-chips {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .filter-btn {
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    color: #475569;
                    padding: 8px 16px;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .filter-btn.active, .filter-btn:hover {
                    background: #6366f1;
                    color: #ffffff;
                    border-color: #6366f1;
                }

                /* Table Section */
                .table-card {
                    background: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
                }
                .table-responsive {
                    width: 100%;
                    overflow-x: auto;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                }
                thead tr {
                    background: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                }
                th {
                    padding: 16px 20px;
                    font-size: 0.82rem;
                    font-weight: 800;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                tbody tr {
                    border-bottom: 1px solid #f1f5f9;
                    transition: background 0.15s ease;
                }
                tbody tr:hover {
                    background: #f8fafc;
                }
                td {
                    padding: 16px 20px;
                    font-size: 0.92rem;
                    vertical-align: middle;
                }

                /* URL Column Style */
                .url-link {
                    color: #2563eb;
                    text-decoration: none;
                    font-weight: 600;
                    font-family: var(--font-mono);
                    font-size: 0.88rem;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: color 0.2s ease;
                    word-break: break-all;
                }
                .url-link:hover {
                    color: #4f46e5;
                    text-decoration: underline;
                }

                /* Priority Badges */
                .badge-priority {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 800;
                    font-family: var(--font-mono);
                }
                .priority-high {
                    background: #ecfdf5;
                    color: #059669;
                    border: 1px solid #a7f3d0;
                }
                .priority-medium {
                    background: #eff6ff;
                    color: #2563eb;
                    border: 1px solid #bfdbfe;
                }
                .priority-standard {
                    background: #f5f3ff;
                    color: #7c3aed;
                    border: 1px solid #ddd6fe;
                }

                /* Changefreq Badges */
                .badge-freq {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    font-size: 0.78rem;
                    font-weight: 700;
                    text-transform: capitalize;
                }
                .freq-daily {
                    background: #fff7ed;
                    color: #ea580c;
                    border: 1px solid #ffedd5;
                }
                .freq-weekly {
                    background: #f0fdf4;
                    color: #16a34a;
                    border: 1px solid #dcfce7;
                }
                .freq-monthly {
                    background: #f8fafc;
                    color: #64748b;
                    border: 1px solid #e2e8f0;
                }

                .date-cell {
                    font-family: var(--font-mono);
                    font-size: 0.85rem;
                    color: #64748b;
                }

                /* Footer */
                .sitemap-footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #64748b;
                    font-size: 0.92rem;
                }
                .sitemap-footer a {
                    color: #6366f1;
                    text-decoration: none;
                    font-weight: 600;
                }
                .sitemap-footer a:hover {
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="sitemap-container">
                <!-- Visual Sitemap Quick Switch Banner -->
                <div class="visual-switch-banner">
                    <div class="visual-switch-info">
                        <i class="fa-solid fa-compass"></i>
                        <span>Looking for an interactive graphic view? Explore our modern Colorful Visual Sitemap directory.</span>
                    </div>
                    <a href="/sitemap" class="btn-visual-switch">
                        <i class="fa-solid fa-layer-group"></i> Open Visual Sitemap
                    </a>
                </div>

                <!-- Main Header -->
                <div class="header-card">
                    <div class="brand-badge">
                        <i class="fa-solid fa-satellite-dish"></i> VANI-xAI Platform Index
                    </div>
                    <h1 class="sitemap-title">XML Sitemap Directory</h1>
                    <p class="sitemap-subtitle">
                        Standardized XML Index for search indexing bots, LLM discovery agents, and platform navigators. All URLs listed below are verified, canonical, and monitored.
                    </p>

                    <!-- Stats Row -->
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-icon" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);">
                                <i class="fa-solid fa-link"></i>
                            </div>
                            <div>
                                <div class="stat-label">Total Indexed URLs</div>
                                <div class="stat-value" id="statCount">
                                    <xsl:value-of select="count(s:urlset/s:url | //url)"/>
                                </div>
                            </div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                                <i class="fa-solid fa-star"></i>
                            </div>
                            <div>
                                <div class="stat-label">High Priority (&#8805; 0.9)</div>
                                <div class="stat-value">
                                    <xsl:value-of select="count(s:urlset/s:url[s:priority &gt;= 0.9] | //url[priority &gt;= 0.9])"/>
                                </div>
                            </div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-icon" style="background: linear-gradient(135deg, #8b5cf6, #6d28d9);">
                                <i class="fa-solid fa-arrows-rotate"></i>
                            </div>
                            <div>
                                <div class="stat-label">Daily / Weekly Sync</div>
                                <div class="stat-value">
                                    <xsl:value-of select="count(s:urlset/s:url[s:changefreq='daily' or s:changefreq='weekly'] | //url[changefreq='daily' or changefreq='weekly'])"/>
                                </div>
                            </div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                                <i class="fa-solid fa-shield-halved"></i>
                            </div>
                            <div>
                                <div class="stat-label">Protocol Status</div>
                                <div class="stat-value" style="font-size: 1.15rem; color: #059669;">
                                    <i class="fa-solid fa-circle-check"></i> Sitemaps 0.9
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Controls Bar -->
                <div class="control-panel">
                    <div class="search-wrapper">
                        <i class="fa-solid fa-magnifying-glass search-icon"></i>
                        <input type="text" id="urlSearch" class="search-input" placeholder="Search pages, APIs, quantum tools, routes..." onkeyup="filterSitemap()"/>
                    </div>
                    <div class="filter-chips">
                        <button class="filter-btn active" onclick="applyFilter('all', this)">All URLs</button>
                        <button class="filter-btn" onclick="applyFilter('high', this)">High Priority</button>
                        <button class="filter-btn" onclick="applyFilter('quantum', this)">Quantum &amp; AI</button>
                        <button class="filter-btn" onclick="applyFilter('api', this)">APIs &amp; Specs</button>
                    </div>
                </div>

                <!-- URL Table -->
                <div class="table-card">
                    <div class="table-responsive">
                        <table id="sitemapTable">
                            <thead>
                                <tr>
                                    <th style="width: 60px;">#</th>
                                    <th>URL Location</th>
                                    <th style="width: 130px;">Priority</th>
                                    <th style="width: 150px;">Change Freq</th>
                                    <th style="width: 140px;">Last Modified</th>
                                </tr>
                            </thead>
                            <tbody>
                                <xsl:for-each select="s:urlset/s:url | //url">
                                    <tr class="sitemap-row">
                                        <td style="font-weight: 700; color: #94a3b8; font-family: var(--font-mono);">
                                            <xsl:value-of select="position()"/>
                                        </td>
                                        <td>
                                            <a class="url-link" target="_blank">
                                                <xsl:attribute name="href">
                                                    <xsl:value-of select="s:loc | loc"/>
                                                </xsl:attribute>
                                                <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.78rem; opacity: 0.6;"></i>
                                                <xsl:value-of select="s:loc | loc"/>
                                            </a>
                                        </td>
                                        <td>
                                            <xsl:variable name="pVal" select="s:priority | priority"/>
                                            <span class="badge-priority">
                                                <xsl:choose>
                                                    <xsl:when test="$pVal &gt;= 0.9">
                                                        <xsl:attribute name="class">badge-priority priority-high</xsl:attribute>
                                                        <i class="fa-solid fa-circle-check"></i>
                                                    </xsl:when>
                                                    <xsl:when test="$pVal &gt;= 0.8">
                                                        <xsl:attribute name="class">badge-priority priority-medium</xsl:attribute>
                                                        <i class="fa-solid fa-circle-dot"></i>
                                                    </xsl:when>
                                                    <xsl:otherwise>
                                                        <xsl:attribute name="class">badge-priority priority-standard</xsl:attribute>
                                                        <i class="fa-solid fa-circle"></i>
                                                    </xsl:otherwise>
                                                </xsl:choose>
                                                <xsl:value-of select="$pVal"/>
                                            </span>
                                        </td>
                                        <td>
                                            <xsl:variable name="freqVal" select="s:changefreq | changefreq"/>
                                            <span class="badge-freq">
                                                <xsl:choose>
                                                    <xsl:when test="$freqVal='daily'">
                                                        <xsl:attribute name="class">badge-freq freq-daily</xsl:attribute>
                                                        <i class="fa-solid fa-bolt"></i>
                                                    </xsl:when>
                                                    <xsl:when test="$freqVal='weekly'">
                                                        <xsl:attribute name="class">badge-freq freq-weekly</xsl:attribute>
                                                        <i class="fa-solid fa-rotate"></i>
                                                    </xsl:when>
                                                    <xsl:otherwise>
                                                        <xsl:attribute name="class">badge-freq freq-monthly</xsl:attribute>
                                                        <i class="fa-solid fa-calendar"></i>
                                                    </xsl:otherwise>
                                                </xsl:choose>
                                                <xsl:value-of select="$freqVal"/>
                                            </span>
                                        </td>
                                        <td class="date-cell">
                                            <xsl:value-of select="s:lastmod | lastmod"/>
                                        </td>
                                    </tr>
                                </xsl:for-each>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Footer -->
                <footer class="sitemap-footer">
                    <p>
                        VANI-xAI &#8226; Vāṇī Adhyātmik Navīn Intellect &#8226; Created by Dhruv Sagar.
                    </p>
                    <p style="margin-top: 6px;">
                        <a href="/">Homepage</a> &#8226;
                        <a href="/sitemap">Visual Sitemap</a> &#8226;
                        <a href="/connect-with-us">Connect &amp; Contact</a> &#8226;
                        <a href="/docs">Documentation</a> &#8226;
                        <a href="/openapi.json">OpenAPI Spec</a>
                    </p>
                </footer>
            </div>

            <!-- Client Filter Logic -->
            <script type="text/javascript">
            //<![CDATA[
                function filterSitemap() {
                    var input = document.getElementById('urlSearch').value.toLowerCase();
                    var rows = document.querySelectorAll('.sitemap-row');
                    rows.forEach(function(row) {
                        var text = row.textContent.toLowerCase();
                        if (text.indexOf(input) > -1) {
                            row.style.display = '';
                        } else {
                            row.style.display = 'none';
                        }
                    });
                }

                function applyFilter(category, btn) {
                    document.querySelectorAll('.filter-btn').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    if (btn) btn.classList.add('active');

                    var rows = document.querySelectorAll('.sitemap-row');
                    rows.forEach(function(row) {
                        var link = row.querySelector('.url-link').getAttribute('href').toLowerCase();
                        var prio = row.querySelector('.badge-priority').textContent;
                        var numPrio = parseFloat(prio) || 0;

                        if (category === 'all') {
                            row.style.display = '';
                        } else if (category === 'high') {
                            row.style.display = (numPrio >= 0.9) ? '' : 'none';
                        } else if (category === 'quantum') {
                            var isQ = link.indexOf('quantum') > -1 || link.indexOf('beam') > -1 || link.indexOf('saras') > -1 || link.indexOf('bovxai') > -1;
                            row.style.display = isQ ? '' : 'none';
                        } else if (category === 'api') {
                            var isApi = link.indexOf('openapi') > -1 || link.indexOf('mcp') > -1 || link.indexOf('llms') > -1 || link.indexOf('.json') > -1 || link.indexOf('.yaml') > -1;
                            row.style.display = isApi ? '' : 'none';
                        }
                    });
                }
            //]]>
            </script>
        </body>
        </html>
    </xsl:template>
</xsl:stylesheet>
