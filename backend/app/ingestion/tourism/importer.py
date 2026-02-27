from __future__ import annotations

import argparse
import asyncio
import csv
import json
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import get_core_engine
from app.ingestion.tourism.normalizer import normalize_record

UPSERT_SQL = """
INSERT INTO authority_places (
  authority_id,
  name,
  lat,
  lng,
  province,
  category,
  district,
  address,
  status,
  source,
  source_ref,
  updated_at,
  raw_payload
) VALUES (
  :authority_id,
  :name,
  :lat,
  :lng,
  :province,
  :category,
  :district,
  :address,
  :status,
  :source,
  :source_ref,
  CASE
    WHEN :updated_at IS NULL OR :updated_at = '' THEN NULL
    ELSE CAST(:updated_at AS timestamptz)
  END,
  CAST(:raw_payload AS jsonb)
)
ON CONFLICT (authority_id) DO UPDATE SET
  name = EXCLUDED.name,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  province = EXCLUDED.province,
  category = EXCLUDED.category,
  district = EXCLUDED.district,
  address = EXCLUDED.address,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  source_ref = EXCLUDED.source_ref,
  updated_at = COALESCE(EXCLUDED.updated_at, authority_places.updated_at),
  raw_payload = EXCLUDED.raw_payload
"""


def _load_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _load_json(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError("JSON input must be an object or list of objects")


async def run_import(file_path: Path, fmt: str) -> None:
    raw_rows = _load_csv(file_path) if fmt == "csv" else _load_json(file_path)
    normalized_rows = [normalize_record(row) for row in raw_rows]

    session_maker = async_sessionmaker(
        get_core_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_maker() as db:
        for record in normalized_rows:
            params = dict(record)
            params["raw_payload"] = json.dumps(record["raw_payload"], ensure_ascii=False)
            await db.execute(text(UPSERT_SQL), params)
        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--format", required=True, choices=["csv", "json"])
    args = parser.parse_args()
    asyncio.run(run_import(Path(args.file), args.format))


if __name__ == "__main__":
    main()
