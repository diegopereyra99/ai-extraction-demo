# Extract Function Spec — Gemini Structured Extractor (v0)

Audience: Developers | Type: Spec (Legacy) | Status: Archived | Last verified: 2025-09-10

Note: This document is superseded by the system spec at `docs/specs/system-spec.md`. The frontend/webapp spec lives at `docs/specs/webapp-spec.md`. Keeping this file for historical context.

## 1) Objetivo
- **Backend**: una Cloud Function (Gen2) con un único endpoint HTTP `/extract` que acepta archivos + prompt + system instruction + schema y devuelve JSON estructurado usando Gemini (vía **Vertex AI** con **service account**).
- **Frontend (local, súper liviano)**: una página HTML con **dos paneles**:
  - Izquierda: **subida y lista de archivos** (y espacio reservado para visor futuro).
  - Derecha: **editor de esquema** mediante UI simple (agregar campos con: Nombre, Required, Description, Type), botón **Enviar** y **tabla** para mostrar el resultado.

## 2) Alcance de esta demo
- Un (1) endpoint; una (1) página web local.
- **Sin frameworks** (no React/Vue; **solo HTML + CSS + JS**).
- Archivos **pequeños** enviados **inline** (multipart/form-data).
- Backend: acepta cualquier esquema válido (objetos, arrays, anidado). Frontend: el creador de esquemas sigue siendo **plano** (un nivel) como simplificación de UI.
- **Sin autenticación** del endpoint (demo temporal).
- **Sin** hosting de la web (se corre local), y **sin** GCS aún (queda para V2).

## 3) Arquitectura
- **GCP**: Proyecto nuevo recomendado (p. ej. `gemini-extractor-dev`).
- **Cloud Function Gen2** (Python; región `europe-west4`).
- **Service Account** dedicada (p. ej. `gemini-extractor-sa`) con rol **Vertex AI User**.
- **Gemini vía Vertex** (sin API key).
- **Monorepo** minimal:

```
gemini-extractor/
├─ README.md
├─ .gitignore
├─ api/ # Cloud Function (sin exponer credenciales)
└─ web/ # Frontend estático ligero
```


## 4) Variables y configuración
- **Backend (Function):**
- `GOOGLE_CLOUD_PROJECT` (auto por entorno).
- `GOOGLE_CLOUD_LOCATION=europe-west4`.
- `GOOGLE_GENAI_USE_VERTEXAI=true`.
- **Service account** vinculada al deploy (sin API key).
- **Frontend (local):**
- Un archivo de configuración mínimo (por ej. `web/config.example.js`) que define `API_URL` (la URL del endpoint una vez desplegado). Copia local como `config.js` (no versionado).

## 5) Backend — Contrato del endpoint `/extract`
- **Método**: `POST`.
- **Content-Types**:
- `multipart/form-data` (preferido: `files[]`, `prompt`, `schema`, `system_instruction`, `model?`).
- `application/json` (alternativo sin archivos: `prompt`, `schema`, `system_instruction`, `model?`).
- **Campos (multipart)**:
- `files[]`: 0..N archivos pequeños (PDF/imagen).
- `prompt`: string (breve).
- `system_instruction`: string (por defecto: “No inventes datos. Usa null si falta info. Respeta el esquema.”).
 - `schema`: string con JSON del esquema de respuesta (OBJECT/ARRAY/primitivos; anidado permitido). La UI sigue generando un esquema plano como simplificación.
- `model` (opcional): por defecto `gemini-2.5-flash`.
- **Respuesta (application/json)**:
- `ok` (bool),
- `model` (string),
- `data` (objeto que cumple el esquema),
- `usage` (obj con metadatos si el SDK lo expone),
- `trace_id` (string),
- `error` (string, solo si falla).
- **Errores estándar**:
- `400` — `schema` inválido / parámetros faltantes.
- `413` — tamaño total de archivos excedido (demo inline).
- `500` — error en llamada a modelo/parsing.

> **Nota**: esta demo **no** guarda ni cachea archivos; solo enruta a Gemini y devuelve la respuesta.

## 6) Frontend — Requisitos y UI (ligero)
- **Ejecución**: abrir `index.html` localmente; para evitar CORS/paths, ideal correr un **servidor estático** simple, pero **sin bundlers**.
- **Estructura de archivos (`/web`)**:

```
web/
├─ index.html
├─ styles.css
├─ app.js
├─ config.example.js # define window.APP_CONFIG = { API_URL: "" }
└─ assets/ # íconos y (opcional) un PDF de prueba
```

- **Layout (split 50/50)**:
- **Panel izquierdo**:
  - Zona drag&drop o botón “Seleccionar archivos”.
  - **Lista** de archivos (nombre, tamaño, tipo MIME).
  - **Reservado**: marco para **visor** (PDF／imagen) *futuro*.
- **Panel derecho**:
  - **Constructor de esquema**:
    - Botón “Agregar campo”.
    - Cada campo editable con controles:
      - **Nombre** (input text, **obligatorio**).
      - **Required** (checkbox; **default: true**).
      - **Description** (textarea opcional).
      - **Type** (select: `STRING`, `NUMBER`, `BOOLEAN`, `DATE`).
    - Sección “Esquema generado (preview)” que renderiza el **JSON** correspondiente (read-only).
  - **Botón** “Enviar” (disabled si no hay archivos o el esquema no es válido).
  - **Resultados**:
    - Si `ok=true`: **tabla** tipo CSV con columnas = nombres de campos del esquema; una fila por respuesta (demo: una).
    - Si `ok=false`: caja de **error** con mensaje claro.

### Wireframe rápido (ASCII)

```ascii
+---------------------------------+----------------------------------+
| Archivos | Esquema y Resultado |
| | |
| [ Drag&Drop / Seleccionar ] | Campos: |
| | [ + Agregar campo ] |
| Lista: | - Nombre: [_______] [Required] |
| • file1.pdf (120 KB, pdf) | Desc.: [______________] |
| • ticket.jpg (430 KB, image) | Type: [STRING▼] |
| | (repetir por cada campo) |
| [ Reservado visor futuro ] | |
| | Esquema (preview JSON) |
| | { ... } |
| | |
| | [ Enviar ] |
| | |
| | Resultado: |
| | +-----------------------------+ |
| | | campo | campo2 | ... | |
| | +-----------------------------+ |
+---------------------------------+----------------------------------+
```

## 7) Flujos (end-to-end)
1. **Preparación**  
   - Crear **proyecto GCP** nuevo.  
   - Crear **service account** y asignar **Vertex AI User**.  
   - Habilitar **Cloud Functions Gen2**, **Cloud Run**, **Vertex AI**.  
   - Desplegar la **Function** con esa SA.  
   - Anotar la **URL del endpoint** (p. ej. `https://…/extract`).
2. **Configurar frontend**  
   - Copiar `config.example.js` → `config.js`.  
   - Poner `API_URL` con la URL del endpoint.  
3. **Usar la web local**  
   - Abrir `index.html` servida estáticamente.  
   - Subir 1–N archivos pequeños.  
   - Agregar campos del esquema (mínimo 1, con Nombre).  
   - Presionar **Enviar**.  
   - Ver **tabla** con resultados o error.  

## 8) Lógica declarativa (sin código) para esquema plano (UI)
- **Generación del schema** en la web (preview y payload):
  - Arranca como:
    ```
    {
      "type": "OBJECT",
      "properties": {},
      "required": []
    }
    ```
  - Por cada campo en UI:
    - Insertar en `properties[Nombre]` un objeto con:
      - `type` según selección (`STRING` → `STRING`, etc.).
      - `description` si no está vacío.
    - Si `Required` está activo, **agregar `Nombre`** a la lista `required`.
  - **Tipos válidos demo**: `STRING`, `NUMBER`, `BOOLEAN`, `STRING` + `format: "date"` para `DATE`.  
  - **Validaciones UI**:
    - `Nombre`: no vacío, único.  
    - Al menos 1 campo total.  
  - **System instruction** por defecto (editable en un input simple):  
    - “No inventes datos. Responde solo JSON. Usa `null` si falta información. Respeta el esquema exactamente.”

## 9) Límites y comportamiento esperado
- Tamaño total de request (archivos + texto) **bajo** (≈ <20 MB).  
- Si excede, el backend responde **413** con mensaje que sugiera **V2 con GCS**.  
- **Cold start** aceptado (min-instances=0); no optimizamos latencia en v1.  
- **CORS** habilitado en la Function para permitir la web local durante la demo.

## 10) Seguridad (demo)
- **Sin API keys** en frontend.  
- Backend autenticado con **service account** (IAM) → **no exponer secretos**.  
- Endpoint público solo para pruebas (planificar restricción en versiones futuras).  
- No loguear contenido de archivos, solo metadatos mínimos (tamaño, mime, trace_id).

## 11) Pruebas y criterios de aceptación

**Backend (manual)**
- POST `application/json` sin archivos y con un schema simple → `ok=true`, JSON parseable.
- POST `multipart/form-data` con 1 PDF pequeño + schema → `ok=true`.
- Error de schema malformado → `400` + mensaje claro.
- Archivo muy grande → `413` + texto que sugiera V2 (GCS).
- Error de modelo (forzado) → `500` + `trace_id`.
- Todo el codigo y la documentacion va a ser en ingles

**Frontend (manual)**
- Configurar `API_URL`.  
- Subir 1–N archivos y verlos listados.  
- Crear 2–3 campos (Nombre, Required on/off, Description, Type variado).  
- Enviar y visualizar tabla con columnas = nombres de campos.  
- Forzar error (schema vacío o inválido en UI) y ver mensaje.  
- Cambiar un campo y reenviar → ver que la tabla se actualiza acorde.

**Aceptación**
- Se puede **abrir la web local** y **consumir el endpoint** con archivos reales de prueba, generando una **tabla** válida sin escribir código adicional.

## 12) Roadmap (post-demo, orden sugerido)
1. **V2 — GCS Signed URLs**: subir archivos directo desde la web → backend envía `gs://` a Gemini; elimina límite práctico y doble subida.  
2. **V2 — Visor**: PDF.js o `<img>` con fallback para imágenes (solo cargar si el archivo está en memoria o accesible).  
3. **V3 — Validación**: `jsonschema` server-side para rechazar o corregir formatos; normalización de fechas/monedas.  
4. **V3 — UX**: exportar CSV/JSON; recordar últimos esquemas en `localStorage`.  
5. **V4 — Operación**: auth básica del endpoint, rate-limits, métricas y logs estructurados, selección de modelo, canary.
