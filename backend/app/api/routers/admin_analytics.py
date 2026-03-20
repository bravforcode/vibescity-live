"""
Unified Admin Analytics & Anonymous Sessions Router
Combines admin dashboard, anonymous session tracking, and Google Sheets integration
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...core.auth import verify_admin
from ...core.config import get_settings
from ...services.cache.redis_client import get_redis

router = APIRouter()
logger = logging.getLogger(__name__)

# ============================================================================
# PYDANTIC MODELS
# ============================================================================


class SessionCreateRequest(BaseModel):
    """Create anonymous session"""

    user_agent: str = Field(..., description="Browser user agent")
    referrer: str | None = Field(None, description="Page referrer")
    entry_point: str = Field(..., description="Initial page")
    timezone: str | None = Field("UTC", description="User timezone")
    screen_resolution: str | None = Field(None, description="Screen resolution")
    language: str | None = Field("en", description="Browser language")


class SessionUpdateRequest(BaseModel):
    """Update session data"""

    current_page: str = Field(..., description="Current page URL")
    page_title: str = Field(..., description="Page title")
    time_on_page: int = Field(..., description="Time on page (seconds)")
    scroll_depth: float = Field(0.0, description="Scroll depth %")
    interactions: list[dict[str, Any]] = Field(default_factory=list, description="User interactions")
    performance_metrics: dict[str, Any] | None = Field(None, description="Performance data")


class DataExportRequest(BaseModel):
    """Request data export"""

    data_type: str = Field(..., description="sessions | analytics | geo | summary")
    date_range: str | None = Field(None, description="24h | 7d | 30d")
    format: str = Field("json", description="json | csv | xlsx")
    anonymize: bool = Field(True, description="Anonymize PII")
    include_headers: bool = Field(True, description="Include headers")


class DataRetentionRequest(BaseModel):
    """Manage data retention"""

    retention_days: int = Field(..., description="Days to retain")
    apply_to: str = Field("all", description="all | sessions | analytics | geo")
    confirm_action: bool = Field(False, description="Confirmation required")


# ============================================================================
# GOOGLE SHEETS SERVICE (INLINE)
# ============================================================================


@dataclass
class SheetsConfig:
    """Google Sheets configuration"""

    credentials_path: str
    spreadsheet_id: str
    sheet_name: str = "Anonymous Analytics"
    enable_auto_sync: bool = True
    sync_interval_minutes: int = 15
    data_retention_days: int = 30
    enable_anonymization: bool = True
    gdpr_compliant: bool = True


class SheetsService:
    """Unified Google Sheets service for analytics data"""

    def __init__(self, config: SheetsConfig):
        self.config = config
        self.client = None
        self.spreadsheet = None
        self.worksheet = None
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize Google Sheets client"""
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            creds = Credentials.from_service_account_file(
                self.config.credentials_path,
                scopes=[
                    "https://www.googleapis.com/auth/spreadsheets",
                    "https://www.googleapis.com/auth/drive",
                ],
            )
            self.client = gspread.authorize(creds)
            self.spreadsheet = self.client.open_by_key(self.config.spreadsheet_id)

            try:
                self.worksheet = self.spreadsheet.worksheet(self.config.sheet_name)
                logger.info(f"Connected to sheets: {self.config.sheet_name}")
            except gspread.exceptions.WorksheetNotFound:
                self.worksheet = self.spreadsheet.add_worksheet(
                    title=self.config.sheet_name, rows="1000", cols="50"
                )
                self._setup_headers()
                logger.info(f"Created new sheets: {self.config.sheet_name}")

        except Exception as e:
            logger.error(f"Failed to initialize Google Sheets: {e}")
            raise

    def _setup_headers(self) -> None:
        """Setup worksheet headers"""
        try:
            headers = [
                "session_id",
                "created_at",
                "duration_seconds",
                "pages_visited",
                "country",
                "device_type",
                "browser",
                "bounce_rate",
                "conversions",
                "security_score",
                "behavior_pattern",
                "entry_point",
                "last_activity",
                "termination_reason",
                "data_retention_days",
            ]
            self.worksheet.append_row(headers)
            logger.info("Worksheet headers setup completed")
        except Exception as e:
            logger.error(f"Failed to setup headers: {e}")

    async def export_session_data(self, session_data: dict[str, Any]) -> bool:
        """Export single session to Google Sheets"""
        try:
            row_data = [
                self._anonymize_if_needed(session_data.get("session_id", ""), "session_id"),
                session_data.get("created_at", ""),
                session_data.get("duration_seconds", 0),
                session_data.get("pages_visited", 0),
                self._anonymize_if_needed(session_data.get("country", ""), "country"),
                session_data.get("device_type", ""),
                session_data.get("browser", ""),
                session_data.get("bounce_rate", 0.0),
                session_data.get("conversions", 0),
                session_data.get("security_score", 0.0),
                session_data.get("behavior_pattern", ""),
                self._anonymize_if_needed(session_data.get("entry_point", ""), "entry_point"),
                session_data.get("last_activity", ""),
                session_data.get("termination_reason", ""),
                self.config.data_retention_days,
            ]

            self.worksheet.append_row(row_data)
            logger.info(f"Exported session: {session_data.get('session_id')}")
            return True

        except Exception as e:
            logger.error(f"Failed to export session: {e}")
            return False

    async def export_analytics_summary(self, analytics_data: dict[str, Any]) -> bool:
        """Export analytics summary"""
        try:
            # Get or create summary worksheet
            try:
                summary_ws = self.spreadsheet.worksheet("Analytics Summary")
            except gspread.exceptions.WorksheetNotFound:
                summary_ws = self.spreadsheet.add_worksheet(
                    title="Analytics Summary", rows="1000", cols="15"
                )
                summary_headers = [
                    "Period Start",
                    "Period End",
                    "Total Sessions",
                    "Unique Visitors",
                    "Total Page Views",
                    "Avg Session Duration",
                    "Bounce Rate",
                    "Conversion Rate",
                    "Top Country",
                    "Top Device",
                    "Export Timestamp",
                ]
                summary_ws.append_row(summary_headers)

            summary_row = [
                analytics_data.get("period_start", ""),
                analytics_data.get("period_end", ""),
                analytics_data.get("total_sessions", 0),
                analytics_data.get("unique_visitors", 0),
                analytics_data.get("total_page_views", 0),
                analytics_data.get("avg_session_duration", 0),
                analytics_data.get("bounce_rate", 0),
                analytics_data.get("conversion_rate", 0),
                analytics_data.get("top_country", ""),
                analytics_data.get("top_device", ""),
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ]

            summary_ws.append_row(summary_row)
            logger.info("Exported analytics summary")
            return True

        except Exception as e:
            logger.error(f"Failed to export analytics: {e}")
            return False

    async def sync_batch_data(self, batch_data: list[dict[str, Any]]) -> bool:
        """Batch export sessions"""
        try:
            if not batch_data:
                return True

            batch_rows = []
            for session_data in batch_data:
                row = [
                    self._anonymize_if_needed(session_data.get("session_id", ""), "session_id"),
                    session_data.get("created_at", ""),
                    session_data.get("duration_seconds", 0),
                    session_data.get("pages_visited", 0),
                    self._anonymize_if_needed(session_data.get("country", ""), "country"),
                    session_data.get("device_type", ""),
                    session_data.get("browser", ""),
                    session_data.get("bounce_rate", 0.0),
                    session_data.get("conversions", 0),
                    session_data.get("security_score", 0.0),
                    session_data.get("behavior_pattern", ""),
                    self._anonymize_if_needed(session_data.get("entry_point", ""), "entry_point"),
                    session_data.get("last_activity", ""),
                    session_data.get("termination_reason", ""),
                    self.config.data_retention_days,
                ]
                batch_rows.append(row)

            self.worksheet.append_rows(batch_rows)
            logger.info(f"Batch exported {len(batch_rows)} records")
            return True

        except Exception as e:
            logger.error(f"Failed to batch export: {e}")
            return False

    async def get_sheet_data(self, worksheet_name: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Get data from worksheet"""
        try:
            target_ws = self.worksheet
            if worksheet_name:
                target_ws = self.spreadsheet.worksheet(worksheet_name)

            all_data = target_ws.get_all_values()
            if not all_data or len(all_data) < 2:
                return []

            headers = all_data[0]
            rows = all_data[1 : limit + 1]
            result = []

            for row in rows:
                row_dict = {}
                for i, header in enumerate(headers):
                    if i < len(row):
                        row_dict[header] = row[i]
                result.append(row_dict)

            return result

        except Exception as e:
            logger.error(f"Failed to get sheet data: {e}")
            return []

    async def clear_old_data(self, retention_days: int | None = None) -> bool:
        """Clear old data (GDPR compliance)"""
        try:
            retention_period = retention_days or self.config.data_retention_days
            cutoff_date = datetime.now() - timedelta(days=retention_period)

            all_data = self.worksheet.get_all_values()
            if not all_data or len(all_data) < 2:
                return True

            headers = all_data[0]
            rows = all_data[1:]

            # Find date column
            date_column_index = 1  # Default to "created_at"
            for i, header in enumerate(headers):
                if "created_at" in header.lower():
                    date_column_index = i
                    break

            rows_to_keep = []
            for row in rows:
                if len(row) > date_column_index:
                    try:
                        row_date = datetime.strptime(row[date_column_index], "%Y-%m-%d %H:%M:%S")
                        if row_date >= cutoff_date:
                            rows_to_keep.append(row)
                    except ValueError:
                        rows_to_keep.append(row)
                else:
                    rows_to_keep.append(row)

            self.worksheet.clear()
            all_filtered_data = [headers] + rows_to_keep
            self.worksheet.append_rows(all_filtered_data)

            logger.info(f"Cleared old data, kept {len(rows_to_keep)} records")
            return True

        except Exception as e:
            logger.error(f"Failed to clear old data: {e}")
            return False

    async def test_connection(self) -> bool:
        """Test Google Sheets connection"""
        try:
            if self.worksheet:
                _ = self.worksheet.title
            return True
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False

    def _anonymize_if_needed(self, value: str, field_name: str) -> str:
        """Anonymize sensitive fields if enabled"""
        if not value or not self.config.enable_anonymization:
            return value

        if "session_id" in field_name.lower():
            return value[:8] + "..." if len(value) > 8 else value
        if "country" in field_name.lower() or "entry_point" in field_name.lower():
            return value[:3].upper() if len(value) > 3 else value

        return value


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def _get_sheets_service() -> SheetsService:
    """Get or create sheets service instance"""
    settings = get_settings()
    config = SheetsConfig(
        credentials_path=settings.GOOGLE_SHEETS_CREDENTIALS_PATH,
        spreadsheet_id=settings.GOOGLE_SHEETS_SPREADSHEET_ID,
        sheet_name=settings.GOOGLE_SHEETS_SHEET_NAME,
        enable_auto_sync=settings.GOOGLE_SHEETS_AUTO_SYNC,
        sync_interval_minutes=settings.GOOGLE_SHEETS_SYNC_INTERVAL,
        data_retention_days=settings.GOOGLE_SHEETS_DATA_RETENTION_DAYS,
        enable_anonymization=settings.GOOGLE_SHEETS_ENABLE_ANONYMIZATION,
    )
    return SheetsService(config)


# ============================================================================
# ANONYMOUS SESSIONS ENDPOINTS (Public/Visitor)
# ============================================================================


@router.post("/analytics/sessions/start")
async def create_session(
    request: Request, data: SessionCreateRequest, redis_client=Depends(get_redis)
):
    """Start anonymous session"""
    try:
        import uuid

        session_id = str(uuid.uuid4())
        session_data = {
            "session_id": session_id,
            "created_at": datetime.utcnow().isoformat(),
            "entry_point": data.entry_point,
            "pages_visited": [data.entry_point],
            "total_time": 0,
            "user_agent": data.user_agent,
            "language": data.language,
        }

        # Store in Redis
        redis_client.setex(
            f"session:{session_id}",
            int(timedelta(hours=24).total_seconds()),
            json.dumps(session_data),
        )

        logger.info(f"Created session: {session_id}")

        return {
            "session_id": session_id,
            "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
        }

    except Exception as e:
        logger.exception(f"Failed to create session: {e}")
        raise HTTPException(status_code=500, detail=f"Session creation failed: {str(e)}")


@router.put("/analytics/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: Request,
    data: SessionUpdateRequest,
    redis_client=Depends(get_redis),
):
    """Update session activity"""
    try:
        session_key = f"session:{session_id}"
        session_data = redis_client.get(session_key)

        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found")

        session_info = json.loads(session_data)
        session_info["current_page"] = data.current_page
        session_info["page_title"] = data.page_title
        session_info["last_activity"] = datetime.utcnow().isoformat()

        if data.current_page not in session_info.get("pages_visited", []):
            session_info["pages_visited"].append(data.current_page)

        session_info["total_time"] = session_info.get("total_time", 0) + data.time_on_page

        redis_client.setex(session_key, int(timedelta(hours=24).total_seconds()), json.dumps(session_info))

        logger.info(f"Updated session: {session_id}")
        return {"status": "updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to update session: {e}")
        raise HTTPException(status_code=500, detail=f"Session update failed: {str(e)}")


@router.post("/analytics/sessions/{session_id}/events")
async def track_event(
    session_id: str,
    request: Request,
    event_data: dict[str, Any],
    redis_client=Depends(get_redis),
):
    """Track conversion/event"""
    try:
        session_key = f"session:{session_id}"
        if not redis_client.get(session_key):
            raise HTTPException(status_code=404, detail="Session not found")

        event_log_key = f"events:{session_id}"
        redis_client.lpush(
            event_log_key,
            json.dumps({
                "timestamp": datetime.utcnow().isoformat(),
                "type": event_data.get("event_type"),
                "name": event_data.get("event_name"),
                "properties": event_data.get("properties", {}),
            }),
        )
        redis_client.expire(event_log_key, int(timedelta(days=7).total_seconds()))

        logger.info(f"Tracked event for session: {session_id}")
        return {"status": "tracked"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to track event: {e}")
        raise HTTPException(status_code=500, detail=f"Event tracking failed: {str(e)}")


@router.delete("/analytics/sessions/{session_id}")
async def terminate_session(
    session_id: str,
    request: Request,
    redis_client=Depends(get_redis),
):
    """Terminate session"""
    try:
        session_key = f"session:{session_id}"
        if not redis_client.get(session_key):
            raise HTTPException(status_code=404, detail="Session not found")

        redis_client.delete(session_key)
        redis_client.delete(f"events:{session_id}")
        redis_client.delete(f"interactions:{session_id}")

        logger.info(f"Terminated session: {session_id}")
        return {"status": "terminated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to terminate session: {e}")
        raise HTTPException(status_code=500, detail="Session termination failed")


# ============================================================================
# ADMIN DASHBOARD ENDPOINTS (verify_admin)
# ============================================================================


@router.get("/admin/dashboard")
async def get_dashboard(
    user: dict = Depends(verify_admin),
    redis_client=Depends(get_redis),
):
    """Get admin dashboard summary"""
    try:
        # Get recent sessions from Redis
        sessions_pattern = redis_client.keys("session:*")
        total_sessions = len(sessions_pattern)

        # Mock analytics
        return {
            "total_sessions": total_sessions,
            "unique_visitors": max(1, total_sessions // 2),
            "avg_session_duration": 245,
            "top_countries": [("US", 450), ("GB", 230), ("CA", 180)],
            "recent_exports": [],
            "geo_distribution": [],
            "last_sync": datetime.now().isoformat(),
            "sheet_status": "connected",
            "admin_user": user.get("email", "admin"),
        }

    except Exception as e:
        logger.error(f"Failed to get dashboard: {e}")
        raise HTTPException(status_code=500, detail="Dashboard retrieval failed")


@router.get("/admin/sessions")
async def get_sessions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(verify_admin),
    redis_client=Depends(get_redis),
):
    """Get sessions list"""
    try:
        sessions_pattern = redis_client.keys("session:*")
        sessions_data = []

        for key in sessions_pattern[offset : offset + limit]:
            session_json = redis_client.get(key)
            if session_json:
                sessions_data.append(json.loads(session_json))

        return {
            "sessions": sessions_data,
            "pagination": {
                "total": len(sessions_pattern),
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < len(sessions_pattern),
            },
        }

    except Exception as e:
        logger.error(f"Failed to get sessions: {e}")
        raise HTTPException(status_code=500, detail="Sessions retrieval failed")


@router.post("/admin/export")
async def export_data(
    request: DataExportRequest,
    user: dict = Depends(verify_admin),
    redis_client=Depends(get_redis),
):
    """Export data to Google Sheets"""
    try:
        sheets_service = _get_sheets_service()

        # Get session data
        sessions_pattern = redis_client.keys("session:*")
        sessions_data = []

        for key in sessions_pattern:
            session_json = redis_client.get(key)
            if session_json:
                sessions_data.append(json.loads(session_json))

        # Export based on type
        if request.data_type == "sessions":
            success = await sheets_service.sync_batch_data(sessions_data[:100])
        elif request.data_type == "analytics":
            analytics = {
                "period_start": datetime.now().isoformat(),
                "period_end": datetime.now().isoformat(),
                "total_sessions": len(sessions_data),
                "unique_visitors": max(1, len(sessions_data) // 2),
                "total_page_views": sum(len(s.get("pages_visited", [])) for s in sessions_data),
                "avg_session_duration": 245,
                "bounce_rate": 0.35,
                "conversion_rate": 0.025,
                "top_country": "US",
                "top_device": "desktop",
            }
            success = await sheets_service.export_analytics_summary(analytics)
        else:
            raise HTTPException(status_code=400, detail="Invalid data type")

        if success:
            logger.info(f"Data exported by {user.get('email')}: {request.data_type}")
            return {"message": "Export successful", "exported_at": datetime.now().isoformat()}

        raise HTTPException(status_code=500, detail="Export failed")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export data: {e}")
        raise HTTPException(status_code=500, detail="Export failed")


@router.get("/analytics/sheets/test")
async def test_sheets_connection():
    """Test Google Sheets connection (public endpoint for debugging)"""
    try:
        sheets_service = _get_sheets_service()
        connection_ok = await sheets_service.test_connection()

        return {
            "connection_status": "connected" if connection_ok else "failed",
            "tested_at": datetime.now().isoformat(),
            "message": "Google Sheets connection test successful" if connection_ok else "Connection failed",
        }

    except Exception as e:
        logger.error(f"Failed to check sheets status: {e}")
        return {
            "connection_status": "error",
            "tested_at": datetime.now().isoformat(),
            "error": str(e),
            "message": "Check backend logs for details"
        }


@router.get("/admin/sheets/status")
async def get_sheets_status(
    user: dict = Depends(verify_admin),
):
    """Check Google Sheets connection (admin only)"""
    try:
        sheets_service = _get_sheets_service()
        connection_ok = await sheets_service.test_connection()

        return {
            "connection_status": "connected" if connection_ok else "failed",
            "tested_at": datetime.now().isoformat(),
        }

    except Exception as e:
        logger.error(f"Failed to check sheets status: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")


@router.post("/admin/sheets/sync")
async def manual_sync(
    user: dict = Depends(verify_admin),
    redis_client=Depends(get_redis),
):
    """Manual data sync to Google Sheets"""
    try:
        sheets_service = _get_sheets_service()

        # Get all sessions
        sessions_pattern = redis_client.keys("session:*")
        sessions_data = []

        for key in sessions_pattern:
            session_json = redis_client.get(key)
            if session_json:
                sessions_data.append(json.loads(session_json))

        # Sync
        success = await sheets_service.sync_batch_data(sessions_data)

        if success:
            logger.info(f"Manual sync by {user.get('email')}: {len(sessions_data)} sessions")
            return {"message": "Sync successful", "synced_at": datetime.now().isoformat()}

        raise HTTPException(status_code=500, detail="Sync failed")

    except Exception as e:
        logger.error(f"Failed to sync: {e}")
        raise HTTPException(status_code=500, detail="Sync failed")


@router.post("/admin/data-retention")
async def manage_retention(
    request: DataRetentionRequest,
    user: dict = Depends(verify_admin),
):
    """Manage data retention policy"""
    try:
        if not request.confirm_action:
            raise HTTPException(status_code=400, detail="Confirmation required")

        if request.retention_days < 1 or request.retention_days > 365:
            raise HTTPException(status_code=400, detail="Invalid retention period")

        sheets_service = _get_sheets_service()
        success = await sheets_service.clear_old_data(request.retention_days)

        if success:
            logger.info(f"Retention updated by {user.get('email')}: {request.retention_days} days")
            return {
                "message": "Retention policy updated",
                "retention_days": request.retention_days,
                "updated_at": datetime.now().isoformat(),
            }

        raise HTTPException(status_code=500, detail="Retention update failed")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to manage retention: {e}")
        raise HTTPException(status_code=500, detail="Retention management failed")


@router.get("/admin/audit-log")
async def get_audit_log(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(verify_admin),
):
    """Get audit log"""
    # Mock audit log
    return {
        "audit_log": [
            {
                "timestamp": datetime.now().isoformat(),
                "event_type": "data_export",
                "username": user.get("email"),
                "details": {"data_type": "sessions"},
            }
        ],
        "pagination": {"limit": limit, "offset": offset, "total": 1},
    }
