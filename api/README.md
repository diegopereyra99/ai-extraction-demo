Backend minimal setup (per spec)

Scope: single HTTP Cloud Function (Gen2) endpoint `/extract` that accepts files (multipart) or JSON and returns structured JSON. Uses Vertex AI Gemini via service account when enabled; otherwise runs a local stub for development.

Run locally

- Python 3.11+ recommended.
- Create a virtualenv and install deps:
  
  ```bash
  cd api
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  ```

- Start the local server (functions-framework):
  
  ```bash
  # Prefer running via the venv's interpreter
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

Quick test with one file + schema

```bash
# From repo root (server must be running)
tests/post_one.sh examples/files/invoice.pdf examples/schemas/invoice.json
```

Enable Vertex AI (optional, for real model calls)

- Prereqs: a GCP project with the service account and roles set, and the following APIs enabled: `aiplatform.googleapis.com`, `run.googleapis.com`, `cloudfunctions.googleapis.com`, `artifactregistry.googleapis.com`.
- Set env vars before starting the server:
  
  ```bash
  export GOOGLE_CLOUD_PROJECT=your-project-id
  export GOOGLE_CLOUD_LOCATION=europe-west4
  export GOOGLE_GENAI_USE_VERTEXAI=true
  ```

Deploy (reference, run from repo root or api/)

```bash
gcloud functions deploy extract \
  --gen2 \
  --region=europe-west4 \
  --runtime=python312 \
  --entry-point=extract \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=gemini-extractor-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --source=api
```

Notes

- CORS is enabled for demo (`*`). Tighten it later if needed.
- Local mode uses a stub generator returning nulls per schema; model calls require Vertex AI libs and IAM.
