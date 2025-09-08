import os
import io
import json
import uuid
from typing import Any, Dict, List, Tuple

from flask import Response

# Vertex AI imports are optional at local dev time
_VERTEX_AVAILABLE = False
_VERTEX_IMPORT_ERROR: str | None = None
_VERTEX_IMPORT_PATH: str | None = None
try:
    from vertexai.generative_models import (  # type: ignore
        GenerativeModel,
        GenerationConfig,
        Part,
    )
    _VERTEX_AVAILABLE = True
    _VERTEX_IMPORT_PATH = "vertexai.generative_models"
except Exception as e:  # pragma: no cover
    _VERTEX_AVAILABLE = False
    _VERTEX_IMPORT_ERROR = str(e)

DEFAULT_MODEL = os.environ.get("DEFAULT_GEMINI_MODEL", "gemini-2.5-flash")
DEFAULT_LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "europe-west4")
USE_VERTEX = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() in {"1", "true", "yes"}

# ~20 MB total payload limit for demo
MAX_TOTAL_UPLOAD_BYTES = int(os.environ.get("MAX_TOTAL_UPLOAD_BYTES", str(20 * 1024 * 1024)))

print(f"Vertex AI available: {_VERTEX_AVAILABLE}")
print(f"Using Vertex AI: {USE_VERTEX}")
print(f"Max total upload bytes: {MAX_TOTAL_UPLOAD_BYTES}")
if USE_VERTEX and not _VERTEX_AVAILABLE:
    try:
        import sys
        print(
            f"WARN: GOOGLE_GENAI_USE_VERTEXAI=true but Vertex SDK import failed: "
            f"{_VERTEX_IMPORT_ERROR or 'unknown error'}. Python={sys.version.split()[0]} Path={sys.executable}",
            file=sys.stderr,
        )
    except Exception:
        pass
else:
    if _VERTEX_IMPORT_PATH:
        print(f"Vertex imports from: {_VERTEX_IMPORT_PATH}")


def _cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _bad_request(message: str, trace_id: str) -> Tuple[Dict[str, Any], int, Dict[str, str]]:
    body = {
        "ok": False,
        "model": None,
        "data": None,
        "usage": None,
        "trace_id": trace_id,
        "error": message,
    }
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return body, 400, headers


def _too_large(message: str, trace_id: str) -> Tuple[Dict[str, Any], int, Dict[str, str]]:
    body = {
        "ok": False,
        "model": None,
        "data": None,
        "usage": None,
        "trace_id": trace_id,
        "error": message,
    }
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return body, 413, headers


def _server_error(message: str, trace_id: str) -> Tuple[Dict[str, Any], int, Dict[str, str]]:
    body = {
        "ok": False,
        "model": None,
        "data": None,
        "usage": None,
        "trace_id": trace_id,
        "error": message,
    }
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return body, 500, headers


def _parse_schema(schema_str: str) -> Dict[str, Any]:
    """Parse and minimally validate a response schema.

    API constraint: accept any valid schema shape (objects, arrays, nested),
    and forward it unchanged to Gemini. Validation only checks that the schema
    is present and structurally valid, without enforcing "flat" restrictions.
    """
    try:
        schema = json.loads(schema_str)
    except Exception as e:  # invalid JSON
        raise ValueError(f"Invalid schema JSON: {e}")

    if not isinstance(schema, dict):
        raise ValueError("Schema must be a JSON object")

    def _validate(node: Dict[str, Any], path: str = "$") -> None:
        if not isinstance(node, dict):
            raise ValueError(f"Schema at {path} must be an object")
        t = node.get("type")
        if not isinstance(t, str):
            raise ValueError(f"Missing or invalid 'type' at {path}")
        t_upper = t.upper()
        if t_upper == "OBJECT":
            props = node.get("properties", {})
            if props is not None and not isinstance(props, dict):
                raise ValueError(f"'properties' at {path} must be an object")
            req = node.get("required", None)
            if req is not None:
                if not isinstance(req, list) or not all(isinstance(x, str) for x in req):
                    raise ValueError(f"'required' at {path} must be an array of strings")
            for key, sub in (props or {}).items():
                if not isinstance(sub, dict):
                    raise ValueError(f"Property '{key}' at {path} must be an object")
                _validate(sub, f"{path}.properties.{key}")
        elif t_upper == "ARRAY":
            items = node.get("items")
            if not isinstance(items, dict):
                raise ValueError(f"'items' at {path} must be an object schema")
            _validate(items, f"{path}.items")
        elif t_upper in {"STRING", "NUMBER", "BOOLEAN", "NULL"}:
            # Primitive types: allow optional hints like description/format/enum
            pass
        else:
            raise ValueError(f"Unsupported type '{t}' at {path}")

    _validate(schema)
    return schema


def _collect_files_from_multipart(request) -> Tuple[List[Tuple[str, bytes, str]], int]:
    files: List[Tuple[str, bytes, str]] = []
    total = 0
    for f in request.files.getlist("files[]"):
        data = f.read()
        f.seek(0)
        total += len(data)
        files.append((f.filename or "file", data, f.mimetype or "application/octet-stream"))
    return files, total


def _parts_from_files(files: List[Tuple[str, bytes, str]]) -> List["Part"]:
    parts: List[Part] = []
    for name, data, mime in files:
        try:
            parts.append(Part.from_data(mime_type=mime, data=data))
        except Exception:
            parts.append(Part.from_data(mime_type="application/octet-stream", data=data))
    return parts


def _maybe_call_vertex(prompt: str, system_instruction: str, schema_dict: Dict[str, Any],
                       files: List[Tuple[str, bytes, str]], model_name: str, trace_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if not _VERTEX_AVAILABLE or not USE_VERTEX:
        raise RuntimeError("Vertex not available or disabled")

    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", DEFAULT_LOCATION)
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT is not set")

    import vertexai
    vertexai.init(project=project, location=location)
    model = GenerativeModel(model_name)

    contents: List[Any] = []
    if system_instruction:
        contents.append(system_instruction)
    if prompt:
        contents.append(prompt)
    if files:
        contents.extend(_parts_from_files(files))

    cfg = GenerationConfig(
        response_mime_type="application/json",
        response_schema=schema_dict,
    )

    resp = model.generate_content(contents, generation_config=cfg)

    text = getattr(resp, "text", None)
    if not text:
        try:
            text = resp.candidates[0].content.parts[0].text  # type: ignore[attr-defined]
        except Exception:
            raise RuntimeError("No JSON response from model")

    data = json.loads(text)

    usage = {}
    try:
        um = getattr(resp, "usage_metadata", None)
        if um:
            input_tok = getattr(um, "prompt_token_count", None)
            output_tok = getattr(um, "candidates_token_count", None)
            usage = {"input_tokens": input_tok, "output_tokens": output_tok}
    except Exception:
        pass

    return data, usage


def _stub_generate(schema_dict: Dict[str, Any]) -> Any:
    """Generate a minimal stub matching the provided schema.

    - OBJECT → dict with keys from properties; values are stubs
    - ARRAY → empty list []
    - STRING/NUMBER/BOOLEAN/NULL → None
    """
    def _gen(node: Dict[str, Any]) -> Any:
        t = (node.get("type") or "STRING")
        t_upper = t.upper() if isinstance(t, str) else "STRING"
        if t_upper == "OBJECT":
            out: Dict[str, Any] = {}
            props = node.get("properties", {}) or {}
            if isinstance(props, dict):
                for k, v in props.items():
                    if isinstance(v, dict):
                        out[k] = _gen(v)
                    else:
                        out[k] = None
            return out
        if t_upper == "ARRAY":
            # Minimal stub: empty array
            return []
        # Primitives
        return None

    return _gen(schema_dict)


def extract(request):
    trace_id = str(uuid.uuid4())

    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())

    if request.method != "POST":
        body, status, headers = _bad_request("Only POST is allowed", trace_id)
        return Response(response=json.dumps(body), status=status, headers=headers)

    content_type = request.headers.get("Content-Type", "")
    prompt = ""
    system_instruction = request.form.get(
        "system_instruction",
        "Do not make up data. Use null if information is missing. Respond strictly matching the provided schema.",
    )
    model_name = request.form.get("model", DEFAULT_MODEL)
    schema_str = request.form.get("schema")
    files: List[Tuple[str, bytes, str]] = []
    total_bytes = 0

    if content_type.startswith("multipart/form-data"):
        prompt = request.form.get("prompt", "")
        schema_str = request.form.get("schema")
        files, total_bytes = _collect_files_from_multipart(request)
    else:
        try:
            payload = request.get_json(force=True, silent=False)
        except Exception:
            payload = None
        if not isinstance(payload, dict):
            body, status, headers = _bad_request("Invalid JSON body", trace_id)
            return Response(response=json.dumps(body), status=status, headers=headers)
        prompt = payload.get("prompt", "")
        schema_str = payload.get("schema")
        system_instruction = payload.get(
            "system_instruction",
            "Do not make up data. Use null if information is missing. Respond strictly matching the provided schema.",
        )
        model_name = payload.get("model", DEFAULT_MODEL)

    if not schema_str:
        body, status, headers = _bad_request("Missing 'schema'", trace_id)
        return Response(response=json.dumps(body), status=status, headers=headers)

    try:
        schema_dict = _parse_schema(schema_str)
    except ValueError as e:
        body, status, headers = _bad_request(str(e), trace_id)
        return Response(response=json.dumps(body), status=status, headers=headers)

    if total_bytes > MAX_TOTAL_UPLOAD_BYTES:
        body, status, headers = _too_large("Payload too large for demo; consider using GCS in V2.", trace_id)
        return Response(response=json.dumps(body), status=status, headers=headers)

    try:
        if _VERTEX_AVAILABLE and USE_VERTEX:
            data, usage = _maybe_call_vertex(prompt, system_instruction, schema_dict, files, model_name, trace_id)
        else:
            data = _stub_generate(schema_dict)
            usage = {"note": "local stub; set GOOGLE_GENAI_USE_VERTEXAI=true to call Vertex"}
            if USE_VERTEX and not _VERTEX_AVAILABLE and _VERTEX_IMPORT_ERROR:
                usage["vertex_warning"] = f"Vertex not available: {_VERTEX_IMPORT_ERROR}"
    except Exception as e:
        body, status, headers = _server_error(f"Model call failed: {e}", trace_id)
        return Response(response=json.dumps(body), status=status, headers=headers)

    body = {
        "ok": True,
        "model": model_name,
        "data": data,
        "usage": usage,
        "trace_id": trace_id,
        "error": None,
    }
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return Response(response=json.dumps(body), status=200, headers=headers)
