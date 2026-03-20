"""
Security endpoints for CSP violation reporting and monitoring
Task 4 (E1): Content Security Policy implementation
"""
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class CSPViolation(BaseModel):
    """CSP violation report schema"""
    document_uri: str = Field(..., alias="document-uri")
    referrer: str | None = None
    violated_directive: str = Field(..., alias="violated-directive")
    effective_directive: str = Field(..., alias="effective-directive")
    original_policy: str = Field(..., alias="original-policy")
    disposition: str
    blocked_uri: str = Field(..., alias="blocked-uri")
    line_number: int | None = Field(None, alias="line-number")
    column_number: int | None = Field(None, alias="column-number")
    source_file: str | None = Field(None, alias="source-file")
    status_code: int | None = Field(None, alias="status-code")
    script_sample: str | None = Field(None, alias="script-sample")

    class Config:
        populate_by_name = True


class CSPReport(BaseModel):
    """CSP report wrapper"""
    csp_report: CSPViolation = Field(..., alias="csp-report")

    class Config:
        populate_by_name = True


# In-memory storage for CSP violations (replace with database in production)
csp_violations: list[dict[str, Any]] = []
MAX_VIOLATIONS = 1000  # Keep last 1000 violations


@router.post("/csp-report", status_code=204, include_in_schema=False)
async def csp_violation_report(request: Request):
    """
    CSP violation reporting endpoint
    Receives reports from browsers when CSP is violated
    """
    try:
        # Parse CSP report
        body = await request.json()

        # Handle both old and new CSP report formats
        if "csp-report" in body:
            report = CSPReport(**body)
            violation = report.csp_report
        else:
            # New format (Report-To API)
            violation = CSPViolation(**body)

        # Store violation with metadata
        violation_data = {
            "timestamp": datetime.now(UTC).isoformat(),
            "user_agent": request.headers.get("user-agent"),
            "ip_address": request.client.host if request.client else None,
            "violation": violation.model_dump(by_alias=True),
        }

        # Add to in-memory storage
        csp_violations.append(violation_data)

        # Keep only last MAX_VIOLATIONS
        if len(csp_violations) > MAX_VIOLATIONS:
            csp_violations.pop(0)

        # Log violation
        logger.warning(
            "CSP violation detected",
            extra={
                "violated_directive": violation.violated_directive,
                "blocked_uri": violation.blocked_uri,
                "document_uri": violation.document_uri,
                "source_file": violation.source_file,
            },
        )

    except Exception as exc:
        logger.error("Failed to process CSP report: %s", exc, exc_info=True)

    # Always return 204 No Content (don't leak errors to client)
    return None


@router.get("/csp-violations")
async def get_csp_violations(
    limit: int = 100,
    directive: str | None = None,
) -> dict[str, Any]:
    """
    Get CSP violations for monitoring
    
    Args:
        limit: Maximum number of violations to return
        directive: Filter by violated directive
    """
    violations = csp_violations.copy()

    # Filter by directive if specified
    if directive:
        violations = [
            v
            for v in violations
            if directive in v["violation"].get("violated-directive", "")
        ]

    # Limit results
    violations = violations[-limit:]

    # Calculate statistics
    stats = _calculate_violation_stats(violations)

    return {
        "total": len(violations),
        "violations": violations,
        "statistics": stats,
    }


@router.get("/csp-violations/stats")
async def get_csp_violation_stats() -> dict[str, Any]:
    """Get CSP violation statistics"""
    return _calculate_violation_stats(csp_violations)


def _calculate_violation_stats(violations: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate statistics from violations"""
    if not violations:
        return {
            "total_violations": 0,
            "by_directive": {},
            "by_blocked_uri": {},
            "by_source_file": {},
        }
    by_directive: dict[str, int] = {}
    by_blocked_uri: dict[str, int] = {}
    by_source_file: dict[str, int] = {}

    for v in violations:
        violation = v.get("violation", {})

        # Count by directive
        directive = violation.get("violated-directive", "unknown")
        by_directive[directive] = by_directive.get(directive, 0) + 1

        # Count by blocked URI
        blocked_uri = violation.get("blocked-uri", "unknown")
        by_blocked_uri[blocked_uri] = by_blocked_uri.get(blocked_uri, 0) + 1

        # Count by source file
        source_file = violation.get("source-file", "unknown")
        if source_file and source_file != "unknown":
            by_source_file[source_file] = by_source_file.get(source_file, 0) + 1

    return {
        "total_violations": len(violations),
        "by_directive": dict(
            sorted(by_directive.items(), key=lambda item: item[1], reverse=True),
        ),
        "by_blocked_uri": dict(
            sorted(by_blocked_uri.items(), key=lambda item: item[1], reverse=True)[:10],
        ),
        "by_source_file": dict(
            sorted(by_source_file.items(), key=lambda item: item[1], reverse=True)[:10],
        ),
    }


@router.delete("/csp-violations")
async def clear_csp_violations() -> dict[str, str]:
    """Clear all stored CSP violations"""
    csp_violations.clear()
    return {"message": "CSP violations cleared"}
