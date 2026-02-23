import json
from typing import Optional

import redis

from app.core.config import get_settings

settings = get_settings()
_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client:
        return _redis_client
    if not settings.REDIS_URL:
        raise RuntimeError("Missing REDIS_URL for OCR queue")
    _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def enqueue_ocr_job(order_id: str) -> str:
    r = get_redis()
    payload = {"order_id": order_id}
    msg_id = r.xadd(
        settings.OCR_QUEUE_STREAM,
        {"payload": json.dumps(payload, ensure_ascii=False)},
    )
    return msg_id
