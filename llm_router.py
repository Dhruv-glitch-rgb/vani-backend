import os
import json
import urllib.request
import urllib.error
import time

def log_router(msg):
    try:
        import logger
        logger.log_status('ROUTER', msg)
    except:
        print(f"[ROUTER] {msg}")

# Fastest free text/reasoning models
FAST_FREE_MODELS = [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3.5-lightning:free",
    "liquid/lfm-2.5-2.6b:free"
]

# Free models that support Vision
VISION_FREE_MODELS = [
    "openrouter/free",
    "google/lyria-3-clip-preview"
]

def call_llm_with_fallback(messages, models=None, timeout_per_model=5, require_json=False):
    """
    Cascading Multi-Model Router.
    Tries each model in sequence. If a model fails, times out, or gets rate-limited,
    it instantly switches to the next model in the list.
    """
    api_keys_raw = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_keys_raw or api_keys_raw == "your_api_key_here":
        raise ValueError("OPENROUTER_API_KEY is not set or is still the default placeholder in .env")
        
    # Split by comma if the user provides multiple keys (e.g., key1,key2,key3)
    api_keys = [k.strip() for k in api_keys_raw.split(',') if k.strip()]
    if not api_keys:
        raise ValueError("No valid API keys found in OPENROUTER_API_KEY")

    last_error = None
    
    # We will loop through the models, and for each model, try an API key. 
    # If a key is rate-limited, we can switch to the next key.
    if models is None:
        models = FAST_FREE_MODELS
        
    for i, model in enumerate(models):
        current_key = api_keys[i % len(api_keys)] # Rotate keys across models
        log_router(f"Attempting model [{i+1}/{len(models)}]: {model} with Key #{i % len(api_keys) + 1}")
        
        headers = {
            "Authorization": f"Bearer {current_key}",
            "Content-Type": "application/json",
            # Optional routing preferences for OpenRouter
            "HTTP-Referer": "https://vani.ai", 
            "X-Title": "V.A.N.I-xAI"
        }

        payload = {
            "model": model,
            "messages": messages
        }
        
        # Explicit JSON request for some models (if supported, else we rely on prompt engineering)
        if require_json:
            payload["response_format"] = {"type": "json_object"}

        req = urllib.request.Request(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            data=json.dumps(payload).encode('utf-8')
        )
        
        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout_per_model) as response:
                data = json.loads(response.read().decode('utf-8'))
                content = data['choices'][0]['message']['content'].strip()
                elapsed = time.time() - start_time
                log_router(f"Success with {model} in {elapsed:.2f}s")
                return content
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
            log_router(f"HTTP {e.code} Error on {model}: {error_body}")
            last_error = f"HTTP {e.code}"
        except urllib.error.URLError as e:
            log_router(f"Timeout/Network Error on {model}: {e.reason}")
            last_error = "Timeout"
        except Exception as e:
            log_router(f"Unexpected Error on {model}: {str(e)}")
            last_error = str(e)
            
        # If it failed, loop continues to next model
        
    log_router(f"All models failed. Last error: {last_error}")
    raise Exception(f"All models in fallback sequence failed. Last error: {last_error}")
