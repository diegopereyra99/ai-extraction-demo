# Extract API (Cloud Function Gen2)

Single HTTP endpoint `/extract` that accepts JSON or multipart (files[]) and returns structured JSON. Uses Vertex AI Gemini via service account when enabled; otherwise a local stub for development.

## Run Locally

- Python 3.11+ recommended. Then:
  ```bash
  cd api
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  python -m functions_framework --target=extract --port=8080 --debug
  ```
- Test (JSON):
  ```bash
  curl -s -X POST http://localhost:8080/extract \
    -H 'Content-Type: application/json' \
    -d '{
      "prompt":"Extract basic fields",
      "system_instruction":"Do not make up data; return JSON",
      "schema":"{\"type\":\"OBJECT\",\"properties\":{\"name\":{\"type\":\"STRING\"},\"total\":{\"type\":\"NUMBER\"}},\"required\":[\"name\"]}"
    }' | jq .
  ```
- Test (multipart with files):
  ```bash
  curl -s -X POST http://localhost:8080/extract \
    -H 'Content-Type: multipart/form-data' \
    -F 'prompt=Extract fields from file' \
    -F 'schema={"type":"OBJECT","properties":{"name":{"type":"STRING"}},"required":["name"]}' \
    -F 'files[]=@./README.md;type=text/markdown' | jq .
  ```
- Quick helper (from repo root while local server runs):
  ```bash
  tests/post_one.sh examples/files/invoice.pdf examples/schemas/invoice.json
  ```

## Use Vertex AI (optional)

Set these before starting the server to call real models:
```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=europe-west4
export GOOGLE_GENAI_USE_VERTEXAI=true
```

## Deploy (Makefile)

Configure `.env.yaml` in repo root (copy from `.env.yaml.example` and edit values). Requires `yq`.
```bash
# From repo root
make enable-apis   # one-time per project
make setup-sa      # create SA and grant roles
make deploy-api
make logs-api      # view logs
```

## Test Deployed (no Makefile)

```bash
# Replace region/name if you customized them
URL=$(gcloud functions describe extract --region=europe-west4 --gen2 --format='value(serviceConfig.uri)'); \
tests/post_one.sh -u "$URL/extract" examples/files/invoice.pdf examples/schemas/invoice.json
```

## Notes

- CORS is enabled for demo (`*`). Tighten later if needed.
- Local mode returns a minimal JSON value shaped by the provided schema (objects with nested nulls, arrays as `[]`, primitives as `null`) unless Vertex AI is enabled.
- The function uses the service account defined in `.env.yaml` (`SERVICE_ACCOUNT_ID`, default `gemini-extractor-sa`).
- The API accepts any structurally valid schema (objects, arrays, nested) and forwards it unchanged to Gemini. The web UI remains flat-only as a simplification for authoring.
