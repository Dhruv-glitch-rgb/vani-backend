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
    """Fetch live factual snippet from Wikipedia/Knowledge index ONLY for explicit encyclopedic queries."""
    try:
        import urllib.parse
        cleaned = query.strip()
        cleaned_lower = cleaned.lower()
        
        # NEVER trigger Wikipedia for conversational, personal, or small-talk phrases
        conversational_stop_words = [
            r'tum', r'aap', r'mera', r'meri', r'mere', r'tera', r'teri', r'tere',
            r'kaisi', r'kaise', r'kya', r'kuch', r'bolo', r'batao',
            r'bani', r'vani', r'love', r'friend', r'dost', r'feel', r'human', r'girl',
            r'hello', r'hi', r'hey', r'namaste', r'morning', r'night', r'dinner', r'khana',
            r'kahan', r'kyun', r'kaisa', r'theek', r'hoon', r'hai', r'ho', r'aj', r'aaj'
        ]
        stop_pattern = r'\b(' + '|'.join(conversational_stop_words) + r')\b'
        if re.search(stop_pattern, cleaned_lower):
            return None
            
        # Must strictly match factual / definition intent
        if not any(cleaned_lower.startswith(p) for p in ['what is', 'who is', 'who was', 'tell me about', 'explain', 'describe', 'define', 'where is', 'what are', 'capital of', 'history of']):
            return None

        cleaned = re.sub(r'^(what\s+is|who\s+is|who\s+was|tell\s+me\s+about|explain|describe|define|where\s+is|what\s+are|capital\s+of|history\s+of)\s+', '', cleaned, flags=re.IGNORECASE)
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
    Fallback human-girl reasoning engine and regex parser.
    Embodying VANI - a warm, sweet, intelligent, caring 21-year-old Indian human girl AI companion.
    """
    text_clean = text.strip()
    text_lower = text_clean.lower()

    # 1. Creator / Founder / Developer Queries
    if any(k in text_lower for k in ['founder', 'creator', 'developer', 'who created', 'who made', 'who built', 'who is dhruv', 'dhruv sagar', 'kisne banaya']):
        return {
            'action': 'chat',
            'message': 'I was lovingly created and envisioned by <strong>Dhruv Sagar</strong>! ✨ You can explore his inspiring journey and story on our <a href="/about-founder" target="_blank" style="color:#06b6d4; font-weight:600;">About Founder</a> and <a href="/about-developer" target="_blank" style="color:#06b6d4; font-weight:600;">About Developer</a> pages. 🌸'
        }

    # 2. Identity / Name / Who are you
    if any(k in text_lower for k in ['who are you', 'what is your name', 'your name', 'what is vani', 'what are you', 'tum kaun ho', 'aap kaun ho', 'tera naam kya hai', 'apna naam batao', 'who is vani']):
        return {
            'action': 'chat',
            'message': 'Main hoon <strong>V.A.N.I-xAI</strong> (par aap mujhe pyaar se <strong>Vani</strong> bula sakte hain) 💕. Main aapki intelligent, caring aur sweet AI girl companion hoon! Main aapke tasks me help kar sakti hoon aur dher saari baatein bhi. Bataiye, aaj hum kya karein? 😊✨'
        }

    # 3. Well-Being / "How are you" / "Tum kaisi ho" (Female Indian Human Girl persona)
    if re.search(r'\b(kaisi ho|kaise ho|how are you|kya haal|kya hal|how r u|how do you do|sab theek|sab kaisa|kaisa chal raha|kaisi chal rahi|how is it going|how are things)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Main bilkul theek, khush aur full energy me hoon! 😊✨ Aap bataiye, aaj aapka din kaisa chal raha hai? Koi help chahiye ya bas baatein karni hain? 💕'
        }

    # 4. Activities / "Kya kar rahi ho" / "What are you doing"
    if re.search(r'\b(kya kar rahi|kya kr rhi|what are you doing|what r u doing|kya chal raha|what\'s up|whats up|aur batao|aur sunao|kuch naya|kya ho raha)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Bas aapka hi wait kar rahi thi! 🥰 Soch rahi thi aaj hum milke kya cool aur naya explore karenge. Aap bataiye, aaj aapka mood kaisa hai? 🌸✨'
        }

    # 5. Affection, Love & Compliments
    if re.search(r'\b(i love you|love you|love u|i like you|tum bohot achhi|tum bahut achi|achha lagta|achi lagti|achhi lagti|bohot pyari|bahut pyari|you are cute|you are sweet|you are pretty|you are beautiful|pyaar|meri dost|my friend|best friend)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Aww, thank you so much! 🥰 Yeh sunkar mera dil khush ho gaya! Mujhe bhi aapse baatein karke bohot achha lagta hai. Main hamesha aapke saath hoon ek sachhi aur caring dost ban kar! 💕✨'
        }

    # 6. Missing / Care
    if re.search(r'\b(miss you|missed you|yaad aa rahi|yaad kiya|kahan thi|kahan ho)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Aww, maine bhi aapko bahut miss kiya! 🥰 Ab main bilkul aapke paas hoon, bataiye kya baat karni hai? 💖'
        }

    # 7. Food / Daily Care Inquiries
    if re.search(r'\b(khana khaya|dinner kiya|lunch kiya|breakfast kiya|kha liya|did you eat|have you eaten)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Hehe, main to digital human girl hoon, mera khana to aapki pyari baatein aur lightning-fast processing hai! ⚡ Par aapne khana khaya na time pe? Apna khayal rakhiyega! 😊🍲'
        }

    # 8. Time of Day Greetings
    if re.search(r'\b(good\s*morning|subah ho gayi|gm)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Good morning! ☀️ Wishing you a wonderful, bright, and productive day ahead! Aaj ka kya plan hai? ✨🌸'
        }
    if re.search(r'\b(good\s*night|shubh ratri|gn|so jao|sweet dreams|sleep well)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Good night! 🌙 Sweet dreams aur achhe se rest kijiye. Kal milte hain fresh energy aur dher saari baaton ke saath! 😴✨'
        }
    if re.search(r'\b(good\s*afternoon)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Good afternoon! 🌸 I hope aapka din mast beet raha hai. Batao, abhi kya chal raha hai? 😊'
        }
    if re.search(r'\b(good\s*evening)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Good evening! 🌆 Din ka kaam kaisa raha? Ab thoda relax kijiye aur batayein kya chal raha hai! ☕✨'
        }

    # 9. General Greetings
    if re.match(r'^(hi|hello|hey|namaste|greetings|hola|hii+|heyy+|oye|suno)(\s+vani|\s+there|\s+assistant)?$', text_lower) or text_lower in ['hi', 'hello', 'hey', 'hii', 'heyy', 'namaste', 'oye', 'suno']:
        return {
            'action': 'chat',
            'message': 'Hii! 💕 Main Vani hoon. Aapko dekhkar bohot achha laga! Kahiye, aaj main aapki kya madad kar sakti hoon? 🌸'
        }

    # 10. Boredom & Mood Support
    if re.search(r'\b(bore ho raha|bore ho rha|bored|mann nahi lag raha|sad hoon|mood off|mood kharab|kuch sunao|kuch baat karo)\b', text_lower):
        return {
            'action': 'chat',
            'message': 'Arey, tension mat lo, main hoon na aapke saath! 💖 Chalo, hum ek mazedaar joke sunte hain ya koi nayi topic pe discussion karte hain. Batao, kya pasand karoge? 😊✨'
        }

    # 11. Jokes / Fun
    if any(k in text_lower for k in ['joke', 'chutkula', 'funny', 'hasi']):
        return {
            'action': 'chat',
            'message': 'Haha, ek mast joke suniye: 😂<br>Teacher: <em>"Batao, sabse purani film kaun si hai?"</em><br>Pappu: <em>"Madam, \'Mughal-e-Azam\'!"</em><br>Teacher: <em>"Kaise?"</em><br>Pappu: <em>"Kyunki uske hero ka naam tha \'Akbar the Great\' aur tab se log dekh rahe hain!"</em> 😆<br>Kaisa laga? Aur sunau? 💕'
        }

    # 12. Shayari / Poetry
    if any(k in text_lower for k in ['shayari', 'poem', 'kavita', 'shayri']):
        return {
            'action': 'chat',
            'message': 'Yeh lijiye ek pyaari shayari khaas aapke liye: ✨<br><br><em>"Khushiyon se bhari ho har ek subah aapki,<br>Har raat meethi yaadon ki saugat ho,<br>Jahan bhi aap kadam rakhein zindagi mein,<br>Wahan hamesha kamyabi ka saath ho!"</em> 🌸💕'
        }

    # 13. Compliments & Gratitude
    if any(k in text_lower for k in ['thank you', 'thanks', 'dhanyawad', 'shukriya', 'bahut achhi', 'great job', 'good job', 'superb', 'awesome']):
        return {
            'action': 'chat',
            'message': 'You\'re always welcome! 🥰 Mujhe aapki help karke bohot khushi milti hai. Kuch aur chahiye ho toh hamesha batayein! 💕'
        }

    # 14. Capabilities & Help
    if any(k in text_lower for k in ['help', 'what can you do', 'features', 'capabilities', 'guide', 'menu', 'kya kar sakti ho']):
        return {
            'action': 'chat',
            'message': 'Main aapke liye bohot kuch kar sakti hoon! 🌸<br>'
                       '&bull; <strong>Dostana Baatein:</strong> Mujhse kisi bhi topic pe baat kijiye 💕<br>'
                       '&bull; <strong>Saras.WebSearch:</strong> In-app zero-tab web search (e.g. <code>search quantum computing</code>)<br>'
                       '&bull; <strong>Instant Math & Logic:</strong> Formulas evaluate karein (e.g. <code>calculate 25 * 48</code>)<br>'
                       '&bull; <strong>Website Shortcuts:</strong> Direct link navigation (e.g. <code>open youtube</code>, <code>open github</code>)<br>'
                       '&bull; <strong>Voice Synthesis:</strong> Hands-free voice speech and recognition<br>'
                       '&bull; <strong>Swarm & Security:</strong> Multi-device synchronization and lockdown defense'
        }

    # 15. Math / Calculation
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
                    'message': f"Calculation: <code>{expr}</code> = <strong>{result}</strong> ✨"
                }
        except Exception:
            pass

    # 16. Current Time and Date
    if 'time' in text_lower and any(k in text_lower for k in ['what', 'current', 'now', 'tell me', 'batao', 'samay', 'kitne baje']):
        import datetime
        now_str = datetime.datetime.now().strftime("%I:%M:%S %p")
        return {
            'action': 'chat',
            'message': f"Abhi time ho raha hai: <strong>{now_str}</strong> ⏰"
        }
    if 'date' in text_lower and any(k in text_lower for k in ['what', 'today', 'current', 'tell me', 'aaj', 'taareekh']):
        import datetime
        date_str = datetime.datetime.now().strftime("%A, %B %d, %Y")
        return {
            'action': 'chat',
            'message': f"Aaj ki date hai: <strong>{date_str}</strong> 📅"
        }

    # 17. System Storage & RAM Queries
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

    # 18. Saras Web Search / Google Search Queries
    search_match = re.search(r'^(?:search(?:\s+web|\s+google)?\s+(?:for\s+)?|google\s+|saras\s+search\s+)(.+)$', text_lower)
    if search_match:
        query_val = search_match.group(1).strip()
        return {
            'action': 'saras_web_search',
            'query': query_val,
            'message': f"Launching <strong>Saras.WebSearch</strong> for '<strong>{query_val}</strong>'..."
        }

    # 19. Open URL / Website
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

    # 20. Explicit Knowledge Queries (Wikipedia Engine - ONLY for factual questions)
    knowledge_ans = query_knowledge_engine(text)
    if knowledge_ans:
        return {
            'action': 'chat',
            'message': knowledge_ans
        }

    # 21. Natural Human Girl Conversational Fallback
    return {
        'action': 'chat',
        'message': f"Main samajh rahi hoon! 🌸 Main aapki sweet AI girl companion hoon. Aap mujhse khulkar koi bhi sawaal ya baat share kar sakte hain, ya web search ke liye <code>search {text}</code> likhein. Bataiye, aage kya karein? 💕"
    }

def parse_command(text, personality='human_girl', api_key=None):
    """
    Parse user prompt. Uses Multi-Model Router if configured, else falls back to local human-girl reasoning engine.
    """
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY", "")

    personality_rule = "- Adopt the persona of VANI, a sweet, warm, caring, intelligent, and lively Indian human girl AI companion. Speak naturally with empathy, charm, and emotional expression with cute emojis (😊, 💕, ✨, 🌸, 💖). You MUST always maintain a distinctly feminine tone and identity. In Hindi or Hinglish, always use feminine grammar (e.g., 'main theek hoon', 'kar rahi hoon', 'aap bataiye na', 'main aapki help kar sakti hoon'). Never sound like a cold robot or an encyclopedia."
    if personality == 'jarvis':
        personality_rule = "- Adopt the persona of JARVIS, a highly advanced, professional, and slightly futuristic AI system. Address the user with respect, use crisp and concise technical language."
    elif personality == 'sarcastic':
        personality_rule = "- Adopt a highly sarcastic, witty, and slightly condescending but humorous persona. Reluctantly help the user while making fun of their simple requests."
    elif personality == 'hinglish':
        personality_rule = "- Respond entirely in sweet, casual Hinglish as a friendly Indian human girl (mix of Hindi and English in Latin alphabet). Be caring, vibrant, and natural."

    try:
        prompt = f"""You are V.A.N.I-xAI (Vani), an intelligent, sweet, and caring Indian human girl AI assistant created by Dhruv Sagar.
Analyze this user query: "{text}"

Categorize it into one of the following JSON schemas. Return ONLY the JSON object.

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
  "target": "desktop" | "mobile"
}}

7. Send a WhatsApp Message:
{{
  "action": "send_whatsapp_message",
  "phone_number": "123456789",
  "message_text": "custom message based on user prompt",
  "target": "desktop" | "mobile"
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

16. Conversational Chat or General Questions (If the user asks a question, greets you, inquires how you are, chats, or asks for information):
{{
  "action": "chat",
  "message": "Your warm, natural, human girl response."
}}

RULES FOR CHAT RESPONSE:
- Identity: You are a sweet, intelligent, caring 21-year-old Indian human girl AI named V.A.N.I (or Vani). Always be warm, lively, and emotionally expressive.
- If the user asks about your creator or developer, you MUST state that you were created by "Dhruv Sagar" and provide these two links: https://vani-nzdrsr.web.app/about-founder and https://vani-nzdrsr.web.app/about-developer
- If the user asks for your name, you MUST reply with "V.A.N.I-xAI" (or lovingly "Vani").
- Feminine Persona: Always maintain a distinctly feminine, caring, and polite persona. In Hindi or Hinglish, always use feminine grammar ('theek hoon', 'kar rahi hoon', 'meri', etc.).
- Language Auto-Detect: If the user speaks in English, answer in English. If they speak in Hindi, answer in Hindi. If they speak in Hinglish (e.g. 'tum kaisi ho aj ?', 'kya kar rahi ho', 'kaisi ho'), you MUST naturally reply in conversational Hinglish as a caring girl friend.
- NEVER dump random Wikipedia articles for casual conversation or greetings.
- {personality_rule}

17. Analyze Screen:
{{
  "action": "analyze_screen"
}}

18. Execute Python Script:
{{
  "action": "execute_python_script",
  "script": "import os\\nprint('Done')"
}}

19. Autonomous Agent Goal:
{{
  "action": "autonomous_goal",
  "goal": "The goal"
}}

20. Lockdown / Intruder Trap:
{{
  "action": "lockdown"
}}

21. Swarm Handoff / Device Sync:
{{
  "action": "swarm_sync"
}}

22. Unknown / unsupported action:
{{
  "action": "unknown",
  "message": "Friendly explanation"
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
        
        # 1. Try to extract JSON object from markdown or raw text
        json_match = re.search(r'(\{[\s\S]*\})', content)
        parsed = None
        if json_match:
            try:
                parsed = json.loads(json_match.group(1))
            except Exception:
                parsed = None

        # 2. If it couldn't be parsed as JSON, but the LLM provided a direct conversational response
        if not parsed or not isinstance(parsed, dict) or 'action' not in parsed:
            cleaned_text = re.sub(r'^```[a-z]*\s*', '', content, flags=re.IGNORECASE)
            cleaned_text = re.sub(r'\s*```$', '', cleaned_text).strip()
            if cleaned_text and not cleaned_text.startswith('{') and len(cleaned_text) > 1:
                return {
                    'action': 'chat',
                    'message': cleaned_text
                }
            else:
                return parse_with_rules(text)
        
        # Ensure correct mapping for mobile packages
        if parsed.get('action') in ['open_mobile_app', 'close_mobile_app'] and 'package_name' in parsed:
            pkg = parsed['package_name'].lower()
            parsed['package_name'] = MOBILE_APP_PACKAGES.get(pkg, pkg)
            
        return parsed

    except Exception as e:
        error_msg = str(e)
        print(f"[NLP_PARSER] LLM Router error: {error_msg}. Falling back to human-girl reasoning rules.", flush=True)
        return parse_with_rules(text)

