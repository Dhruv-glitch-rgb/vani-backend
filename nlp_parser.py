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

def parse_with_rules(text):
    """
    Fallback regex/rules-based parser when Gemini API is not configured.
    Returns a dictionary of action and parameters.
    """
    text_lower = text.lower().strip()

    # Advanced Jarvis-level shortcuts
    # 0.1 Lock Workstation
    if any(k in text_lower for k in ['lock workstation', 'lock windows', 'lock my pc', 'lock pc']):
        return {'action': 'lock_windows'}

    # 0.2 Screenshot
    if any(k in text_lower for k in ['mobile screenshot', 'screenshot of mobile', 'screenshot on mobile', 'screenshot of phone']):
        return {'action': 'take_mobile_screenshot'}
    elif any(k in text_lower for k in ['screenshot', 'capture screen', 'take a screen']):
        return {'action': 'take_screenshot'}

    # 0.3 System Volume
    if any(k in text_lower for k in ['volume up', 'increase volume', 'volume increase']):
        return {'action': 'set_volume', 'volume_action': 'up'}
    elif any(k in text_lower for k in ['volume down', 'decrease volume', 'volume decrease']):
        return {'action': 'set_volume', 'volume_action': 'down'}
    elif any(k in text_lower for k in ['mute volume', 'unmute volume', 'mute system', 'mute pc', 'mute', 'unmute']):
        return {'action': 'set_volume', 'volume_action': 'mute'}

    # 0.4 Open URL / Website
    url_match = re.search(r'(?:open\s+(?:website|link|url)\s+|go\s+to\s+)([a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}\S*)', text_lower)
    if url_match:
        return {'action': 'open_url', 'url': url_match.group(1)}
    elif text_lower.startswith('open ') or text_lower.startswith('go to '):
        parts = text_lower.replace('go to ', '').replace('open ', '').strip().split(' ')
        potential_url = parts[-1]
        
        # If it has a dot, treat as URL
        if '.' in potential_url and len(potential_url) > 3 and not potential_url.endswith('.'):
            return {'action': 'open_url', 'url': potential_url}
        # If it's a known website or a single word, treat as URL
        elif len(parts) == 1 and potential_url not in ['notepad', 'calculator', 'cmd', 'terminal', 'explorer', 'settings']:
            return {'action': 'open_url', 'url': f"https://www.{potential_url}.com"}
    
    # 1. WhatsApp Call
    # Match voice/video whatsapp calls. E.g. "whatsapp video call to 12345", "whatsapp call 12345"
    whatsapp_call_match = re.search(r'whatsapp\s+(video|voice)?\s*call\s+(?:to\s+)?(\+?[\d\s\-]+)', text_lower)
    if whatsapp_call_match:
        call_type = whatsapp_call_match.group(1) if whatsapp_call_match.group(1) else 'voice'
        phone_number = whatsapp_call_match.group(2).strip()
        target = 'desktop' if 'desktop' in text_lower else ('mobile' if 'mobile' in text_lower else None)
        return {
            'action': 'make_whatsapp_call',
            'phone_number': phone_number,
            'call_type': call_type,
            'target': target
        }
        
    # 2. WhatsApp Message
    # Match: "send whatsapp message to 12345 saying hello", "whatsapp message to 12345: hello", "whatsapp 12345 saying hello"
    whatsapp_msg_match = re.search(
        r'(?:send\s+)?whatsapp(?:\s+message)?\s+(?:to\s+)?(\+?[\d\s\-]+)\s+(?:saying|with|text)?\s*[:"\']?(.*?)["\']?$', 
        text_lower
    )
    if whatsapp_msg_match:
        phone_number = whatsapp_msg_match.group(1).strip()
        message_text = whatsapp_msg_match.group(2).strip()
        # Clean up any leading/trailing quote characters
        message_text = re.sub(r'^[:"\']+|[:"\']+$', '', message_text).strip()
        # Retrieve case-sensitive original message text from original user input if needed
        # but let's do a simple extract from original string to preserve casing
        start_idx = text.lower().find(message_text.lower())
        if start_idx != -1:
            message_text = text[start_idx:start_idx + len(message_text)]
            
        target = 'desktop' if 'desktop' in text_lower else ('mobile' if 'mobile' in text_lower else None)
        return {
            'action': 'send_whatsapp_message',
            'phone_number': phone_number,
            'message_text': message_text,
            'target': target
        }

    # 2.5 Cross-Device WhatsApp Paste
    clipboard_wa_match = re.search(
        r'(?:whatsapp|send)\s+(?:pc\s+)?(?:clipboard|link|text|screen)\s+(?:to\s+)?(\+?[\d\s\-]+)', 
        text_lower
    )
    if clipboard_wa_match:
        phone_number = clipboard_wa_match.group(1).strip()
        return {
            'action': 'cross_device_whatsapp_paste',
            'phone_number': phone_number
        }
        
    # 2.6 Semantic Search
    semantic_match = re.search(r'(?:find|search|where is).*(?:document|file|presentation|text).*(?:about|where i talked about|mentioning|related to)\s+(.*)', text_lower)
    if semantic_match:
        return {
            'action': 'semantic_search',
            'query': semantic_match.group(1).strip()
        }
    
    index_match = re.search(r'(?:build|create|start)\s+(?:semantic\s+)?index', text_lower)
    if index_match:
        return {'action': 'build_semantic_index'}

    # 3. Cellular Phone Call
    # Match: "call dhruv", "phone call to 12345", "dial dhruv sagar"
    phone_call_match = re.search(r'\b(?:call|phone\s+call\s+to|dial)\s+(.+)$', text_lower)
    if phone_call_match:
        target = phone_call_match.group(1).strip()
        # Remove extra words if any
        target = re.sub(r'\b(on\s+desktop|on\s+mobile|now)\b', '', target).strip()
        return {
            'action': 'make_phone_call',
            'contact_name_or_number': target
        }

    # 4. Open Mobile App
    # Match: "open chrome on mobile", "open mobile app youtube"
    open_mobile_match = re.search(r'open\s+(?:mobile\s+app\s+)?(\w+)(?:\s+on\s+mobile)?', text_lower)
    if open_mobile_match and ('on mobile' in text_lower or 'mobile app' in text_lower):
        app_name = open_mobile_match.group(1)
        package = MOBILE_APP_PACKAGES.get(app_name, app_name)
        return {
            'action': 'open_mobile_app',
            'package_name': package
        }

    # 5. Close Mobile App
    # Match: "close chrome on mobile", "close mobile app youtube"
    close_mobile_match = re.search(r'close\s+(?:mobile\s+app\s+)?(\w+)(?:\s+on\s+mobile)?', text_lower)
    if close_mobile_match and ('on mobile' in text_lower or 'mobile app' in text_lower):
        app_name = close_mobile_match.group(1)
        package = MOBILE_APP_PACKAGES.get(app_name, app_name)
        return {
            'action': 'close_mobile_app',
            'package_name': package
        }

    # 6. Desktop Automation actions
    # "type hello world", "press enter", "hotkey ctrl+c"
    if text_lower.startswith('type '):
        val = text[5:] # preserve case
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'type',
            'value': val
        }
    elif text_lower.startswith('press '):
        key = text_lower[6:]
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'press',
            'value': key
        }
    elif text_lower.startswith('hotkey ') or text_lower.startswith('press hotkey '):
        val = text_lower.replace('press hotkey ', '').replace('hotkey ', '')
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'hotkey',
            'value': val
        }
    elif text_lower.startswith('click') or text_lower.startswith('click at '):
        val = text_lower.replace('click at ', '').replace('click', '').strip()
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'click',
            'value': val if val else None
        }
    elif text_lower.startswith('double click') or text_lower.startswith('double click at '):
        val = text_lower.replace('double click at ', '').replace('double click', '').strip()
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'double_click',
            'value': val if val else None
        }
    elif text_lower.startswith('wait ') or text_lower.startswith('sleep '):
        val = text_lower.split()[-1]
        return {
            'action': 'use_desktop_app',
            'desktop_action': 'wait',
            'value': val
        }

    # 7. Open Desktop App
    # Match: "open chrome", "open notepad", "launch calculator"
    open_desktop_match = re.search(r'\b(?:open|launch)\s+([\w\s]+)', text_lower)
    if open_desktop_match:
        app_name = open_desktop_match.group(1).strip()
        return {
            'action': 'open_desktop_app',
            'app_name': app_name
        }

    # Unknown
    return {
        'action': 'unknown',
        'message': f"I couldn't parse the command '{text}'. Please try a supported command format."
    }

def parse_command(text, personality='helpful'):
    """
    Parse user prompt. Uses OpenRouter if configured, else falls back to regex rules.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    personality_rule = "- Adopt a friendly, helpful, and clear assistant persona."
    if personality == 'jarvis':
        personality_rule = "- Adopt the persona of JARVIS, a highly advanced, professional, and slightly futuristic AI system. Address the user with respect, use crisp and concise technical language."
    elif personality == 'sarcastic':
        personality_rule = "- Adopt a highly sarcastic, witty, and slightly condescending but humorous persona. Reluctantly help the user while making fun of their simple requests."

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
            timeout_per_model=4
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
        print(f"[NLP_PARSER] LLM Router error: {error_msg}. Falling back to rules.", flush=True)
        fallback = parse_with_rules(text)
        if fallback.get('action') == 'unknown':
            if "rate-limited" in error_msg.lower() or "429" in error_msg:
                return {
                    'action': 'unknown',
                    'message': "The AI models are currently rate-limited. Please try again shortly or use exact command phrases (like 'take screenshot')."
                }
            return {
                'action': 'unknown',
                'message': f"AI Provider Error. Please use an exact command phrase."
            }
        return fallback

