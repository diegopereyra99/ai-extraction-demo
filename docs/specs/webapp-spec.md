# Webapp Spec — Gemini Structured Extractor (v0)

Audience: Developers | Type: Spec | Status: Current (v0) | Last verified: 2025-09-10

For the user guide and local run instructions, see: web/README.md

Detailed specification for the lightweight local frontend that builds a flat schema, uploads files inline, and renders results from the `/extract` API.

## Goals & Constraints
- Single static page; no frameworks (no React/Vue). Use plain HTML + CSS + JS.
- Keep bundle minimal; no build step/bundlers. Optionally use JS modules if helpful.
- Serve locally via a simple static server (e.g., `make serve-web`). Do not open via `file://` because locale JSON files must be fetched over HTTP.
- All code and docs in English.
- Internationalization (i18n): UI copy supports English, Spanish, and Italian with runtime language switching.

## Directory Structure
```
web/
├─ index.html
├─ styles.css
├─ app.js
├─ i18n.js             # tiny loader and DOM applier
├─ i18n/
│  ├─ en.json
│  ├─ es.json
│  └─ it.json
├─ config.example.js   # window.APP_CONFIG = { API_URL: "" }
└─ assets/             # icons; optional demo files
```

`config.example.js` is copied to `config.js` locally by the user and ignored by git.

## Configuration
- `window.APP_CONFIG.API_URL` must point to the deployed function endpoint (e.g., `https://.../extract`) or the local dev server (`http://localhost:8080/extract`).
- Fallback behavior: if `config.js` is missing, show a dismissible banner prompting to create it.
- i18n: `i18n/*.json` contain translation dictionaries keyed by stable IDs. Default locale detection: `localStorage` → browser `navigator.language` → `en`.

## Layout
- Two columns split ~50/50 (responsive stack on small screens):
  - Left panel: Files
    - Drag & drop area and a “Select files” button.
    - File list with name, size (KB/MB), and MIME.
    - Basic viewer overlay for PDFs and images (opens a simple preview on click).
  - Right panel: Schema & Result
    - Schema builder with “Add field” button and a list of field rows.
    - JSON Schema preview (read-only <pre> block).
    - Prompt and System Instruction inputs.
    - Model select (optional; default `gemini-2.5-flash`).
    - Submit button.
    - Results area: table for `ok=true` or error box for `ok=false`.
 - Header: compact bar with app title and a language switcher (`en`, `es`, `it`).

## Components & Behavior

### Internationalization (i18n)
- Dictionaries: `web/i18n/en.json`, `es.json`, `it.json`.
- Apply: mark translatable nodes with `data-i18n="section.key"`. `i18n.js` loads the selected locale and updates text content, placeholders, button labels, and ARIA labels.
- Switching: dropdown in the header updates locale live; selection persisted to `localStorage` and sets `document.documentElement.lang`.
- Fallback: if a key is missing in the selected locale, fall back to `en` for that key.

### Files Panel
- Drag & drop:
  - Highlight dropzone on dragenter/dragover; accept drop on dropzone only.
  - Append dropped files to the list (allow duplicates by name, but store unique File references).
  - No file reading; only metadata shown (name, size, MIME via `file.type` or best-effort detection by extension).
- Select files button:
  - `<input type="file" multiple>`; append to list.
- File list:
  - Show: filename, size, mime. Provide a small remove button per row.
  - Maintain an internal array `state.files: File[]` reflecting current list.
- Viewer overlay:
  - Clicking a file opens a lightweight overlay.
  - PDFs render in an `<iframe>`; images render in an `<img>`.
  - Other types show a simple “Preview not available” message.

### Schema Builder
- Field model (UI row):
  - Name: text input (required)
  - Required: checkbox (default checked)
  - Description: textarea (optional)
  - Type: select with options: STRING, NUMBER, BOOLEAN, DATE
  - Remove field: small “trash” or “×” button
- Validation rules:
  - At least 1 field total.
  - Name non-empty and unique (case-insensitive comparison).
  - Type must be one of the allowed values.
  - Required defaults to true for new rows.
- Generated schema (preview and payload):
  - Base:
    ```json
    {
      "type": "OBJECT",
      "properties": {},
      "required": []
    }
    ```
  - For each field row:
    - Insert `properties[Name]` with:
      - `type` from the UI type, where `DATE` maps to `{ "type": "STRING", "format": "date" }`.
      - Add `description` if non-empty.
    - If Required is checked, append the Name to `required`.
  - Ensure `required` contains only names present in `properties` and has no duplicates.
  
- Optional "Extract as list" toggle:
  - When enabled, wrap the object schema as an array: `{ "type": "ARRAY", "items": <objectSchema> }`.
  - Useful when expecting multiple records from a single document.
- UI feedback:
  - Render preview JSON in a `<pre>` updated live on any change.
  - Show inline validation messages near affected inputs (e.g., “Name is required”, “Duplicate name”).

### Prompt, System Instruction, Model
- Prompt: single-line text input; can be empty (server tolerates empty prompt).
- System Instruction: textarea with a localized default, e.g.,
  - EN: “Do not make up data. Use null if information is missing. Respond strictly matching the provided schema.”
  - ES: “No inventes datos. Usa null si falta información. Responde exactamente con el esquema proporcionado.”
  - IT: “Non inventare dati. Usa null se mancano informazioni. Rispondi seguendo rigorosamente lo schema fornito.”
- Model: select with `gemini-2.5-flash` (default) and room to extend. Include a free-text override input if desired in v0.

### Submit Behavior
- Submit remains enabled; clicking Submit triggers client-side validation first.
- If schema is invalid (0 fields, missing/duplicate names, unknown type):
  - The request is not sent to the API.
  - Inline errors are shown near affected inputs and a summary message is announced.
- Submit is disabled only when:
  - API URL is empty, or
  - A request is in flight (to prevent double submit), or
  - Total selected upload size exceeds the configured limit (UI warns near the cap).

## Request Construction
- Prefer multipart/form-data when files are present; otherwise use application/json.
- Multipart fields:
  - `files[]`: each selected file as `FormData.append('files[]', file, file.name)`
  - `prompt`: prompt string
  - `system_instruction`: system instruction string
  - `schema`: stringified JSON schema (exactly what’s shown in preview)
  - `model`: selected model (if not default, still send selected value)
  - `locale` (optional): `en` | `es` | `it` for future backend use; ignored by v0 server.
- JSON body (no files):
  ```json
  {
    "prompt": "...",
    "system_instruction": "...",
    "schema": "<stringified schema>",
    "model": "gemini-2.5-flash",
    "locale": "en"
  }
  ```
- Headers:
  - For multipart: let the browser set `Content-Type` with boundary.
  - For JSON: set `Content-Type: application/json`.

## Response Handling
- Parse JSON; expect shape `{ ok, model, data, usage, trace_id, error }`.
- When `ok=true`:
  - Render a table:
    - Columns: schema property names in the order of the builder.
    - Single row with cell values from `data[name]` (render `null` as empty or literal `null`; choose one and be consistent).
  - Optionally show a small metadata bar with `model` and basic `usage` fields if present.
- When `ok=false` or network error:
  - Show an error box with a concise message. Include `trace_id` if present.
- Preserve last response until next submit. Allow clearing via a “Clear” button.

## Error Messages (examples)
- Config missing: “API_URL not configured. Create web/config.js from config.example.js.”
- Schema invalid (no fields): “Add at least one field.”
- Duplicate name: “Field names must be unique.”
- Network/API error: “Request failed (trace: …). Check server logs.”

## Accessibility & UX
- Keyboard accessible controls and focus order. Ensure all interactive elements have visible focus.
- Labels associated with inputs. Buttons have `aria-label` when icon-only.
- Live regions (`role="status"`) for request in-flight and result summaries.
- Responsive: stack panels vertically below ~900px width.
- Language changes: update `document.documentElement.lang` and announce important changes in a polite `aria-live` region; keep focus on the switcher after change.

## Performance & Limits
- Do not pre-read file contents; only pass them to `FormData`.
- Enforce a simple total selected size hint in UI (sum of `file.size`) and warn when near server cap (~20MB) before submit.
- Cancel/disable submit while a request is pending.
- Serve via HTTP(S) (not `file://`) to allow fetching locale JSON files.

## State Model (app.js)
- `state = { files: File[], fields: Field[], prompt: string, systemInstruction: string, model: string, loading: boolean, lastResponse: object|null }`
- `Field = { id: string, name: string, required: boolean, description: string, type: 'STRING'|'NUMBER'|'BOOLEAN'|'DATE' }`
- Derived `schema` computed from `fields`.

## Events
- Files: drop/select/remove → update `state.files` and re-render list.
- Fields: add/change/remove → update `state.fields`, validate, re-render preview and errors.
- Submit: construct request (multipart if files > 0 else JSON), POST to `API_URL`, set `loading` while pending, render result or error.

## Minimal Visual Style
- Base system font stack, light neutral palette.
- Clear panel headings, subtle borders, and ample spacing.
- Error box (red border), status/info box (blue/gray), success subtle highlight on table after render.

## Testing (manual)
- With API_URL pointing at a live or local endpoint:
  - No files + JSON schema → ok=true, table renders columns.
  - One PDF + schema → ok=true.
  - Invalid schema (e.g., duplicate names) → clicking Submit blocks the request and shows inline errors.
  - Simulated server error (bad schema string) → error box with message and trace.
  - i18n: switch languages (EN/ES/IT) and verify all UI copy, placeholders, and validation messages update without page reload.

## Future (out-of-scope v0)
- On-page viewer using PDF.js or `<img>`.
- Nested/array schema authoring.
- Persist fields in `localStorage`.
- Export CSV/JSON of results.
- Additional locales and server-side prompt localization.
