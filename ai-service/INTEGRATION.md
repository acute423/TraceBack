# AI service setup and integration

## Windows setup

From the repository root, create and activate a virtual environment, then install
the service dependencies:

```powershell
py -3.11 -m venv ai-service\.venv
ai-service\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r ai-service\requirements.txt
if (-not (Test-Path ai-service\.env)) { Copy-Item ai-service\.env.example ai-service\.env }
```

Start the API from the service directory:

```powershell
Set-Location ai-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The model loads on the first embedding request by default. The first call may
download the `clip-ViT-B-32` weights and therefore take longer. Set
`AI_MODEL_LOAD_ON_STARTUP=true` in `ai-service\.env` to load it at startup and
fail startup immediately if it cannot be loaded. The service does not substitute
another model.

## API

- `GET /health` reports service status and whether model weights are loaded.
- `POST /embed-image` accepts JSON `{"image":"<base64 JPEG or PNG bytes>"}`.
- `POST /embed-text` accepts JSON `{"text":"a short description"}`.
- `POST /similarity` accepts JSON `{"a":[...],"b":[...]}` and returns cosine
  similarity mapped to `[0,1]`.

Embedding routes return `{"embedding":[...]}`. Images are limited to 5 MiB
decoded and JSON request bodies to 7 MiB by default. Text is limited to 10,000
characters.

## Model-free tests

Run the unit tests from the service directory. They use only Python's standard
library and do not load or download the model:

```powershell
Set-Location ai-service
python -m unittest discover -s tests -v
```

## Server integration notes

Configure the server-side AI base URL as `http://127.0.0.1:8000`; keep model
weights and model-loading configuration owned by this service. The expected
embedding response shape is a JSON object with a numeric `embedding` array.
Similarity requests must supply same-length, finite, non-zero vectors. A model
loading or inference problem returns a clear error rather than a fallback
embedding.
