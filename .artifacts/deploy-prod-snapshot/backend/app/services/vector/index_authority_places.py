from __future__ import annotations

import argparse
import asyncio

from qdrant_client.models import PointStruct
from sqlalchemy import text

from app.db.session import get_core_db, get_vector_client
from app.services.vector.places_vector_service import (
    build_embedding_text,
    embed_text,
    ensure_collection_once,
    make_payload,
    make_point_id,
    upsert_points,
)

SQL = """
SELECT
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
  COALESCE(updated_at::text, '') AS updated_at
FROM authority_places
WHERE status IS NULL OR status != 'inactive'
ORDER BY created_at DESC
"""


async def run(batch_size: int = 500) -> None:
    async for vector_client in get_vector_client():
        await ensure_collection_once(vector_client)

        async for db in get_core_db():
            result = await db.execute(text(SQL))
            rows = result.mappings().all()

            batch: list[PointStruct] = []
            for row in rows:
                embedding_text = build_embedding_text(row)
                vector = await embed_text(embedding_text)
                batch.append(
                    PointStruct(
                        id=make_point_id(str(row["authority_id"])),
                        vector=vector,
                        payload=make_payload(row),
                    )
                )
                if len(batch) >= batch_size:
                    await upsert_points(vector_client, batch)
                    batch = []

            if batch:
                await upsert_points(vector_client, batch)
            break

        break


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    asyncio.run(run(args.batch_size))


if __name__ == "__main__":
    main()
