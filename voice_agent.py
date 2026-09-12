"""
voice_agent.py
==============
Voice Agent and Speech Synthesis Module for V.A.N.I-xAI
Converts assistant responses to spoken speech via edge-tts or Windows SAPI/playsound.
Also saves synthesized speech to sovereign database (E:\BoVxAi DB).
"""

import os
import threading
import asyncio
import logger

VOICE = "en-IN-NeerjaNeural"  # Natural Indian English voice
ALT_VOICE = "hi-IN-SwaraNeural"  # Natural Hindi voice

def log_msg(msg):
    try:
        logger.log_status('VOICE_AGENT', msg)
    except Exception:
        print(f"[VOICE_AGENT] {msg}")

async def _synthesize_edge_tts(text, output_path, voice=VOICE):
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        return True
    except Exception as e:
        log_msg(f"Edge TTS error: {e}")
        return False

def speak_async(text, user_id="V.A.N.I-xAI-SYSTEM"):
    if not text or not text.strip():
        return

    # Strip HTML tags
    import re
    cleaned = re.sub(r'<[^>]+>', '', text).strip()
    if not cleaned:
        return

    try:
        # Determine language (Hindi vs English)
        is_hindi = any('\u0900' <= char <= '\u097f' for char in cleaned)
        voice_to_use = ALT_VOICE if is_hindi else VOICE

        workspace_dir = os.path.dirname(os.path.abspath(__file__))
        temp_file = os.path.join(workspace_dir, 'temp_speech.mp3')

        # Run edge_tts synthesis in new loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        success = loop.run_until_complete(_synthesize_edge_tts(cleaned, temp_file, voice_to_use))
        loop.close()

        if success:
            log_msg(f"Voice synthesized successfully: '{cleaned[:40]}...'")
            # Optionally archive in E:\BoVxAi DB
            try:
                import bovxai_db_manager
                with open(temp_file, 'rb') as af:
                    bovxai_db_manager.save_user_media(user_id, 'voice_notes', 'assistant_response.mp3', af.read())
            except Exception:
                pass
    except Exception as e:
        log_msg(f"Speech synthesis error: {e}")

def speak(text, user_id="V.A.N.I-xAI-SYSTEM"):
    t = threading.Thread(target=speak_async, args=(text, user_id), daemon=True)
    t.start()

def start_agent():
    log_msg("BoV Multimodal Voice Hub initialized and active.")
