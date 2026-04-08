"""
Export Service - Generates reports in CSV, Excel, and PDF formats.
Handles data filtering by date, type, and merchant.
"""

import asyncio
import csv
import io
import logging
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)


class ExportService:
    """
    Service for exporting merchant data.
    """

    async def generate_csv(self, data: list[dict[str, Any]], headers: list[str]) -> str:
        """
        Generates a CSV string from a list of dictionaries.
        """
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue()

    async def generate_excel(self, data: list[dict[str, Any]], sheet_name: str = "Report") -> bytes:
        """
        Generates an Excel (XLSX) binary from a list of dictionaries.
        """
        try:
            import pandas as pd

            df = pd.DataFrame(data)
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name=sheet_name)
            return output.getvalue()
        except ImportError as exc:
            logger.error("pandas or openpyxl not installed for Excel export")
            raise HTTPException(
                status_code=501,
                detail="Excel export not supported on this server",
            ) from exc

    async def generate_pdf(self, data: list[dict[str, Any]], title: str) -> bytes:
        """
        Generates a PDF binary from data.
        """
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

            output = io.BytesIO()
            doc = SimpleDocTemplate(output, pagesize=letter)
            elements = []
            
            styles = getSampleStyleSheet()
            elements.append(Paragraph(title, styles["Title"]))
            elements.append(Spacer(1, 12))
            
            if not data:
                elements.append(
                    Paragraph(
                        "No data available for the selected period.",
                        styles["Normal"],
                    ),
                )
            else:
                # Prepare table data
                headers = list(data[0].keys())
                table_data = [headers]
                for item in data:
                    table_data.append([str(item.get(h, "")) for h in headers])

                # Create table
                t = Table(table_data)
                table_styles = [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ]
                table_styles.extend(
                    (
                        "BACKGROUND",
                        (0, i),
                        (-1, i),
                        colors.beige if i % 2 == 0 else colors.white,
                    )
                    for i in range(1, len(table_data))
                )
                t.setStyle(TableStyle(table_styles))
                elements.append(t)

            doc.build(elements)
            return output.getvalue()
        except ImportError as exc:
            logger.error("reportlab not installed for PDF export")
            raise HTTPException(
                status_code=501,
                detail="PDF export not supported on this server",
            ) from exc

    async def fetch_merchant_data(self, visitor_id: str, report_type: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
        """
        Fetches data from Supabase based on filters.
        """
        from app.core.supabase import supabase_admin as supabase
        
        if report_type == "venues":
            query = supabase.table("venues").select("*").eq("owner_visitor_id", visitor_id)
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
            
            response = await asyncio.to_thread(query.execute)
            return response.data or []
            
        elif report_type == "insights":
            # Fetch venues first
            venue_res = await asyncio.to_thread(
                lambda: supabase.table("venues")
                .select("id")
                .eq("owner_visitor_id", visitor_id)
                .execute(),
            )
            venue_ids = [v["id"] for v in (venue_res.data or [])]
            
            if not venue_ids:
                return []
                
            query = supabase.table("analytics_events").select("*").in_("venue_id", venue_ids)
            if start_date:
                query = query.gte("created_at", start_date)
            if end_date:
                query = query.lte("created_at", end_date)
                
            response = await asyncio.to_thread(query.execute)
            return response.data or []
            
        return []

export_service = ExportService()
