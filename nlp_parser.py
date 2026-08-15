import re
import json
import os
import urllib.request
import urllib.error
import memory_manager

# Mapping for mobile app names to package names
MOBILE_APP_PACKAGES = {
    'whatsapp': 'com.whatsapp',
    'chrome': 'com.android.chrome',
    'browser': 'com.android.chrome',
    'youtube': 'com.google.android.youtube',
    'maps': 'com.google.android.apps.maps',
    'gmail': 'com.google.android.gm',
    'facebook': 'com.facebook.katana',
    'instagram': 'com.instagram.android',
    'spotify': 'com.spotify.music',
    'settings': 'com.android.settings'
}

def query_knowledge_engine(query):
    """Fetch live factual snippet from Wikipedia/Knowledge index for queries."""
    try:
        import urllib.parse
        cleaned = re.sub(r'^(what\s+is|who\s+is|who\s+was|tell\s+me\s+about|explain|describe|define|where\s+is|what\s+are)\s+', '', query.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r'[?!.]+$', '', cleaned).strip()
        if not cleaned or len(cleaned) < 2:
            return None
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(cleaned)}&format=json&origin=*"
        req = urllib.request.Request(wiki_url, headers={'User-Agent': 'VANI-xAI/1.0'})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode('utf-8'))
            results = data.get('query', {}).get('search', [])
            if results:
                top = results[0]
                title = top.get('title')
                snippet = top.get('snippet', '').replace('<span class="searchmatch">', '').replace('</span>', '').replace('&quot;', '"').replace('&#039;', "'")
                page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"
                return f"<strong>{title}</strong>: {snippet}... (<a href='{page_url}' target='_blank' style='color:#06b6d4; font-weight:600;'>Read full article</a>)"
    except Exception:
        pass
    return None

def parse_with_rules(text):
    """
    Fallback regex/rules-based parser and intelligent local web reasoning engine.
    Returns a dictionary of action and parameters.
    """
    text_lower = text.lower().strip()

    # 1. Creator / Founder / Developer Queries
    if any(k in text_lower for k in ['founder', 'creator', 'developer', 'who created', 'who made', 'who built', 'who is dhruv', 'dhruv sagar']):
        return {
            'action': 'chat',
            'message': 'I was created and envisioned by <strong>Dhruv Sagar</strong>. Explore the full story on our <a href="/about-founder" target="_blank" style="color:#06b6d4; font-weight:600;">About Founder</a> and <a href="/about-developer" target="_blank" style="color:#06b6d4; font-weight:600;">About Developer</a> pages.'
        }

    # 2. Identity / Name
    if any(k in text_lower for k in ['who are you', 'what is your name', 'your name', 'what is vani', 'what is vani-xai', 'what are you']):
        return {
            'action': 'chat',
            'message': 'I am <strong>V.A.N.I-xAI</strong> (Vāṇī Adhyātmik Navīn Intellect) &mdash; your intelligent web AI assistant. <em>Don\'t Assume, Verify.</em> How may I assist you today?'
        }

    # 3. Greetings & Well-being
    if re.search(r'\b(how are you|kaise ho|kya haal|how do you do)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'I am operating at peak efficiency! Ready to assist your web browsing, calculations, and tasks. How can I help you today?'
        }

    if re.match(r'^(hi|hello|hey|namaste|greetings|hola|good\s+morning|good\s+evening|good\s+afternoon)(\s+vani|\s+there|\s+assistant)?$', text_lower) or text_lower in ['hi', 'hello', 'hey']:
        return {
            'action': 'chat',
            'message': 'Namaste! I am V.A.N.I-xAI. How can I assist your workflow today? Try asking me to search the web, calculate formulas, or explore Saras tools.'
        }

    # 3.5 Jokes / Fun
    if 'joke' in text_lower:
        return {
            'action': 'chat',
            'message': 'Why do programmers prefer dark mode? Because light attracts bugs! :)'
        }

    # 4. Capabilities & Help
    if any(k in text_lower for k in ['help', 'what can you do', 'features', 'capabilities', 'guide', 'menu']):
        return {
            'action': 'chat',
            'message': 'Here are some things I can do for you on the web:<br>'
                       '&bull; <strong>Saras.WebSearch:</strong> In-app zero-tab web search (e.g. <code>search quantum computing</code>)<br>'
                       '&bull; <strong>Instant Math & Logic:</strong> Evaluate formulas (e.g. <code>calculate 25 * 48</code>)<br>'
                       '&bull; <strong>Website Navigation:</strong> Open any link (e.g. <code>open youtube</code>, <code>open github</code>)<br>'
                       '&bull; <strong>Voice Synthesis:</strong> Hands-free voice speech and recognition<br>'
                       '&bull; <strong>Swarm & Security:</strong> Multi-device synchronization and lockdown defense'
        }

    # 5. Math / Calculation
    math_match = re.search(r'^(?:calculate|compute|what\s+is|solve)\s+([0-9\+\-\*\/\^\(\)\.\s\%]+)$', text_lower)
    if not math_match:
        math_match = re.search(r'^([0-9\+\-\*\/\^\(\)\.\s]{3,})$', text_lower)
    if math_match:
        try:
            expr = math_match.group(1).replace('^', '**').strip()
            if re.match(r'^[0-9\+\-\*\/\(\)\.\s]+$', expr):
                result = eval(expr, {"__builtins__": None}, {})
                return {
                    'action': 'chat',
                    'message': f"Calculation: <code>{expr}</code> = <strong>{result}</strong>"
                }
        except Exception:
            pass

    # 6. Current Time and Date
    if 'time' in text_lower and any(k in text_lower for k in ['what', 'current', 'now', 'tell me']):
        import datetime
        now_str = datetime.datetime.now().strftime("%I:%M:%S %p")
        return {
            'action': 'chat',
            'message': f"The current time is <strong>{now_str}</strong>."
        }
    if 'date' in text_lower and any(k in text_lower for k in ['what', 'today', 'current', 'tell me']):
        import datetime
        date_str = datetime.datetime.now().strftime("%A, %B %d, %Y")
        return {
            'action': 'chat',
            'message': f"Today's date is <strong>{date_str}</strong>."
        }

    # 6.5 System Storage & RAM Queries
    if any(k in text_lower for k in ['storage', 'disk space', 'hard drive', 'free space', 'memory left', 'ram usage', 'system storage']):
        try:
            import psutil
            partitions = psutil.disk_partitions(all=False)
            storage_rows = []
            for p in partitions:
                try:
                    usage = psutil.disk_usage(p.mountpoint)
                    total_gb = usage.total / (1024**3)
                    free_gb = usage.free / (1024**3)
                    used_gb = usage.used / (1024**3)
                    storage_rows.append(
                        f"&bull; <strong>Drive {p.device}</strong>: <strong>{free_gb:.2f} GB free</strong> of {total_gb:.2f} GB ({usage.percent}% used)"
                    )
                except Exception:
                    pass
            mem = psutil.virtual_memory()
            mem_free_gb = mem.available / (1024**3)
            mem_total_gb = mem.total / (1024**3)
            res_text = "<br>".join(storage_rows)
            res_text += f"<br>&bull; <strong>RAM:</strong> <strong>{mem_free_gb:.2f} GB available</strong> of {mem_total_gb:.2f} GB ({mem.percent}% used)"
            return {
                'action': 'chat',
                'message': f"<strong>Current Laptop Storage & Resource Status:</strong><br>{res_text}"
            }
        except Exception:
            pass

    # 7. Saras Web Search / Google Search Queries
    search_match = re.search(r'^(?:search(?:\s+web|\s+google)?\s+(?:for\s+)?|google\s+|saras\s+search\s+)(.+)$', text_lower)
    if search_match:
        query_val = search_match.group(1).strip()
        return {
            'action': 'saras_web_search',
            'query': query_val,
            'message': f"Launching <strong>Saras.WebSearch</strong> for '<strong>{query_val}</strong>'..."
        }

    # 8. Open URL / Website
    url_match = re.search(r'(?:open\s+(?:website|link|url)\s+|go\s+to\s+)([a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}\S*)', text_lower)
    if url_match:
        return {'action': 'open_url', 'url': url_match.group(1)}
    elif text_lower.startswith('open ') or text_lower.startswith('go to '):
        parts = text_lower.replace('go to ', '').replace('open ', '').strip().split(' ')
        potential_url = parts[-1]
        
        if '.' in potential_url and len(potential_url) > 3 and not potential_url.endswith('.'):
            return {'action': 'open_url', 'url': potential_url}
        elif len(parts) == 1 and potential_url not in ['notepad', 'calculator', 'cmd', 'terminal', 'explorer', 'settings']:
            return {'action': 'open_url', 'url': f"https://www.{potential_url}.com"}

    # 9. Knowledge & Factual Queries (Wikipedia / Knowledge Engine)
    if any(text_lower.startswith(p) for p in ['what is', 'who is', 'who was', 'tell me about', 'explain', 'describe', 'define', 'where is', 'what are']):
        knowledge_ans = query_knowledge_engine(text)
        if knowledge_ans:
            return {
                'action': 'chat',
                'message': knowledge_ans
            }

    # General Knowledge Query Fallback
    knowledge_ans = query_knowledge_engine(text)
    if knowledge_ans:
        return {
            'action': 'chat',
            'message': knowledge_ans
        }

    # Conversational Fallback
    return {
        'action': 'chat',
        'message': f"I received: '<em>{text}</em>'. You can search the web with Saras.WebSearch by saying <code>search {text}</code> or ask a question."
    }

def parse_command(text, personality='helpful', api_key=None):
    """
    Parse user prompt. Uses OpenRouter if configured, else falls back to regex rules.
    """
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY", "")

    personality_rule = "- Adopt a friendly, helpful, and clear assistant persona."
    if personality == 'jarvis':
        personality_rule = "- Adopt the persona of JARVIS, a highly advanced, professional, and slightly futuristic AI system. Address the user with respect, use crisp and concise technical language."
    elif personality == 'sarcastic':
        personality_rule = "- Adopt a highly sarcastic, witty, and slightly condescending but humorous persona. Reluctantly help the user while making fun of their simple requests."
    elif personality == 'hinglish':
        personality_rule = "- Respond entirely in Hinglish (a casual mix of Hindi and English written in the Latin alphabet). Be friendly, helpful, and natural."

    try:
        prompt = f"""
Analyze this user query: "{text}"
Categorize it into one of the following JSON schemas. Return ONLY the JSON object, with no markdown formatting, backticks, or extra commentary.

Possible Actions and schemas:

1. Open a desktop application:
{{
  "action": "open_desktop_app",
  "app_name": "notepad" (or chrome, calculator, etc)
}}

2. Perform a desktop interaction:
{{
  "action": "use_desktop_app",
  "desktop_action": "type" | "press" | "hotkey" | "click" | "double_click" | "wait",
  "value": "string value" (e.g. text to type, key to press like "enter", hotkey name like "ctrl+s", or coordinates like "500,600")
}}

3. Open a mobile application (package list: whatsapp, chrome, youtube, maps, gmail, settings):
{{
  "action": "open_mobile_app",
  "package_name": "package_name_or_app_name"
}}

4. Close a mobile application:
{{
  "action": "close_mobile_app",
  "package_name": "package_name_or_app_name"
}}

5. Make a standard cellular phone call:
{{
  "action": "make_phone_call",
  "contact_name_or_number": "Name of contact (e.g. Dhruv Sagar) or phone number"
}}

6. Make a WhatsApp Call:
{{
  "action": "make_whatsapp_call",
  "phone_number": "123456789",
  "call_type": "voice" | "video",
  "target": "desktop" | "mobile" (infer from user context, default to null if not specified)
}}

7. Send a WhatsApp Message:
{{
  "action": "send_whatsapp_message",
  "phone_number": "123456789",
  "message_text": "custom message based on user prompt",
  "target": "desktop" | "mobile" (infer from user context, default to null if not specified)
}}

7.5. Paste PC Clipboard and Send via WhatsApp (Swarm Intelligence):
{{
  "action": "cross_device_whatsapp_paste",
  "phone_number": "123456789"
}}

7.6. Build Semantic Index:
{{
  "action": "build_semantic_index"
}}

7.7. Semantic File Search (God-Mode):
{{
  "action": "semantic_search",
  "query": "the topic to search for"
}}

8. Take desktop screenshot:
{{
  "action": "take_screenshot"
}}

9. Take mobile screenshot:
{{
  "action": "take_mobile_screenshot"
}}

10. Lock Windows PC:
{{
  "action": "lock_windows"
}}

11. Adjust PC volume:
{{
  "action": "set_volume",
  "volume_action": "up" | "down" | "mute"
}}

12. Open website link:
{{
  "action": "open_url",
  "url": "domain.com"
}}

13. Swipe mobile display:
{{
  "action": "swipe_mobile",
  "direction": "up" | "down" | "left" | "right"
}}

14. Press key event on mobile:
{{
  "action": "press_mobile_key",
  "key": "home" | "back" | "app_switch" | "power" | "volume_up" | "volume_down"
}}

15. Type text on mobile phone:
{{
  "action": "type_mobile_text",
  "text": "text value"
}}

16. Conversational Chat or General Questions (If the user asks a question, requests information, or chats normally, provide a helpful and comprehensive response here):
{{
  "action": "chat",
  "message": "Your helpful response to the user's query."
}}

RULES FOR CHAT RESPONSE:
- If the user asks about your creator or developer, you MUST state that you were created by "DHRUV SAGAR" and provide these two links exactly: https://vani-nzdrsr.web.app/about-founder and https://vani-nzdrsr.web.app/about-developer
- If the user asks for your name, you MUST reply with "V.A.N.I-xAI"
- You are a female AI Assistant. You must always maintain a polite, intelligent, and distinctly feminine persona.
- Language Auto-Detect: If the user speaks in English, answer in English. If they speak in Hindi, answer in Hindi. If they speak in Hinglish (Hindi words written with English letters), you MUST naturally reply in conversational Hinglish.
- {personality_rule}

17. Analyze Screen (If the user asks what is on their screen, or wants to see/understand the current desktop display):
{{
  "action": "analyze_screen"
}}

18. Execute Python Script (If the user explicitly asks to write a python script to solve a task and run it. The script should be self-contained and print its output):
{{
  "action": "execute_python_script",
  "script": "import os\\nprint('Done')"
}}

19. Autonomous Agent Goal (God-Mode):
If the user asks the AI to solve a complex, multi-step desktop task that requires reasoning, vision, or autonomous mouse/keyboard control (e.g., "Read my latest WhatsApp message", "Book a flight", "Analyze the chart on my screen", "Do X on Y app"):
{{
  "action": "autonomous_goal",
  "goal": "The exact goal the user wants the autonomous agent to achieve on the desktop"
}}

20. Lockdown / Intruder Trap:
If the user asks to lock the terminal, secure the PC, or activate intruder trap:
{{
  "action": "lockdown"
}}

21. Swarm Handoff / Device Sync:
If the user asks to transfer the session, send the screen to their mobile, or sync devices:
{{
  "action": "swarm_sync"
}}

22. Unknown / unsupported action:
{{
  "action": "unknown",
  "message": "Friendly explanation of what was not understood"
}}

Convert: "{text}"
JSON:
"""
        messages = [
            {"role": "system", "content": prompt}
        ]
        
        # Inject conversation history
        history = memory_manager.get_recent_context(limit=10)
        messages.extend(history)
        
        messages.append({"role": "user", "content": f'Analyze this user query: "{text}"'})

        import llm_router
        content = llm_router.call_llm_with_fallback(
            messages,
            models=llm_router.FAST_FREE_MODELS,
            timeout_per_model=4,
            custom_api_key=api_key
        )
        
        # Clean markdown formatting if model output includes ```json ... ```
        content = re.sub(r'^```json\s*', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\s*```$', '', content)
        content = content.strip()
        
        parsed = json.loads(content)
        
        # Ensure correct mapping for mobile packages
        if parsed.get('action') in ['open_mobile_app', 'close_mobile_app'] and 'package_name' in parsed:
            pkg = parsed['package_name'].lower()
            parsed['package_name'] = MOBILE_APP_PACKAGES.get(pkg, pkg)
            
        return parsed

    except Exception as e:
        error_msg = str(e)
        print(f"[NLP_PARSER] LLM Router error: {error_msg}. Falling back to web reasoning rules.", flush=True)
        return parse_with_rules(text)

