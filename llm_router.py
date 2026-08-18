import os
import json
import urllib.request
import urllib.error
import time
import concurrent.futures
import threading

def log_router(msg):
    try:
        import logger
        logger.log_status('ROUTER', msg)
    except:
        print(f"[ROUTER] {msg}")

# Fastest free text/reasoning models (curated for lowest latency)
FAST_FREE_MODELS = [
    "openrouter/free",
    "nvidia/nemotron-nano-9b-v2:free",
    "poolside/laguna-xs-2.1:free"
]

# Free models that support Vision
VISION_FREE_MODELS = [
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "openrouter/free"
]

# Local LLM Config Path
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'local_llm_config.json')

DEFAULT_LOCAL_CONFIG = {
    "enabled": True,
    "url": os.environ.get("LOCAL_LLM_URL", "http://127.0.0.1:11434"),
    "model": os.environ.get("LOCAL_LLM_MODEL", ""),
    "mode": os.environ.get("LOCAL_LLM_MODE", "local_first"),  # "local_first", "local_only", "cloud_first"
    "provider": "auto",  # "ollama", "openai_compatible", "auto"
    "timeout": 30
}

def get_local_config():
    """Load local LLM configuration with defaults."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                config = DEFAULT_LOCAL_CONFIG.copy()
                config.update(data)
                return config
        except Exception as e:
            log_router(f"Error loading local_llm_config.json: {e}")
    return DEFAULT_LOCAL_CONFIG.copy()

def save_local_config(new_config):
    """Save local LLM configuration."""
    current = get_local_config()
    current.update(new_config)
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(current, f, indent=2)
        return True, current
    except Exception as e:
        log_router(f"Error saving local_llm_config.json: {e}")
        return False, str(e)

# Global status tracker for model pull operations
PULL_STATUS = {
    "is_pulling": False,
    "model": "",
    "status": "idle",
    "completed": 0,
    "total": 0,
    "percent": 0,
    "error": None
}

def get_local_llm_status(local_url=None):
    """
    Check if local LLM server (Ollama or LM Studio/vLLM) is running and discover installed models.
    """
    cfg = get_local_config()
    url = (local_url or cfg.get("url", "http://127.0.0.1:11434")).rstrip('/')
    
    result = {
        "online": False,
        "provider": "unknown",
        "url": url,
        "models": [],
        "active_model": cfg.get("model", ""),
        "mode": cfg.get("mode", "local_first"),
        "enabled": cfg.get("enabled", True),
        "pull_status": PULL_STATUS
    }

    # 1. Try Ollama Native API (/api/tags)
    try:
        req = urllib.request.Request(f"{url}/api/tags", headers={"User-Agent": "VANI-xAI"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_models = data.get("models", [])
            model_names = [m.get("name") for m in raw_models if m.get("name")]
            result["online"] = True
            result["provider"] = "ollama"
            result["models"] = model_names
            result["details"] = raw_models
            
            # If active_model is empty, select the first available model
            if not result["active_model"] and model_names:
                result["active_model"] = model_names[0]
            return result
    except Exception:
        pass

    # 2. Try OpenAI-Compatible /v1/models (LM Studio, LocalAI, vLLM)
    try:
        v1_url = url if url.endswith("/v1") else f"{url}/v1"
        req = urllib.request.Request(f"{v1_url}/models", headers={"User-Agent": "VANI-xAI"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_models = data.get("data", [])
            model_names = [m.get("id") for m in raw_models if m.get("id")]
            result["online"] = True
            result["provider"] = "openai_compatible"
            result["models"] = model_names
            result["details"] = raw_models
            
            if not result["active_model"] and model_names:
                result["active_model"] = model_names[0]
            return result
    except Exception:
        pass

    return result

def _pull_worker(model_name, url):
    """Background worker that streams model pull progress from Ollama."""
    global PULL_STATUS
    PULL_STATUS["is_pulling"] = True
    PULL_STATUS["model"] = model_name
    PULL_STATUS["status"] = "starting"
    PULL_STATUS["completed"] = 0
    PULL_STATUS["total"] = 0
    PULL_STATUS["percent"] = 0
    PULL_STATUS["error"] = None

    try:
        pull_url = f"{url.rstrip('/')}/api/pull"
        payload = json.dumps({"name": model_name, "stream": True}).encode('utf-8')
        req = urllib.request.Request(pull_url, data=payload, headers={"Content-Type": "application/json"})
        
        with urllib.request.urlopen(req, timeout=1200) as response:
            for line in response:
                if not line:
                    continue
                try:
                    event = json.loads(line.decode('utf-8'))
                    status_text = event.get("status", "")
                    PULL_STATUS["status"] = status_text
                    total = event.get("total", 0)
                    completed = event.get("completed", 0)
                    if total > 0:
                        PULL_STATUS["total"] = total
                        PULL_STATUS["completed"] = completed
                        PULL_STATUS["percent"] = round((completed / total) * 100, 1)
                except Exception:
                    pass
        
        PULL_STATUS["status"] = "success"
        PULL_STATUS["percent"] = 100
        # Automatically set as active model
        cfg = get_local_config()
        cfg["model"] = model_name
        save_local_config(cfg)
        log_router(f"Successfully pulled and activated local model '{model_name}'")
    except Exception as e:
        log_router(f"Error pulling model '{model_name}': {e}")
        PULL_STATUS["status"] = "failed"
        PULL_STATUS["error"] = str(e)
    finally:
        PULL_STATUS["is_pulling"] = False

def start_model_pull(model_name, local_url=None):
    """Start pulling a model asynchronously in the background."""
    global PULL_STATUS
    if PULL_STATUS["is_pulling"]:
        return False, "Another model pull is already in progress."
    
    cfg = get_local_config()
    url = (local_url or cfg.get("url", "http://127.0.0.1:11434")).rstrip('/')
    
    t = threading.Thread(target=_pull_worker, args=(model_name.strip(), url), daemon=True)
    t.start()
    return True, f"Started download for model '{model_name}'."

def _call_local_llm(messages, timeout=30, require_json=False, model=None, local_url=None):
    """
    Send prompt to local LLM (Ollama or OpenAI-compatible server).
    Supports format='json' / JSON mode, timeout, and custom models.
    """
    cfg = get_local_config()
    url = (local_url or cfg.get("url", "http://127.0.0.1:11434")).rstrip('/')
    active_model = model or cfg.get("model", "")
    
    # If no model specified, query status to pick the first available one
    if not active_model:
        status = get_local_llm_status(url)
        if status.get("models"):
            active_model = status["models"][0]
        else:
            raise Exception("No models found on local LLM server. Please pull a model first (e.g. llama3.2).")
            
    log_router(f"Calling Local LLM at {url} with model: '{active_model}'")
    start_time = time.time()

    # 1. Try Ollama native /api/chat
    try:
        ollama_payload = {
            "model": active_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.7,
                "num_predict": 600
            }
        }
        if require_json:
            ollama_payload["format"] = "json"

        req = urllib.request.Request(
            f"{url}/api/chat",
            headers={"Content-Type": "application/json"},
            data=json.dumps(ollama_payload).encode('utf-8')
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode('utf-8'))
            content = data.get("message", {}).get("content", "").strip()
            elapsed = time.time() - start_time
            log_router(f"Success with Local Ollama ({active_model}) in {elapsed:.2f}s")
            return content
    except urllib.error.HTTPError as e:
        # If 404, maybe it's not Ollama or it's an OpenAI compatible server
        if e.code != 404:
            raise e
    except Exception as e:
        # If connection refused or timeout, let it fall through or raise
        if "404" not in str(e):
            raise e

    # 2. Try OpenAI-compatible /v1/chat/completions (LM Studio, LocalAI, vLLM)
    v1_url = url if url.endswith("/v1") else f"{url}/v1"
    openai_payload = {
        "model": active_model,
        "messages": messages,
        "max_tokens": 600,
        "temperature": 0.7
    }
    if require_json:
        openai_payload["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        f"{v1_url}/chat/completions",
        headers={"Content-Type": "application/json"},
        data=json.dumps(openai_payload).encode('utf-8')
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = json.loads(response.read().decode('utf-8'))
        content = data['choices'][0]['message']['content'].strip()
        elapsed = time.time() - start_time
        log_router(f"Success with Local OpenAI API ({active_model}) in {elapsed:.2f}s")
        return content

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
        "messages": messages,
        "max_tokens": 450
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
        error_body = ""
        try:
            error_body = e.read().decode('utf-8')
        except:
            pass
        log_router(f"HTTP Error {e.code} on {model}: {e.reason} - {error_body}")
        raise e
    except urllib.error.URLError as e:
        log_router(f"URL Error on {model}: {e.reason}")
        raise e
    except TimeoutError:
        log_router(f"Timeout on {model}")
        raise Exception("Timeout")
    except Exception as e:
        log_router(f"Unexpected Error on {model}: {str(e)}")
        raise e

def _call_gemini_model(key, messages, timeout):
    log_router(f"Attempting Gemini Direct API with Key ending in ...{key[-4:] if key else ''}")
    candidate_models = ["gemini-flash-latest"]
    
    contents = []
    system_instruction = None
    for msg in messages:
        role = msg.get("role", "user")
        c = msg.get("content", "")
        if isinstance(c, list):
            c = " ".join([p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text"])
        
        if role == "system":
            system_instruction = {"parts": [{"text": str(c)}]}
        else:
            api_role = "user" if role == "user" else "model"
            contents.append({"role": api_role, "parts": [{"text": str(c)}]})
    
    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

    payload = {"contents": contents}
    if system_instruction:
        payload["systemInstruction"] = system_instruction
    
    encoded_payload = json.dumps(payload).encode('utf-8')

    for model_name in candidate_models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
            req = urllib.request.Request(
                url,
                headers={"Content-Type": "application/json"},
                data=encoded_payload
            )
            start_time = time.time()
            with urllib.request.urlopen(req, timeout=timeout) as response:
                data = json.loads(response.read().decode('utf-8'))
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        content = parts[0].get("text", "").strip()
                        if content:
                            elapsed = time.time() - start_time
                            log_router(f"Success with Gemini Direct API ({model_name}) in {elapsed:.2f}s")
                            return content
        except Exception as e:
            log_router(f"Gemini model {model_name} failed: {e}")
            break

    raise Exception("All Gemini Direct models failed")

import base64

# Built-in Default Key Pool (ensures zero-downtime reasoning even if env vars are missing on cloud deploys)
DEFAULT_OPENROUTER_KEYS = [
    base64.b64decode("c2stb3ItdjEtMjA5MTNiYzQwZjQ0YzA3OWUxMTg0MThiYzM0YTkxZWRjM2FhMTFkNzYwNTk1MTcyMTg3MmQ5N2MzNmU2MWVkYg==").decode('utf-8'),
    base64.b64decode("c2stb3ItdjEtNTRlZDA0MDFhMDc5YmM4ZWVjYzFkNzQ3ZWU5NzNlMWI5OTU4NWM1ZmI4NzU1OWRkMzAyOWNlMTRhMzA3MGMwNg==").decode('utf-8'),
    base64.b64decode("c2stb3ItdjEtZjdlNmIwN2FmZDkxZmViNTJlMmY5MWM2NjM2YjQyYmQ4YTBhZmViMzM0MzA3NzgxM2VjNmYyYzU0ODEwNDIwMA==").decode('utf-8'),
    base64.b64decode("c2stb3ItdjEtMjI5YTE3YjY0NDRhMDg4YTBmZTEyMmVhMmQxMjJhNmMxZjU4NTA0OTRmNzE1Mjc2NWQ1YzM2MGUwYzkzNWQ2OA==").decode('utf-8'),
    base64.b64decode("c2stb3ItdjEtOTI4NjkzNjVlOTIyY2FkZDA4Y2U3NzNkNzdhM2EyZTM2NDQyZDc5Zjg2YzgxY2ZkZDVkYzFhYTQxMDlkODA4Nw==").decode('utf-8')
]

def call_llm_with_fallback(messages, models=None, timeout_per_model=6, require_json=False, custom_api_key=None, force_local=False, preferred_local_model=None):
    """
    Intelligent Hybrid LLM Router with Local LLM First-Class Integration.
    Supports Local First (Ollama/LM Studio), Local Only (Private), and Cloud Fallback Key Pool.
    """
    local_cfg = get_local_config()
    is_local_enabled = local_cfg.get("enabled", True)
    local_mode = local_cfg.get("mode", "local_first")
    
    # 1. LOCAL LLM ROUTING (Local First or Local Only)
    if (is_local_enabled and local_mode in ["local_first", "local_only"]) or force_local:
        try:
            return _call_local_llm(
                messages=messages,
                timeout=local_cfg.get("timeout", 30),
                require_json=require_json,
                model=preferred_local_model or local_cfg.get("model")
            )
        except Exception as local_err:
            log_router(f"Local LLM attempt failed: {local_err}")
            if local_mode == "local_only" and not custom_api_key:
                raise Exception(f"Local LLM failed in 'Local Only' mode: {local_err}. Please ensure your local model is running.")
            log_router("Proceeding to Cloud Fallback Pool...")

    # 2. Check if explicit custom Gemini Key is provided
    if custom_api_key and custom_api_key.startswith("AIza"):
        try:
            return _call_gemini_model(custom_api_key.strip(), messages, timeout_per_model)
        except Exception as ge:
            log_router(f"Custom Gemini call failed: {ge}. Continuing with OpenRouter pool...")

    # 3. OpenRouter Key Pool
    if custom_api_key and custom_api_key.strip() and not custom_api_key.startswith("AIza"):
        fallback_api_keys = [custom_api_key.strip()]
    else:
        api_keys_raw = os.environ.get("OPENROUTER_API_KEY", "").strip()
        fallback_api_keys = [k.strip() for k in api_keys_raw.split(',') if k.strip()] if api_keys_raw else DEFAULT_OPENROUTER_KEYS

    if models is None:
        models = FAST_FREE_MODELS
        
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=len(models))
    futures = {}
    try:
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
                try:
                    executor.shutdown(wait=False, cancel_futures=True)
                except:
                    pass
                return result
            except Exception as e:
                last_error = str(e)
                
        # 4. If Cloud Failed and mode was Cloud First, try Local as last resort
        if is_local_enabled and local_mode == "cloud_first":
            try:
                log_router("Cloud pool exhausted, attempting Local LLM fallback...")
                return _call_local_llm(
                    messages=messages,
                    timeout=local_cfg.get("timeout", 30),
                    require_json=require_json,
                    model=preferred_local_model or local_cfg.get("model")
                )
            except Exception as le:
                log_router(f"Local LLM fallback also failed: {le}")

        log_router(f"All models failed. Last error: {last_error}")
        raise Exception(f"All models in fallback sequence failed. Last error: {last_error}")
    finally:
        try:
            executor.shutdown(wait=False, cancel_futures=True)
        except Exception:
            pass


