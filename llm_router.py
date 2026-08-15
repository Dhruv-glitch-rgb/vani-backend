import os
import json
import urllib.request
import urllib.error
import time
import concurrent.futures

def log_router(msg):
    try:
        import logger
        logger.log_status('ROUTER', msg)
    except:
        print(f"[ROUTER] {msg}")

# Fastest free text/reasoning models (prioritized by lowest latency)
FAST_FREE_MODELS = [
    "liquid/lfm-2.5-2.6b:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "poolside/laguna-xs-2.1:free",
    "cohere/north-mini-code:free",
    "google/gemma-4-26b-a4b-it:free",
    "openrouter/free"
]

# Free models that support Vision
VISION_FREE_MODELS = [
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "openrouter/free",
    "google/lyria-3-clip-preview"
]

def _call_single_model(model, current_key, messages, timeout, require_json):
    log_router(f"Attempting model: {model} with Key ending in ...{current_key[-4:] if current_key else ''}")
    
    headers = {
        "Authorization": f"Bearer {current_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vani-nzdrsr.web.app", 
        "X-Title": "V.A.N.I-xAI"
    }

    payload = {
        "model": model,
        "messages": messages
    }
    
    if require_json:
        payload["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        data=json.dumps(payload).encode('utf-8')
    )
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode('utf-8'))
            content = data['choices'][0]['message']['content'].strip()
            elapsed = time.time() - start_time
            log_router(f"Success with {model} in {elapsed:.2f}s")
            return content
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
        log_router(f"HTTP {e.code} Error on {model}: {error_body}")
        raise Exception(f"HTTP {e.code}")
    except urllib.error.URLError as e:
        log_router(f"Timeout/Network Error on {model}: {e.reason}")
        raise Exception("Timeout")
    except Exception as e:
        log_router(f"Unexpected Error on {model}: {str(e)}")
        raise e

def _call_gemini_model(key, messages, timeout):
    log_router(f"Attempting Gemini 1.5 Flash Direct API with Key ending in ...{key[-4:] if key else ''}")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    contents = []
    for msg in messages:
        role = "user" if msg.get("role") in ["user", "system"] else "model"
        c = msg.get("content", "")
        if isinstance(c, list):
            c = " ".join([p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text"])
        contents.append({"role": role, "parts": [{"text": str(c)}]})
    
    payload = {"contents": contents}
    req = urllib.request.Request(
        url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode('utf-8')
    )
    start_time = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = json.loads(response.read().decode('utf-8'))
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                content = parts[0].get("text", "").strip()
                elapsed = time.time() - start_time
                log_router(f"Success with Gemini Direct API in {elapsed:.2f}s")
                return content
    raise Exception("Empty Gemini response")

def call_llm_with_fallback(messages, models=None, timeout_per_model=5, require_json=False, custom_api_key=None):
    """
    Concurrent Multi-Model Router.
    Fires requests to all models at the same time and returns the first successful response to maximize speed.
    """
    # 1. Check if Gemini Key is available
    gemini_key = custom_api_key if (custom_api_key and custom_api_key.startswith("AIza")) else os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    if gemini_key and gemini_key.strip() and gemini_key != "your_gemini_api_key_here":
        try:
            return _call_gemini_model(gemini_key.strip(), messages, timeout_per_model)
        except Exception as ge:
            log_router(f"Gemini direct call failed: {ge}. Continuing with OpenRouter pool...")

    # 2. OpenRouter Key Pool
    if custom_api_key and custom_api_key.strip() and not custom_api_key.startswith("AIza"):
        fallback_api_keys = [custom_api_key.strip()]
    else:
        api_keys_raw = os.environ.get("OPENROUTER_API_KEY", "").strip()
        fallback_api_keys = [k.strip() for k in api_keys_raw.split(',') if k.strip()] if api_keys_raw else []

    if models is None:
        models = FAST_FREE_MODELS
        
    futures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(models)) as executor:
        for i, item in enumerate(models):
            if isinstance(item, tuple):
                model_name, dedicated_key = item
                key_to_use = custom_api_key if (custom_api_key and not custom_api_key.startswith("AIza")) else dedicated_key
            else:
                model_name = item
                key_to_use = custom_api_key if (custom_api_key and not custom_api_key.startswith("AIza")) else (fallback_api_keys[i % len(fallback_api_keys)] if fallback_api_keys else None)
                
            if not key_to_use:
                continue
                
            future = executor.submit(_call_single_model, model_name, key_to_use, messages, timeout_per_model, require_json)
            futures[future] = model_name
            
        last_error = None
        for future in concurrent.futures.as_completed(futures):
            model_name = futures[future]
            try:
                result = future.result()
                return result
            except Exception as e:
                last_error = str(e)
                
    log_router(f"All models failed. Last error: {last_error}")
    raise Exception(f"All models in fallback sequence failed. Last error: {last_error}")

