from __future__ import annotations

from datetime import datetime

import httpx

from app.services.places.osm_transform import transform_osm_element


def _iso_now() -> str:
    return datetime.now(datetime.UTC).isoformat()


class OSMOverpassProvider:
    provider_name = "osm"

    async def search_nearby(
        self,
        lat: float,
        lng: float,
        radius: int,
        limit: int = 50,
    ) -> list[dict]:
        query = f"""
          [out:json][timeout:25];
          (
            node["amenity"~"bar|pub|nightclub|cafe|restaurant|fast_food"](around:{radius},{lat},{lng});
            node["tourism"~"attraction|museum|viewpoint"](around:{radius},{lat},{lng});
            node["shop"~"mall|department_store"](around:{radius},{lat},{lng});
            node["amenity"="marketplace"](around:{radius},{lat},{lng});
            node["natural"="beach"](around:{radius},{lat},{lng});
            node["amenity"="place_of_worship"]["religion"="buddhist"](around:{radius},{lat},{lng});
            node["leisure"~"park|water_park"](around:{radius},{lat},{lng});
          );
          out body {limit};
        """

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0, read=20.0),
            limits=httpx.Limits(max_connections=10),
        ) as client:
            response = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            raw_data = response.json()

        out: list[dict] = []
        for element in raw_data.get("elements", []):
            place = transform_osm_element(element)
            if not place:
                continue
            place["updated_at"] = _iso_now()
            out.append(place)
            if len(out) >= limit:
                break
        return out
