import logging

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.visitor_auth import (
    issue_visitor_token,
    normalize_visitor_id,
    payload_expiry_iso,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class VisitorBootstrapRequest(BaseModel):
    visitor_id: str


@router.post("/bootstrap")
async def bootstrap_visitor(body: VisitorBootstrapRequest):
    visitor_id = normalize_visitor_id(body.visitor_id)
    token, payload = issue_visitor_token(visitor_id)
    logger.info(
        "issued_visitor_token",
        extra={"visitor_id": visitor_id, "token_prefix": token[:6]},
    )
    return {
        "visitor_token": token,
        "expires_at": payload_expiry_iso(payload),
    }


@router.get("/bootstrap")
async def bootstrap_visitor_get(visitor_id: str = Query(...)):
    normalized = normalize_visitor_id(visitor_id)
    token, payload = issue_visitor_token(normalized)
    logger.info(
        "issued_visitor_token_get",
        extra={"visitor_id": normalized, "token_prefix": token[:6]},
    )
    return {
        "visitor_token": token,
        "expires_at": payload_expiry_iso(payload),
    }
