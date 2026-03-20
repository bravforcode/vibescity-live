import json
from datetime import UTC, datetime
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import get_settings


def _is_json_content_type(value: str) -> bool:
    text = str(value or "").lower()
    return "application/json" in text


def _safe_json_loads(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def _is_envelope(payload: Any) -> bool:
    return (
        isinstance(payload, dict)
        and "data" in payload
        and "meta" in payload
        and isinstance(payload.get("meta"), dict)
    )


class ApiContractMiddleware(BaseHTTPMiddleware):
    """
    Adds versioning headers to all API responses.
    If client opts in with `X-API-Envelope: 1`, wraps JSON body in {data, meta, errors}.
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.settings = get_settings()

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        path = str(request.url.path or "")
        if not path.startswith("/api/"):
            return response

        response.headers["X-API-Version"] = self.settings.API_VERSION
        if self.settings.API_DEPRECATED_AT:
            response.headers["X-API-Deprecated-At"] = self.settings.API_DEPRECATED_AT
        if self.settings.API_SUNSET_AT:
            response.headers["X-API-Sunset-At"] = self.settings.API_SUNSET_AT

        wants_envelope = (
            str(request.headers.get("x-api-envelope", "")).strip().lower() == "1"
        )
        if not wants_envelope:
            return response

        if not _is_json_content_type(response.headers.get("content-type", "")):
            return response

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        payload = _safe_json_loads(body)
        if payload is None:
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

        request_id = (
            str(getattr(getattr(request, "state", object()), "request_id", "") or "")
            or str(request.headers.get("x-request-id", "")).strip()
        )
        meta = {
            "version": self.settings.API_VERSION,
            "requestId": request_id,
            "timestamp": datetime.now(tz=UTC).isoformat(),
            "deprecatedAt": self.settings.API_DEPRECATED_AT or None,
            "sunsetAt": self.settings.API_SUNSET_AT or None,
        }

        if _is_envelope(payload):
            payload_meta = payload.get("meta") or {}
            payload["meta"] = {
                "version": payload_meta.get("version") or meta["version"],
                "requestId": payload_meta.get("requestId") or meta["requestId"],
                "timestamp": payload_meta.get("timestamp") or meta["timestamp"],
                "deprecatedAt": payload_meta.get("deprecatedAt")
                if payload_meta.get("deprecatedAt") is not None
                else meta["deprecatedAt"],
                "sunsetAt": payload_meta.get("sunsetAt")
                if payload_meta.get("sunsetAt") is not None
                else meta["sunsetAt"],
            }
            wrapped = payload
        else:
            errors = []
            if response.status_code >= 400:
                if isinstance(payload, dict):
                    detail = payload.get("detail") or payload.get("error")
                    if detail:
                        errors.append({"code": "API_ERROR", "message": str(detail)})
                elif payload:
                    errors.append({"code": "API_ERROR", "message": str(payload)})
            wrapped = {"data": payload, "meta": meta, "errors": errors}

        out = JSONResponse(status_code=response.status_code, content=wrapped)
        for key, value in response.headers.items():
            if key.lower() not in {"content-length", "content-type"}:
                out.headers[key] = value
        return out

