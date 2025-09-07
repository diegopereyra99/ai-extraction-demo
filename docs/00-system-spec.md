# System Spec — Gemini Structured Extractor (v0)

This document defines the v0 scope and acceptance criteria for the demo: a single HTTP extraction endpoint and a super‑light local webapp. It consolidates decisions from the original spec and reflects what’s implemented in the repo today.

## Goals
- Backend: one Cloud Function (Gen2) with a single HTTP endpoint `/extract` that accepts small files + prompt + system instruction + flat schema, and returns structured JSON using Gemini via Vertex AI (service account) or a local stub.
- Frontend: one static HTML page (no frameworks) with two panels: file picker/list (left) and schema builder + results (right).
- Internationalization: UI supports English, Spanish, and Italian; users can switch language at runtime.

## Scope (v0)
- One endpoint; one static page (served locally).
- No auth (demo); CORS enabled for local use.
- Files are uploaded inline (multipart/form-data); small total payload (≈ < 20 MB).
- Flat schema (single level OBJECT with properties and required[]).
- No storage (no GCS) and no caching.
- i18n: client-side only; UI copy localized (EN/ES/IT). Backend agnostic; may receive `locale` but not required to act on it in v0.

## Architecture
- GCP project; Cloud Functions Gen2 (Python 3.12; region `europe-west4`).
- Service Account with `roles/aiplatform.user` and `roles/logging.logWriter` for the function runtime.
- Gemini via Vertex AI (no API key): enabled by env var.
- Monorepo layout:
  - `api/` — Cloud Function code and local run instructions
  - `docs/` — specs and setup
  - `examples/` — sample files and schemas
  - `web/` — frontend (with `i18n/` locale files and `i18n.js` loader)

## Configuration
- Backend (runtime/env):
  - `GOOGLE_CLOUD_PROJECT` (provided by platform)
  - `GOOGLE_CLOUD_LOCATION=europe-west4`
  - `GOOGLE_GENAI_USE_VERTEXAI=true|false`
  - `DEFAULT_GEMINI_MODEL=gemini-2.5-flash` (default)
  - `MAX_TOTAL_UPLOAD_BYTES` (default ~20MB)
- Frontend (local):
  - `web/config.example.js` provides `window.APP_CONFIG = { API_URL: "" }`; copied locally to `web/config.js` (not committed).
  - `web/i18n/` includes `en.json`, `es.json`, `it.json`. Default locale resolved from `localStorage` or browser settings; persisted across sessions.

## API — `/extract`
- Method: `POST` (supports `OPTIONS` for CORS preflight).
- Content-Types:
  - `multipart/form-data` (preferred for files): fields `files[]`, `prompt`, `schema`, `system_instruction`, `model?`
  - `application/json` (no files): fields `prompt`, `schema`, `system_instruction`, `model?`
- Fields (multipart):
  - `files[]`: 0..N small documents (PDF/image)
  - `prompt`: string
  - `system_instruction`: string (default: "Do not make up data. Use null if information is missing. Respond strictly matching the provided schema.")
  - `schema`: string with JSON for a flat schema
  - `model` (optional): defaults to `gemini-2.5-flash`
  - `locale` (optional): one of `en`, `es`, `it`. Ignored by v0 backend; reserved for future prompt tailoring.
- Response (application/json):
  - `ok` (boolean)
  - `model` (string)
  - `data` (object matching the provided schema shape)
  - `usage` (object: may include model metadata; stub includes a note)
  - `trace_id` (string)
  - `error` (string or null)
- Errors:
  - `400` — invalid JSON or missing/invalid `schema`
  - `413` — total upload exceeds demo limit (suggest GCS in V2)
  - `500` — model call/parsing error

## Behavior
- CORS: enabled with `*` origin; allow `POST, OPTIONS` methods and `Content-Type, Authorization` headers.
- Files: forwarded inline (no storage). Size checked against `MAX_TOTAL_UPLOAD_BYTES`.
- Vertex path: when `GOOGLE_GENAI_USE_VERTEXAI=true` and SDK available, initializes Vertex with project/location; uses `response_mime_type=application/json` and `response_schema` when supported; includes `usage` metadata when provided by SDK.
- Stub path: returns an object containing all schema property names with `null` values (for predictable UI testing).
- i18n (client): translation files loaded over HTTP; UI updates dynamically on language switch; `document.lang` updated for screen readers.

## Schema (flat)
- Top-level: `{ "type": "OBJECT", "properties": { ... }, "required": [] }`.
- Property types: `STRING`, `NUMBER`, `BOOLEAN`. Dates use `type: "STRING"` + `format: "date"` (the UI maps `DATE` selection to this).
- Validation (server): minimal structural checks — must be OBJECT with `properties` object.
- Validation (client): name required and unique; at least one field; types from allowed list; required defaults to true.

## Frontend (overview)
- Single page with two panels split ~50/50.
- Left: file picker (drag&drop and/or select), list with name/size/MIME, placeholder area for future viewer.
- Right: schema builder (add field rows with Name, Required [default true], Description, Type), read-only JSON schema preview, Submit button, and results table or error box.
- Disabled Submit until schema valid (and, optionally, at least one file when doing multipart).
- Uses `config.js` for `API_URL`.
- Includes a language switcher (EN/ES/IT) in the header. All labels, placeholders, and error messages localized.

## Acceptance (v0)
- Can open the local web and submit to the endpoint with real small files and a flat schema; see a results table with one row using the schema columns; or a clear error message.
- Manual tests: see `docs/02-extract-api.md` and `tests/` scripts (local and deployed).
- UI language can be switched between English, Spanish, and Italian at runtime, with updated labels, placeholders, and validation messages.

## Out of scope (for V0)
- GCS uploads; file viewer; nested schemas; auth; persistence; advanced validation/normalization.
- Backend language-specific behavior; translation of server-side error strings; pluralization rules beyond simple static copy.

## Roadmap
1. V2 — GCS Signed URLs (remove size limits, avoid double upload)
2. V2 — On-page viewer (PDF.js / <img>)
3. V3 — Server-side validation/normalization (jsonschema, dates/currency)
4. V3 — UX improvements (CSV/JSON export, save schemas in localStorage)
5. V3 — Additional locales and server-driven prompt localization; locale-aware examples and formatting helpers.
