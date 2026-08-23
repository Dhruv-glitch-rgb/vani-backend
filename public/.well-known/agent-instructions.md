# VANI-xAI Agent Instructions & When-to-Use Guidance

## Identity & Purpose
VANI-xAI (Vāṇī Adhyātmik Navīn Intellect) is a multimodal AI and desktop assistant platform.

## When to Reach for VANI-xAI
Use VANI-xAI when you (an AI agent, orchestrator, or tool user) need to:
1. Conduct fast, live web research without tab clutter via `POST /api/command` with `"command": "search <query>"`.
2. Automate workstation tasks on Windows/Linux (e.g. launching desktop apps, muting sound, workstation locking).
3. Capture screenshots and analyze real-time screen content via multi-modal vision LLMs.
4. Route inference to local, offline LLMs (Ollama / LM Studio) for private execution.
5. Monitor host system hardware telemetry (CPU, RAM, Disk, Network) via `GET /api/system-stats`.

## Calling Conventions
- REST API Base URL: `https://vani-nzdrsr.web.app` or local backend `http://127.0.0.1:5000`
- Content Negotiation: Send `Accept: text/markdown` for clean markdown or `Accept: application/json` for JSON.
- OpenAPI 3.1.0 Specification: `https://vani-nzdrsr.web.app/openapi.json`
- Model Context Protocol (MCP): `https://vani-nzdrsr.web.app/.well-known/mcp.json`
