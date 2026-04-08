"""
Export Router - Merchant data export functionality
Supports PDF, Excel, and CSV formats
"""

import logging
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import Response

from app.core.rate_limit import limiter
from app.core.visitor_auth import require_valid_visitor
from app.services.export_service import export_service

router = APIRouter()
logger = logging.getLogger("app.export")


@router.get("/merchant")
@limiter.limit("5/minute")
async def export_merchant_report(
    request: Request,
    visitor_id: str = Query(...),
    report_type: Literal["venues", "insights"] = Query("venues"),
    format: Literal["pdf", "excel", "csv"] = Query("csv"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    x_visitor_token: str | None = Header(default=None, alias="X-Visitor-Token"),
):
    """
    Export reports for merchants in various formats.
    
    Filters:
    - visitor_id: Merchant's visitor ID
    - report_type: Type of data (venues, insights)
    - format: pdf, excel, or csv
    - start_date/end_date: ISO format dates
    """
    try:
        # Validate visitor
        normalized_visitor_id = require_valid_visitor(visitor_id, x_visitor_token)
        
        # Fetch data
        data = await export_service.fetch_merchant_data(
            normalized_visitor_id, report_type, start_date, end_date
        )
        
        filename = f"report_{report_type}_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}"
        
        if format == "csv":
            if not data:
                headers = []
            else:
                headers = list(data[0].keys())
            
            csv_content = await export_service.generate_csv(data, headers)
            return Response(
                content=csv_content,
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
            )
            
        elif format == "excel":
            excel_content = await export_service.generate_excel(
                data,
                sheet_name=report_type.capitalize(),
            )
            return Response(
                content=excel_content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}.xlsx"},
            )
            
        elif format == "pdf":
            pdf_content = await export_service.generate_pdf(
                data,
                title=f"Merchant {report_type.capitalize()} Report",
            )
            return Response(
                content=pdf_content,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}.pdf"},
            )
            
        else:
            raise HTTPException(status_code=400, detail="Invalid format")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Export failed: %s", str(e))
        raise HTTPException(status_code=500, detail="Report generation failed") from e
