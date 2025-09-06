#!/usr/bin/env bash
set -euo pipefail

# Post a single FILE with a SCHEMA to the local /extract API.
#
# Usage:
#   tests/post_one.sh [-u API_URL] [-p PROMPT] [-o OUT_JSON] FILE SCHEMA_JSON
#
# Defaults:
#   API_URL  = ${API_URL:-http://localhost:8080/extract}
#   PROMPT   = "Extract fields"
#   OUT_JSON = tmp/post_one.json
#
# Notes:
# - Field name must be files[] (multipart) per API spec.
# - Detects MIME type via `file` if available; falls back to extension or application/octet-stream.
# - If jq is installed, pretty-prints the response; always writes raw JSON to OUT_JSON.

usage() {
  echo "Usage: $0 [-u API_URL] [-p PROMPT] [-o OUT_JSON] FILE SCHEMA_JSON" >&2
  exit 2
}

API_URL=${API_URL:-http://localhost:8080/extract}
PROMPT="Extract fields"
OUT_JSON="tmp/post_one.json"

while getopts ":u:p:o:h" opt; do
  case "$opt" in
    u) API_URL="$OPTARG" ;;
    p) PROMPT="$OPTARG" ;;
    o) OUT_JSON="$OPTARG" ;;
    h) usage ;;
    :) echo "Option -$OPTARG requires an argument" >&2; usage ;;
    \?) echo "Unknown option: -$OPTARG" >&2; usage ;;
  esac
done
shift $((OPTIND-1))

if (( $# != 2 )); then
  usage
fi

FILE_PATH="$1"
SCHEMA_PATH="$2"

if [[ ! -f "$FILE_PATH" ]]; then
  echo "File not found: $FILE_PATH" >&2
  exit 2
fi
if [[ ! -f "$SCHEMA_PATH" ]]; then
  echo "Schema file not found: $SCHEMA_PATH" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUT_JSON")"

# Detect MIME type
detect_mime() {
  local p="$1"
  if command -v file >/dev/null 2>&1; then
    file --mime-type -b "$p" || true
    return
  fi
  case "$p" in
    *.pdf) echo "application/pdf" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.png) echo "image/png" ;;
    *.gif) echo "image/gif" ;;
    *.txt) echo "text/plain" ;;
    *.md)  echo "text/markdown" ;;
    *)     echo "application/octet-stream" ;;
  esac
}

MIME_TYPE=$(detect_mime "$FILE_PATH")

echo "[post_one] POST $API_URL"
echo "           FILE=$FILE_PATH (type=$MIME_TYPE)"
echo "           SCHEMA=$SCHEMA_PATH"
echo "           PROMPT=\"$PROMPT\""

# Build and send multipart request
RESP=$(curl -s -X POST "$API_URL" \
  -H 'Content-Type: multipart/form-data' \
  -F "prompt=$PROMPT" \
  -F "schema=$(< "$SCHEMA_PATH")" \
  -F "files[]=@$FILE_PATH;type=$MIME_TYPE")

if [[ -z "$RESP" ]]; then
  echo "Empty response from API" >&2
  exit 1
fi

printf '%s' "$RESP" >"$OUT_JSON"
echo "\n[post_one] Wrote response -> $OUT_JSON"

if command -v jq >/dev/null 2>&1; then
  echo "[post_one] Pretty response:" 
  echo "$RESP" | jq . || true
else
  echo "[post_one] Raw response:" 
  echo "$RESP"
fi

