# API — Documentation

Scope: single HTTP endpoint to extract structured data. The backend accepts any valid response schema (objects, arrays, nested) and forwards it unchanged to Gemini. Supports JSON-only and multipart (with files). CORS enabled for demo.

Quick Test
- Ensure the server is running on `http://localhost:8080`.
- Post one file + schema: `tests/post_one.sh examples/files/invoice.pdf examples/schemas/invoice.json`.

## Deployment (overview)

- Prerequisites — GCP project setup: see [gcp-setup.md](gcp-setup.md) for creating the project, enabling APIs, and creating the service account with roles.
- Quick deploy (Makefile), from repo root:
  - Copy and edit env: `cp .env.yaml.example .env.yaml` (set project, region, service account)
  - One‑time: `make enable-apis` and `make setup-sa`
  - Deploy: `make deploy-api`
  - Get URL: `make url-api`
- Full deployment details and local run: see [api/README.md](../api/README.md).

## Endpoint
- Method: POST
- Path: /extract
- Auth: none (demo)
- Content-Types: application/json, multipart/form-data

## Request (application/json)
- Fields:
  - prompt: string (short instruction)
  - system_instruction: string (optional; defaults to the built-in message)
  - schema: string (JSON) — response schema (OBJECT/ARRAY/primitives; nesting allowed)
  - model: string (optional; default: gemini-2.5-flash)
  - locale: string (optional; one of `en`, `es`, `it`). Ignored by v0 server; reserved for future.

Use a schema file from `examples/schemas/` (example: profile):
```bash
curl -s -X POST http://localhost:8080/extract \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
        --arg p "Extract basic fields" \
        --arg s "$(< examples/schemas/profile.json)" \
        --arg i "Do not make up data; return JSON" \
        '{prompt:$p, schema:$s, system_instruction:$i}')"
```

## Request (multipart/form-data)
- Fields:
  - files[]: 0..N files (small PDFs/images)
  - prompt: string
  - system_instruction: string (optional; see default above)
  - schema: string (JSON)
  - model: string (optional)
  - locale: string (optional)

Example (multipart) using files from `examples/files/` and a schema from `examples/schemas/`:
```bash
curl -s -X POST http://localhost:8080/extract \
  -H 'Content-Type: multipart/form-data' \
  -F 'prompt=Extract fields from invoice' \
  -F "schema=$(< examples/schemas/invoice.json)" \
  -F 'locale=en' \
  -F 'files[]=@examples/files/invoice.pdf;type=application/pdf'
```

## Response (application/json)
- ok: boolean
- model: string
- data: JSON value matching the provided schema shape
- usage: object (may include token metadata when using Vertex). In local stub mode includes a `note`.
- trace_id: string (for debugging)
- error: string | null

Example:
```json
{
  "ok": true,
  "model": "gemini-2.5-flash",
  "data": { "employee": null, "net_total": null },
  "usage": {"note":"local stub; set GOOGLE_GENAI_USE_VERTEXAI=true to call Vertex"},
  "trace_id": "6e6a...",
  "error": null
}
```

## Schema Notes
- The API accepts any structurally valid schema: `OBJECT` with `properties`, `ARRAY` with `items`, or primitive types (`STRING`, `NUMBER`, `BOOLEAN`, `NULL`). Nested objects/arrays are allowed.
- Minimal validation is applied server-side: presence of `type` at each node; objects have `properties` objects (and optional `required` string array); arrays have an `items` schema.
- Additional metadata like `description`, `title`, `example`, or string `format` (e.g., `date`) is forwarded as-is to Gemini.
- The web app’s schema builder remains flat-only (single-level object) as a UI simplification; this constraint is not enforced by the API.

## Errors
- 400: invalid or missing schema, malformed JSON, wrong method
- 413: total upload too large for the demo
- 500: model call/parsing error

## Notes
- Place example documents under `examples/files/` and example schemas under `examples/schemas/`.
- Set `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION=europe-west4` to use Vertex AI.
- This demo does not store files; it forwards content to the model (or stubs locally).
 - i18n: while the server currently ignores `locale`, the frontend uses it to localize UI copy. Serving the web via HTTP is required to fetch locale files.
