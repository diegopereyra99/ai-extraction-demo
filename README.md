# AI Extraction Demo — Gemini Structured Extractor (v0)

Single Cloud Function backend with a lightweight local webapp to extract structured data from small documents using a flat schema. Runs locally with a stub or calls Gemini via Vertex AI when enabled.

## What’s Implemented
- Backend: one HTTP endpoint `POST /extract` (Cloud Functions Gen2 signature `extract(request)`).
  - Accepts `application/json` or `multipart/form-data` (`files[]`).
  - Fields: `prompt`, `schema` (flat OBJECT), `system_instruction` (defaulted), `model?`, `locale?`.
  - Returns: `{ ok, model, data, usage, trace_id, error }`.
  - CORS enabled for demo.
  - Local stub fills schema-shaped keys with `null`. When Vertex AI is enabled, calls Gemini and returns model output.
- Frontend: single‑page web UI (no frameworks) to build a flat schema, add files, and call `/extract`.
  - Internationalization: English, Spanish, Italian with runtime switching.
- Docs: system spec, API reference, and GCP setup.
- Examples: sample files and schemas, plus a curl script to test.

## Repo Structure
- `api/` — Cloud Function code and local run instructions
- `web/` — static frontend (HTML/CSS/JS + i18n)
- `docs/` — specs and how‑tos (system, API, GCP setup)
- `examples/` — sample documents and schemas
- `tests/` — helper scripts (e.g., `post_one.sh`)
- `Makefile` — deploy and utility targets

## Quick Start
1) Run the API locally (stub mode by default)
```
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m functions_framework --target=extract --port=8080 --debug
```

2) Test the endpoint
```
# JSON only
curl -s -X POST http://localhost:8080/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"Extract basic fields",
    "system_instruction":"Do not make up data; return JSON",
    "schema":"{\"type\":\"OBJECT\",\"properties\":{\"name\":{\"type\":\"STRING\"}},\"required\":[\"name\"]}"
  }' | jq .

# Multipart with a file (from repo root while server runs)
tests/post_one.sh examples/files/invoice.pdf examples/schemas/invoice.json
```

3) Run the web UI
```
cp web/config.example.js web/config.js
# Edit API_URL to http://localhost:8080/extract
make serve-web            # or: python3 -m http.server 5173 --directory web
# open http://localhost:5173
```

## Use Vertex AI (optional)
Enable real model calls via service account in your GCP project:
```
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=europe-west4
export GOOGLE_GENAI_USE_VERTEXAI=true
```
Then start the local server (as above). The backend will call Gemini (default `gemini-2.5-flash`).

## Deploy (GCP)
Edit `.env.yaml` in the repo root (copy from `.env.yaml.example`) and use the Makefile:
```
make enable-apis   # one-time per project
make setup-sa      # create service account and grant roles
make deploy-api
make logs-api
```
See `docs/01-gcp-setup.md` and `api/README.md` for details.

## API Reference
- Endpoint: `POST /extract`
- Content-Types: `application/json`, `multipart/form-data`
- Request fields: `prompt`, `schema` (flat OBJECT, required), `system_instruction` (optional), `model?`, `locale?`, and `files[]` for multipart.
- Response JSON: `{ ok, model, data, usage, trace_id, error }`.
Full details and examples: `docs/02-extract-api.md`.

## Limits & Notes
- Demo payload cap: ~20 MB total for `files[]` (configurable via `MAX_TOTAL_UPLOAD_BYTES`).
- CORS is open (`*`) for demo; tighten for production.
- Local stub returns schema‑shaped `null` values; enable Vertex AI for real outputs.

## Related Docs
- `docs/system-spec.md` — overall scope and acceptance (v0)
- `docs/02-extract-api.md` — API documentation and examples
- `docs/01-gcp-setup.md` — project setup, roles, and enabling APIs
- `docs/initial-spec.md` — original function‑focused spec (moved from root)
