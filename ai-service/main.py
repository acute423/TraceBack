"""Standalone FastAPI service for CLIP image and text embeddings."""

from __future__ import annotations

import base64
import binascii
import logging
import os
import threading
import warnings
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator
from starlette.responses import JSONResponse

from similarity import normalized_cosine_similarity

load_dotenv(Path(__file__).with_name(".env"), override=False)

LOGGER = logging.getLogger("ai_service")
MODEL_NAME = os.getenv("AI_MODEL_NAME", "clip-ViT-B-32")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BASE64_CHARS = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
MAX_IMAGE_PIXELS = 40_000_000
MAX_TEXT_LENGTH = 10_000
MAX_VECTOR_LENGTH = 4_096


def _positive_int_setting(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer.") from exc
    if parsed <= 0:
        raise RuntimeError(f"{name} must be a positive integer.")
    return parsed


MAX_REQUEST_BYTES = _positive_int_setting("AI_MAX_REQUEST_BYTES", 7 * 1024 * 1024)
LOAD_ON_STARTUP = os.getenv("AI_MODEL_LOAD_ON_STARTUP", "false").strip().lower() in {
    "1",
    "true",
    "yes",
}

_model: Any | None = None
_model_load_error: Exception | None = None
_model_lock = threading.Lock()


class ModelLoadError(RuntimeError):
    """Raised when the configured embedding model cannot be loaded."""


class EmbedImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: Annotated[str, Field(min_length=1, max_length=MAX_IMAGE_BASE64_CHARS)]


class EmbedTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]

    @field_validator("text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text must contain at least one non-whitespace character.")
        return value


class SimilarityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    a: Annotated[list[FiniteFloat], Field(min_length=1, max_length=MAX_VECTOR_LENGTH)]
    b: Annotated[list[FiniteFloat], Field(min_length=1, max_length=MAX_VECTOR_LENGTH)]


def _get_model() -> Any:
    global _model, _model_load_error

    with _model_lock:
        if _model is not None:
            return _model
        if _model_load_error is not None:
            raise ModelLoadError(
                f"Embedding model '{MODEL_NAME}' failed to load; check server logs."
            ) from _model_load_error

        try:
            from sentence_transformers import SentenceTransformer

            device = os.getenv("AI_DEVICE")
            model = SentenceTransformer(MODEL_NAME, **({"device": device} if device else {}))
            _model = model
            return model
        except Exception as exc:
            _model_load_error = exc
            LOGGER.exception("Failed to load embedding model %r.", MODEL_NAME)
            raise ModelLoadError(
                f"Embedding model '{MODEL_NAME}' could not be loaded; "
                "check model availability, configuration, and server logs."
            ) from exc


def _encode(value: str | Image.Image) -> list[float]:
    try:
        model = _get_model()
    except ModelLoadError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        with _model_lock:
            result = model.encode(
                [value],
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        return result[0].tolist()
    except Exception as exc:
        LOGGER.exception("Embedding inference failed.")
        raise HTTPException(
            status_code=500,
            detail="Embedding inference failed. Check server logs for details.",
        ) from exc


def _decode_image(encoded: str) -> Image.Image:
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="image must be valid base64-encoded JPEG or PNG bytes.",
        ) from exc

    if not raw:
        raise HTTPException(status_code=400, detail="image must not be empty.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Decoded image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.",
        )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as probe:
                image_format = probe.format
                if image_format not in {"JPEG", "PNG"}:
                    raise HTTPException(
                        status_code=415,
                        detail="Only JPEG and PNG images are supported.",
                    )
                if probe.width * probe.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Image dimensions exceed the {MAX_IMAGE_PIXELS:,}-pixel limit.",
                    )
                if getattr(probe, "n_frames", 1) != 1:
                    raise HTTPException(
                        status_code=415,
                        detail="Animated images are not supported.",
                    )
                probe.verify()

            with Image.open(BytesIO(raw)) as source:
                return source.convert("RGB")
    except HTTPException:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="image is invalid, corrupted, or exceeds safe decoding limits.",
        ) from exc


class RequestSizeLimitMiddleware:
    """Reject oversized request bodies before passing them to JSON parsing."""

    def __init__(self, app: Any, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_length = int(content_length)
                if declared_length < 0:
                    await self._bad_length(send)
                    return
                if declared_length > self.max_bytes:
                    await self._too_large(send)
                    return
            except ValueError:
                await self._bad_length(send)
                return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.max_bytes:
                await self._too_large(send)
                return
            if not message.get("more_body", False):
                break

        delivered = False

        async def replay_body() -> dict[str, Any]:
            nonlocal delivered
            if delivered:
                return {"type": "http.request", "body": b"", "more_body": False}
            delivered = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay_body, send)

    async def _too_large(self, send: Any) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": f"Request body exceeds the {self.max_bytes}-byte limit."},
        )
        await send(
            {
                "type": "http.response.start",
                "status": response.status_code,
                "headers": response.raw_headers,
            }
        )
        await send({"type": "http.response.body", "body": response.body})

    async def _bad_length(self, send: Any) -> None:
        response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
        await send(
            {
                "type": "http.response.start",
                "status": response.status_code,
                "headers": response.raw_headers,
            }
        )
        await send({"type": "http.response.body", "body": response.body})


@asynccontextmanager
async def lifespan(_: FastAPI):
    if LOAD_ON_STARTUP:
        try:
            await run_in_threadpool(_get_model)
        except ModelLoadError as exc:
            raise RuntimeError(str(exc)) from exc
    yield


app = FastAPI(title="TraceBack AI Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "degraded" if _model_load_error else "ok",
        "model": MODEL_NAME,
        "model_loaded": _model is not None,
    }


@app.post("/embed-image")
async def embed_image(payload: EmbedImageRequest) -> dict[str, list[float]]:
    image = _decode_image(payload.image)
    return {"embedding": await run_in_threadpool(_encode, image)}


@app.post("/embed-text")
async def embed_text(payload: EmbedTextRequest) -> dict[str, list[float]]:
    return {"embedding": await run_in_threadpool(_encode, payload.text)}


@app.post("/similarity")
async def similarity(payload: SimilarityRequest) -> dict[str, float]:
    try:
        score = normalized_cosine_similarity(payload.a, payload.b)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"similarity": score}
