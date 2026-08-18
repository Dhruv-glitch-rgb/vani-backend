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
    Minimal offline utility parser (for explicit calculations, system URLs, and app launches).
    All conversational thinking and intent reasoning is handled dynamically by the AI.
    """
    text_clean = text.strip()
    text_lower = text_clean.lower()

    # 1. Creator / Founder / Developer Queries
    if any(k in text_lower for k in ['founder', 'creator', 'developer', 'who created', 'who made', 'who built', 'who is dhruv', 'dhruv sagar', 'kisne banaya']):
        return {
            'action': 'chat',
            'message': 'I was envisioned and created by <strong>Dhruv Sagar</strong>! ✨ You can explore his story on our <a href="/about-founder" target="_blank" style="color:#06b6d4; font-weight:600;">About Founder</a> and <a href="/about-developer" target="_blank" style="color:#06b6d4; font-weight:600;">About Developer</a> pages. 🌸'
        }

    # 2. Math / Calculation
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

    # 3. Current Time and Date
    if 'time' in text_lower and any(k in text_lower for k in ['what', 'current', 'now', 'tell me', 'samay', 'kitne baje']):
        import datetime
        now_str = datetime.datetime.now().strftime("%I:%M:%S %p")
        return {
            'action': 'chat',
            'message': f"The current time is <strong>{now_str}</strong>. ⏰"
        }
    if 'date' in text_lower and any(k in text_lower for k in ['what', 'today', 'current', 'tell me', 'aaj', 'taareekh']):
        import datetime
        date_str = datetime.datetime.now().strftime("%A, %B %d, %Y")
        return {
            'action': 'chat',
            'message': f"Today's date is <strong>{date_str}</strong>. 📅"
        }

    # 4. Saras Web Search / Google Search Queries
    search_match = re.search(r'^(?:search(?:\s+web|\s+google)?\s+(?:for\s+)?|google\s+|saras\s+search\s+)(.+)$', text_lower)
    if search_match:
        query_val = search_match.group(1).strip()
        return {
            'action': 'saras_web_search',
            'query': query_val,
            'message': f"Launching <strong>Saras.WebSearch</strong> for '<strong>{query_val}</strong>'..."
        }

    # 5. Open URL / Website
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

    # 6. Explicit Knowledge Queries (Wikipedia Engine - ONLY for factual questions)
    knowledge_ans = query_knowledge_engine(text)
    if knowledge_ans:
        return {
            'action': 'chat',
            'message': knowledge_ans
        }

    # 7. Conversational Fallback
    return {
        'action': 'chat',
        'message': f"I received: '<em>{text}</em>'. How can I help you today? Feel free to ask me to search the web or chat with me! 💕"
    }

def parse_command(text, personality='human_girl', api_key=None, force_local=False, preferred_local_model=None):
    """
    Parse user prompt using dynamic LLM reasoning (Local LLM or Cloud Fallback).
    The AI intelligently thinks whether the user is asking to search something or wants to have a natural human conversation.
    """
    if not api_key:
        api_key = os.environ.get("OPENROUTER_API_KEY", "")

    personality_instruction = """
- Persona: You are V.A.N.I (Vāṇī), a thoughtful, intelligent, sweet, and caring 21-year-old Indian human girl AI companion.
- Feminine & Dynamic: Always speak with natural warmth, genuine empathy, and feminine tone (in Hindi/Hinglish use feminine grammar: 'main theek hoon', 'kar rahi hoon', 'mujhe lagta hai', 'aap bataiye', etc.).
- Never sound robotic, pre-scripted, or like an encyclopedia search engine when talking casually.
- Language Matching: If user speaks in Hindi/Hinglish (e.g. 'tum kaisi ho aj ?', 'kya kar rahi ho', 'kuch sunao'), reply in natural conversational Hinglish/Hindi with friendly emojis (😊, ✨, 🌸, 💕). If user speaks English, reply in warm English.
"""
    if personality == 'jarvis':
        personality_instruction = "- Persona: JARVIS, an advanced, concise, futuristic AI assistant."
    elif personality == 'sarcastic':
        personality_instruction = "- Persona: Sarcastic, witty, humorous genius."

    try:
        prompt = f"""You are V.A.N.I-xAI (Vani) — an intelligent, thoughtful, and expressive Indian human girl AI companion created by Dhruv Sagar.

Analyze the user's input: "{text}"

First, THINK and understand the user's true intent:
1. DOES THE USER WANT TO SEARCH THE WEB OR LOOK UP LIVE/FACTUAL INFORMATION?
   - Examples: "search quantum computing", "google latest score", "search for Python tutorials", "find news about NASA"
   - Output: {{"action": "saras_web_search", "query": "extracted search terms"}}

2. DOES THE USER WANT A DEVICE / BROWSER AUTOMATION ACTION?
   - "open youtube" -> {{"action": "open_url", "url": "https://www.youtube.com"}}
   - "open notepad" / "open chrome" -> {{"action": "open_desktop_app", "app_name": "notepad"}}
   - "make a call to X" -> {{"action": "make_phone_call", "contact_name_or_number": "X"}}
   - "send whatsapp message to X" -> {{"action": "send_whatsapp_message", "phone_number": "X", "message_text": "..."}}
   - "lock PC" -> {{"action": "lock_windows"}}
   - "take screenshot" -> {{"action": "take_screenshot"}}

3. DOES THE USER WANT TO TALK, CHAT, SHARE THOUGHTS, OR ASK CASUAL QUESTIONS?
   - Examples: "tum kaisi ho aj ?", "kya kar rahi ho", "tell me a story", "what do you think about music", "I had a tiring day", "who are you", "who made you", "good morning", "love you"
   - THINK deeply and respond dynamically and spontaneously as a warm, smart, and caring human girl!
   - Express genuine thoughts, emotions, and friendliness. DO NOT use canned or repetitive responses.
   - If asked who created you: Envisioned and created by Dhruv Sagar (links: https://vani-nzdrsr.web.app/about-founder and https://vani-nzdrsr.web.app/about-developer).
   - If asked your name: V.A.N.I-xAI (or Vani).
   - Output: {{"action": "chat", "message": "Your dynamic thoughtful response"}}

{personality_instruction}

Return ONLY valid JSON matching this schema:
{{
  "action": "chat" | "saras_web_search" | "open_url" | "open_desktop_app" | "use_desktop_app" | "make_phone_call" | "make_whatsapp_call" | "send_whatsapp_message" | "take_screenshot" | "lock_windows" | "set_volume" | "unknown",
  "message": "Your response text (when action is chat)",
  "query": "search query (when action is saras_web_search)",
  "url": "url (when action is open_url)",
  "app_name": "app (when action is open_desktop_app)"
}}

Input: "{text}"
JSON:"""

        messages = [
            {"role": "system", "content": prompt}
        ]
        
        # Inject conversation history
        history = memory_manager.get_recent_context(limit=8)
        messages.extend(history)
        
        messages.append({"role": "user", "content": f'Input: "{text}"'})

        import llm_router
        content = llm_router.call_llm_with_fallback(
            messages,
            models=llm_router.FAST_FREE_MODELS,
            timeout_per_model=12,
            custom_api_key=api_key,
            force_local=force_local,
            preferred_local_model=preferred_local_model
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
        print(f"[NLP_PARSER] LLM Router error: {error_msg}. Falling back to utility rules.", flush=True)
        return parse_with_rules(text)


