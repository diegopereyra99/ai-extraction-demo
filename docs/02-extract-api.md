# API — Documentation

Scope: single HTTP endpoint to extract structured data using a flat schema. Supports JSON-only and multipart (with files). CORS enabled for demo.

Quick Test
- Ensure the server is running on `http://localhost:8080`.
- Post one file + schema: `tests/post_one.sh data/files/invoice.pdf examples/schemas/invoice.json`.

## Endpoint
- Method: POST
- Path: /extract
- Auth: none (demo)
- Content-Types: application/json, multipart/form-data

## Request (application/json)
- Fields:
  - prompt: string (short instruction)
  - system_instruction: string (optional; defaults to the built-in message)
  - schema: string (JSON) — flat OBJECT schema with properties and required
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
- data: object (matches the provided schema shape)
- usage: object (may include token metadata when using Vertex). In local stub mode includes `note`. If Vertex is requested but the SDK lacks schema support, the server still calls the model without `response_schema` and attempts to enforce shape via instructions.
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
- Top-level: `type` must be `OBJECT` with a flat `properties` object and a `required` array.
- Property types: `STRING`, `NUMBER`, `BOOLEAN` (case-insensitive). Additional metadata like `description`, `title`, `example` are accepted and forwarded to the model when available.
- Dates: prefer `{"type":"string","format":"date"}`. The legacy `{"type":"DATE"}` also works and maps to a date-formatted string.
- Formats: `email`, `uuid`, and other string formats are allowed as hints. Arrays and nested objects are best-effort (enforced when the SDK supports response_schema), otherwise guided via instructions.
- See updated samples under `examples/schemas/` for style.

## Errors
- 400: invalid or missing schema, malformed JSON, wrong method
- 413: total upload too large for the demo
- 500: model call/parsing error

## Notes
- Place example documents under `examples/files/` and example schemas under `examples/schemas/`.
- Set `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION=europe-west4` to use Vertex AI.
- This demo does not store files; it forwards content to the model (or stubs locally).
 - Deployment: copy `.env.yaml.example` to `.env.yaml`, edit values, then run `make enable-apis` (one-time) and `make deploy-api` from the repo root. Inspect `Makefile` for details.
 - i18n: while the server currently ignores `locale`, the frontend uses it to localize UI copy. Serving the web via HTTP is required to fetch locale files.
