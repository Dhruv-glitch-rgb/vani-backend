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

# Fastest free text/reasoning models
FAST_FREE_MODELS = [
    "poolside/laguna-xs-2.1:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "liquid/lfm-2.5-2.6b:free",
    "openrouter/free"
]

# Free models that support Vision
VISION_FREE_MODELS = [
    "openrouter/free",
    "google/lyria-3-clip-preview"
]

def _call_single_model(model, current_key, messages, timeout, require_json):
    log_router(f"Attempting model: {model} with Key ending in {current_key[-4:] if current_key else ''}")
    
    headers = {
        "Authorization": f"Bearer {current_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vani.ai", 
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

def call_llm_with_fallback(messages, models=None, timeout_per_model=5, require_json=False):
    """
    Concurrent Multi-Model Router.
    Fires requests to all models at the same time and returns the first successful response to maximize speed.
    """
    api_keys_raw = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_keys_raw or api_keys_raw == "your_api_key_here":
        raise ValueError("OPENROUTER_API_KEY is not set or is still the default placeholder in .env")
        
    api_keys = [k.strip() for k in api_keys_raw.split(',') if k.strip()]
    if not api_keys:
        raise ValueError("No valid API keys found in OPENROUTER_API_KEY")

    if models is None:
        models = FAST_FREE_MODELS
        
    futures = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(models)) as executor:
        for i, model in enumerate(models):
            current_key = api_keys[i % len(api_keys)]
            future = executor.submit(_call_single_model, model, current_key, messages, timeout_per_model, require_json)
            futures[future] = model
            
        last_error = None
        for future in concurrent.futures.as_completed(futures):
            model = futures[future]
            try:
                result = future.result()
                # Once we get the first successful result, cancel others (though ThreadPoolExecutor doesn't strictly cancel, 
                # we just return and ignore the rest)
                return result
            except Exception as e:
                last_error = str(e)
                # continue to wait for other models to complete
                
    log_router(f"All models failed. Last error: {last_error}")
    raise Exception(f"All models in fallback sequence failed. Last error: {last_error}")

