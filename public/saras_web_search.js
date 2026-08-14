// Saras.WebSearch - In-App Web Search & Zero-Tab Browser Engine
(function () {
    // State
    let currentEngine = 'google';
    let searchHistory = JSON.parse(localStorage.getItem('saras_search_history') || '[]');
    let currentUrl = 'https://www.google.com';
    let isListening = false;
    let recognition = null;
    let debounceTimer = null;
    let selectedSuggestionIndex = -1;

    // DOM Elements
    const searchInput = document.getElementById('saras-search-input');
    const btnExecuteSearch = document.getElementById('btn-execute-search');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const btnVoiceSearch = document.getElementById('btn-voice-search');
    const suggestionsBox = document.getElementById('suggestions-box');
    const resultsList = document.getElementById('results-list');
    const resultsMeta = document.getElementById('results-meta');
    const aiOverviewCard = document.getElementById('ai-overview-card');
    const aiOverviewContent = document.getElementById('ai-overview-content');
    const engineIcon = document.getElementById('current-engine-icon');
    const engineTabs = document.querySelectorAll('.engine-tab');
    const recentChipsContainer = document.getElementById('recent-search-chips');
    
    // Viewer Elements
    const browserIframe = document.getElementById('browser-iframe');
    const viewerPlaceholder = document.getElementById('viewer-placeholder');
    const browserUrlDisplay = document.getElementById('browser-url-display');
    const btnBrowserBack = document.getElementById('btn-browser-back');
    const btnBrowserForward = document.getElementById('btn-browser-forward');
    const btnBrowserRefresh = document.getElementById('btn-browser-refresh');
    const btnBrowserNewtab = document.getElementById('btn-browser-newtab');
    const btnBrowserFullscreen = document.getElementById('btn-browser-fullscreen');

    // Engine Configurations
    const ENGINES = {
        google: {
            name: 'Google',
            icon: 'fa-brands fa-google',
            searchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&igu=1`,
            directUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
        },
        duckduckgo: {
            name: 'DuckDuckGo',
            icon: 'fa-solid fa-shield-halved',
            searchUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
            directUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
        },
        bing: {
            name: 'Bing',
            icon: 'fa-brands fa-microsoft',
            searchUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
            directUrl: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
        },
        wikipedia: {
            name: 'Wikipedia',
            icon: 'fa-brands fa-wikipedia-w',
            searchUrl: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`,
            directUrl: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`
        },
        youtube: {
            name: 'YouTube',
            icon: 'fa-brands fa-youtube',
            searchUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
            directUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
        },
        ai: {
            name: 'AI Summary',
            icon: 'fa-solid fa-brain',
            searchUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
            directUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
        }
    };

    // Initialize
    function init() {
        renderRecentSearches();
        setupEventListeners();
        setupSpeechRecognition();

        // Check if query parameter exists (?q=...)
        const urlParams = new URLSearchParams(window.location.search);
        const queryParam = urlParams.get('q');
        if (queryParam) {
            searchInput.value = queryParam;
            btnClearSearch.style.display = 'flex';
            executeSearch(queryParam);
        }
    }

    // Event Listeners
    function setupEventListeners() {
        // Search execution
        btnExecuteSearch.addEventListener('click', () => {
            executeSearch(searchInput.value.trim());
        });

        searchInput.addEventListener('keydown', (e) => {
            const suggestions = suggestionsBox.querySelectorAll('.suggestion-item');
            if (e.key === 'Enter') {
                if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                    const text = suggestions[selectedSuggestionIndex].getAttribute('data-val');
                    searchInput.value = text;
                }
                closeSuggestions();
                executeSearch(searchInput.value.trim());
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (suggestions.length > 0) {
                    selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestions.length;
                    highlightSuggestion(suggestions);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (suggestions.length > 0) {
                    selectedSuggestionIndex = (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length;
                    highlightSuggestion(suggestions);
                }
            } else if (e.key === 'Escape') {
                closeSuggestions();
            }
        });

        // Input typing for autocomplete suggestions
        searchInput.addEventListener('input', () => {
            const val = searchInput.value.trim();
            btnClearSearch.style.display = val ? 'flex' : 'none';
            selectedSuggestionIndex = -1;

            clearTimeout(debounceTimer);
            if (val.length >= 2) {
                debounceTimer = setTimeout(() => fetchGoogleSuggestions(val), 200);
            } else {
                closeSuggestions();
            }
        });

        // Clear search input
        btnClearSearch.addEventListener('click', () => {
            searchInput.value = '';
            btnClearSearch.style.display = 'none';
            closeSuggestions();
            searchInput.focus();
        });

        // Close suggestions on outside click
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                closeSuggestions();
            }
        });

        // Engine Tabs
        engineTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                engineTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentEngine = tab.getAttribute('data-engine');
                
                const cfg = ENGINES[currentEngine] || ENGINES.google;
                engineIcon.className = `${cfg.icon} search-engine-icon`;
                searchInput.placeholder = `Search with ${cfg.name} or enter URL...`;

                if (searchInput.value.trim()) {
                    executeSearch(searchInput.value.trim());
                }
            });
        });

        // Browser Toolbar
        btnBrowserBack.addEventListener('click', () => {
            try { browserIframe.contentWindow.history.back(); } catch (e) {}
        });

        btnBrowserForward.addEventListener('click', () => {
            try { browserIframe.contentWindow.history.forward(); } catch (e) {}
        });

        btnBrowserRefresh.addEventListener('click', () => {
            if (currentUrl) loadInAppBrowser(currentUrl);
        });

        btnBrowserNewtab.addEventListener('click', () => {
            if (currentUrl) window.open(currentUrl, '_blank');
        });

        btnBrowserFullscreen.addEventListener('click', toggleViewerFullscreen);
    }

    // Google Autocomplete Suggestions using JSONP
    function fetchGoogleSuggestions(query) {
        const scriptId = 'google-suggest-script';
        const existingScript = document.getElementById(scriptId);
        if (existingScript) existingScript.remove();

        window.handleGoogleSuggestCallback = function (data) {
            if (data && data[1] && data[1].length > 0) {
                renderSuggestions(data[1]);
            } else {
                closeSuggestions();
            }
        };

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}&callback=handleGoogleSuggestCallback`;
        document.body.appendChild(script);
    }

    function renderSuggestions(suggestions) {
        suggestionsBox.innerHTML = '';
        suggestions.slice(0, 6).forEach((item, index) => {
            const text = typeof item === 'string' ? item : item[0];
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.setAttribute('data-val', text);
            div.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>${escapeHtml(text)}</span>`;
            div.addEventListener('click', () => {
                searchInput.value = text;
                closeSuggestions();
                executeSearch(text);
            });
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.classList.add('show');
    }

    function highlightSuggestion(suggestions) {
        suggestions.forEach((item, i) => {
            if (i === selectedSuggestionIndex) {
                item.classList.add('active');
                searchInput.value = item.getAttribute('data-val');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function closeSuggestions() {
        suggestionsBox.classList.remove('show');
        suggestionsBox.innerHTML = '';
        selectedSuggestionIndex = -1;
    }

    // Setup Web Speech Recognition for Voice Search
    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            btnVoiceSearch.style.display = 'none';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            btnVoiceSearch.classList.add('active');
            searchInput.placeholder = "Listening... Speak your search query.";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            searchInput.value = transcript;
            btnClearSearch.style.display = 'flex';
            executeSearch(transcript);
        };

        recognition.onerror = (event) => {
            console.warn("Speech error:", event.error);
            stopVoiceSearch();
        };

        recognition.onend = () => {
            stopVoiceSearch();
        };

        btnVoiceSearch.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    }

    function stopVoiceSearch() {
        isListening = false;
        btnVoiceSearch.classList.remove('active');
        searchInput.placeholder = `Search with ${ENGINES[currentEngine].name} or enter URL...`;
    }

    // Execute Search Main Routine
    async function executeSearch(query) {
        if (!query) return;
        closeSuggestions();
        saveSearchHistory(query);

        // Check if query is a direct website URL (e.g. google.com, https://en.wikipedia.org)
        const isUrl = /^https?:\/\//i.test(query) || (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(query) && !query.includes(' '));
        if (isUrl) {
            let fullUrl = query;
            if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
            loadInAppBrowser(fullUrl);
            renderDirectUrlCard(fullUrl);
            return;
        }

        resultsMeta.textContent = `Searching "${query}" via ${ENGINES[currentEngine].name}...`;
        resultsList.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--accent-cyan);">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; margin-bottom: 12px;"></i>
                <p>Retrieving instant web intelligence & results...</p>
            </div>
        `;

        // Determine Search Engine URL
        const engineCfg = ENGINES[currentEngine] || ENGINES.google;
        const targetSearchUrl = engineCfg.searchUrl(query);

        // Load into In-App Browser automatically so user doesn't need a new tab
        loadInAppBrowser(targetSearchUrl);

        // Fetch Live Synthesized Search Results & AI Overview
        fetchSearchResultsAndOverview(query);
    }

    // Fetch AI overview and structured web result cards
    async function fetchSearchResultsAndOverview(query) {
        aiOverviewCard.style.display = 'block';
        aiOverviewContent.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating Saras AI web synthesis for <em>"${escapeHtml(query)}"</em>...`;

        let summaryText = "";
        let structuredResults = [];

        try {
            // 1. Fetch from Wikipedia API for fast knowledge overview
            const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
            if (wikiRes.ok) {
                const wikiData = await wikiRes.json();
                if (wikiData.query && wikiData.query.search && wikiData.query.search.length > 0) {
                    const top = wikiData.query.search[0];
                    summaryText = top.snippet.replace(/<[^>]+>/g, '') + '...';
                    
                    wikiData.query.search.slice(0, 4).forEach(item => {
                        structuredResults.push({
                            title: item.title,
                            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
                            source: 'Wikipedia',
                            favicon: 'https://en.wikipedia.org/static/favicon/wikipedia.ico',
                            snippet: item.snippet.replace(/<[^>]+>/g, '')
                        });
                    });
                }
            }
        } catch (e) {
            console.warn("Wiki search fallback:", e);
        }

        // 2. Fetch AI Synthesis via OpenRouter if available
        try {
            const OPENROUTER_KEY = "OPENROUTER_API_KEY_HERE"; // REPLACE WITH ACTUAL KEY
            const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_KEY}`,
                    'HTTP-Referer': 'https://vani-nzdrsr.web.app',
                    'X-Title': 'Saras.WebSearch'
                },
                body: JSON.stringify({
                    model: "openrouter/auto",
                    messages: [
                        {
                            role: "system",
                            content: "You are Saras.WebSearch AI, an intelligent in-app web search summarizer. Provide a concise, clear 2-3 sentence overview answering the user's search query, including key facts or helpful links."
                        },
                        { role: "user", content: `Search query: ${query}` }
                    ]
                })
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                if (aiData.choices && aiData.choices.length > 0) {
                    summaryText = aiData.choices[0].message.content.trim();
                }
            }
        } catch (aiErr) {
            console.warn("AI synthesis fallback:", aiErr);
        }

        // Update AI Overview Card
        if (summaryText) {
            aiOverviewContent.innerHTML = formatMarkdown(summaryText);
        } else {
            aiOverviewContent.innerHTML = `Displaying live web results for <strong>"${escapeHtml(query)}"</strong> in the in-app browser on the right.`;
        }

        // Add standard Search Engine direct cards (Google, Bing, DuckDuckGo, YouTube)
        structuredResults.unshift({
            title: `${query} - Google Search`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            source: 'Google Search',
            favicon: 'https://www.google.com/favicon.ico',
            snippet: `Search Google directly for "${query}". View all top links, images, discussions, and articles.`
        });

        structuredResults.push({
            title: `Videos & Tutorials for "${query}" - YouTube`,
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            source: 'YouTube',
            favicon: 'https://www.youtube.com/s/desktop/f1721ae6/img/favicon_32x32.png',
            snippet: `Watch top video guides, reviews, and explanations on YouTube.`
        });

        structuredResults.push({
            title: `Instant Answers & Privacy Search: "${query}"`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            source: 'DuckDuckGo',
            favicon: 'https://duckduckgo.com/favicon.ico',
            snippet: `DuckDuckGo private web results and tracker-free search results.`
        });

        // Render Results Cards
        renderResultCards(structuredResults, query);
    }

    // Render Search Result Cards
    function renderResultCards(results, query) {
        resultsMeta.textContent = `${results.length} result sources found for "${query}"`;
        resultsList.innerHTML = '';

        results.forEach(res => {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-meta">
                    <img src="${res.favicon}" alt="Favicon" class="result-favicon" onerror="this.src='vani_icon.png'">
                    <span class="result-source">${escapeHtml(res.source)}</span>
                    <span class="result-url">${escapeHtml(res.url)}</span>
                </div>
                <a href="${res.url}" class="result-title" onclick="event.preventDefault(); window.sarasLoadBrowser('${escapeJs(res.url)}')">
                    ${escapeHtml(res.title)}
                </a>
                <p class="result-snippet">${escapeHtml(res.snippet)}</p>
                <div class="result-actions">
                    <button class="btn-card-action primary" onclick="window.sarasLoadBrowser('${escapeJs(res.url)}')">
                        <i class="fa-solid fa-window-maximize"></i> View In-App
                    </button>
                    <button class="btn-card-action" onclick="window.open('${escapeJs(res.url)}', '_blank')">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Tab
                    </button>
                    <button class="btn-card-action" onclick="window.sarasCopyUrl('${escapeJs(res.url)}')">
                        <i class="fa-solid fa-copy"></i> Copy Link
                    </button>
                </div>
            `;
            resultsList.appendChild(card);
        });
    }

    function renderDirectUrlCard(url) {
        aiOverviewCard.style.display = 'none';
        resultsMeta.textContent = `Direct URL Navigation`;
        resultsList.innerHTML = `
            <div class="result-card">
                <div class="result-meta">
                    <i class="fa-solid fa-globe" style="color: var(--accent-cyan);"></i>
                    <span class="result-source">Direct Web Address</span>
                </div>
                <a href="${url}" class="result-title" onclick="event.preventDefault(); window.sarasLoadBrowser('${escapeJs(url)}')">
                    ${escapeHtml(url)}
                </a>
                <p class="result-snippet">Loaded directly into the In-App Web Viewer. You can interact with the page inside the viewer panel without leaving the application.</p>
                <div class="result-actions">
                    <button class="btn-card-action primary" onclick="window.sarasLoadBrowser('${escapeJs(url)}')">
                        <i class="fa-solid fa-rotate-right"></i> Reload In-App
                    </button>
                    <button class="btn-card-action" onclick="window.open('${escapeJs(url)}', '_blank')">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open External
                    </button>
                </div>
            </div>
        `;
    }

    // Load In-App Browser Viewport
    function loadInAppBrowser(url) {
        currentUrl = url;
        browserUrlDisplay.textContent = url;
        viewerPlaceholder.style.display = 'none';
        browserIframe.style.display = 'block';
        browserIframe.src = url;
    }

    // History Management
    function saveSearchHistory(query) {
        if (!query) return;
        searchHistory = searchHistory.filter(item => item.toLowerCase() !== query.toLowerCase());
        searchHistory.unshift(query);
        if (searchHistory.length > 12) searchHistory.pop();
        localStorage.setItem('saras_search_history', JSON.stringify(searchHistory));
        renderRecentSearches();
    }

    function renderRecentSearches() {
        if (!recentChipsContainer) return;
        recentChipsContainer.innerHTML = '';
        if (searchHistory.length === 0) {
            recentChipsContainer.innerHTML = `<span style="font-size: 0.8rem; color: #64748b;">No recent searches yet</span>`;
            return;
        }
        searchHistory.slice(0, 6).forEach(query => {
            const chip = document.createElement('span');
            chip.className = 'history-chip';
            chip.innerHTML = `<i class="fa-solid fa-arrow-trend-up" style="color: var(--accent-cyan); font-size: 0.75rem;"></i> ${escapeHtml(query)}`;
            chip.addEventListener('click', () => quickSearch(query));
            recentChipsContainer.appendChild(chip);
        });
    }

    function clearSearchHistory() {
        if (confirm("Clear all recent Saras.WebSearch history?")) {
            searchHistory = [];
            localStorage.removeItem('saras_search_history');
            renderRecentSearches();
        }
    }

    // Fullscreen Viewport Toggle
    function toggleViewerFullscreen() {
        const viewer = document.getElementById('viewer-container');
        if (!document.fullscreenElement) {
            if (viewer.requestFullscreen) viewer.requestFullscreen();
            else if (viewer.webkitRequestFullscreen) viewer.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
    }

    // Utilities
    function quickSearch(q) {
        searchInput.value = q;
        btnClearSearch.style.display = 'flex';
        executeSearch(q);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeJs(str) {
        if (!str) return '';
        return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
    }

    function formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    // Expose globals for onclick bindings
    window.quickSearch = quickSearch;
    window.clearSearchHistory = clearSearchHistory;
    window.sarasLoadBrowser = loadInAppBrowser;
    window.sarasCopyUrl = function(url) {
        navigator.clipboard.writeText(url).then(() => {
            alert('URL copied to clipboard:\n' + url);
        });
    };

    // Auto-run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
