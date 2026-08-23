# VANI-xAI REST APIs & Developer Documentation

> Official Canonical URL: https://vani-nzdrsr.web.app/docs  
> OpenAPI 3.1.0 JSON: https://vani-nzdrsr.web.app/openapi.json  
> OpenAPI 3.1.0 YAML: https://vani-nzdrsr.web.app/openapi.yaml  
> MCP Manifest: https://vani-nzdrsr.web.app/.well-known/mcp.json  

---

## 1. Authentication & Custom Headers
- `X-OpenRouter-Key`: Optional custom API key for cloud LLM reasoning.
- `X-Force-Local`: Set to `true` to force local Ollama / LM Studio offline inference.
- `X-Local-Model`: Specify local model name (e.g. `llama3:latest`, `qwen2.5:7b`).

---

## 2. API Endpoints Reference

### `POST /api/command`
Execute natural language, desktop automation, or Saras.WebSearch queries.
- **Request**:
  ```json
  {
    "command": "search quantum computing breakthroughs",
    "personality": "human_girl"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "action": "saras_web_search",
    "query": "quantum computing breakthroughs",
    "message": "Searching for 'quantum computing breakthroughs' in Saras.WebSearch..."
  }
  ```

### `GET /api/system-stats`
Retrieve CPU, memory, disk, network, and uptime metrics.

### `GET /api/logs`
Retrieve execution and agent logs.

### `GET /api/local-llm/status`
Check connectivity and model inventory of local Ollama / LM Studio instance.

### `GET /api/local-llm/config` / `POST /api/local-llm/config`
Read or save local LLM router configuration.

### `POST /api/local-llm/pull`
Download an Ollama model in background.

### `GET /api/local-llm/pull-status`
Check download percentage of active pull.
