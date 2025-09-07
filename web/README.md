# Web Frontend — Gemini Structured Extractor

Lightweight, framework‑free single page webapp for building a flat schema, uploading small files, and calling the `/extract` API. Includes internationalization (English, Spanish, Italian) with a runtime language switcher.

## Features
- Two‑panel layout: Files (drag & drop / select) and Schema + Result.
- Schema builder: add fields with name, type, required, and description; live JSON preview.
- Upload 0..N small files inline (multipart) or send JSON only.
- i18n: switch between EN/ES/IT at runtime; localized labels, placeholders, and messages.
- No build step: plain HTML/CSS/JS, works via any static server.

## Getting Started
1) Configure API URL
```
cp web/config.example.js web/config.js
# Edit API_URL (local dev default): http://localhost:8080/extract
```

2) Serve the app (pick one)
- Using Makefile:
```
make serve-web
```
- Using Python http.server:
```
python3 -m http.server 5173 --directory web
```

3) Open in a browser
```
http://localhost:5173
```

4) Run the API locally (optional, for end‑to‑end)
```
cd ../api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m functions_framework --target=extract --port=8080 --debug
```

## Usage Tips
- Start by adding at least one field. Clicking Submit validates the schema client‑side; if invalid, the request is not sent and inline errors are shown.
- If you add files, the app sends `multipart/form-data`; otherwise it sends a JSON body.
- The Submit button is disabled only when API URL is missing, a request is in flight, or the total selected upload size exceeds the configured limit.
- Switch languages from the header; the choice persists between sessions.
- The app shows server errors and includes `trace_id` when available.

## Internationalization
- Locale files live under `web/i18n/` (`en.json`, `es.json`, `it.json`).
- Add a new locale by adding a `*.json` file and an `<option>` in the language selector, then mapping it in `i18n.js`.
- Mark translatable nodes with `data-i18n="key.path"`; placeholders use `data-i18n-placeholder`.

## Constraints & Limits
- This demo forwards files inline; total payload should be small (≈ < 20MB). The API enforces a max limit.
- Serve via HTTP(S) (not `file://`) so the app can fetch locale JSON files.

## Roadmap (Frontend)
- Validation polish: unique field names, inline errors, size hints near the server cap.
- Accessibility: keyboard order, aria‑labels for icon buttons, focus management on language change.
- Viewer placeholder upgrade: show first page of PDF or image previews (V2).
- Persistence: remember fields in `localStorage` (V2).
- Export: CSV/JSON of results (V3).

## Troubleshooting
- Banner: "API_URL not configured" → copy `config.example.js` to `config.js` and set the URL.
- CORS issues → ensure you are using a static server, not opening `index.html` from `file://`.
- 413 payload too large → remove files or reduce size; consider GCS upload in a future version.
