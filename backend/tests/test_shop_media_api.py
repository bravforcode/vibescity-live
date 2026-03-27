import asyncio
from types import SimpleNamespace

import app.api.routers.shops as shops_router
from app.services.venue_media_service import VenueMediaService


class _FakeQuery:
    def __init__(self, dataset):
        self.dataset = dataset
        self._eq_filters = []
        self._in_filters = []
        self._null_filters = []
        self._limit = None
        self._order_key = None
        self._order_desc = False

    def select(self, *_args, **_kwargs):
        return self

    def is_(self, key, value):
        self._null_filters.append((key, value))
        return self

    def eq(self, key, value):
        self._eq_filters.append((key, value))
        return self

    def in_(self, key, values):
        self._in_filters.append((key, set(values)))
        return self

    def order(self, key, desc=False):
        self._order_key = key
        self._order_desc = desc
        return self

    def limit(self, value):
        self._limit = value
        return self

    def execute(self):
        if isinstance(self.dataset, Exception):
            raise self.dataset

        rows = [dict(row) for row in self.dataset]
        for key, value in self._null_filters:
            if str(value).lower() == "null":
                rows = [row for row in rows if row.get(key) is None]
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]
        for key, values in self._in_filters:
            rows = [row for row in rows if row.get(key) in values]
        if self._order_key:
            rows = sorted(
                rows,
                key=lambda row: row.get(self._order_key) or "",
                reverse=self._order_desc,
            )
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=rows)


class _FakeClient:
    def __init__(self, sources):
        self.sources = sources

    def table(self, name):
        return _FakeQuery(self.sources.get(name, []))


def test_list_shop_media_includes_all_shops_and_merges_sources():
    service = VenueMediaService(
        client=_FakeClient(
            {
                "venues": [
                    {
                        "id": "v1",
                        "name": "Kai Mango",
                        "slug": "kai-mango",
                        "image_urls": ["https://cdn.example.com/kai-1.jpg"],
                        "video_url": "https://cdn.example.com/kai.mp4",
                        "latitude": 18.78,
                        "longitude": 98.98,
                        "social_links": {"instagram": "https://instagram.com/kai"},
                    },
                    {
                        "id": "v2",
                        "name": "Momo",
                        "slug": "momo",
                        "image_urls": [],
                        "video_url": "",
                        "latitude": 18.79,
                        "longitude": 98.99,
                        "social_links": {},
                    },
                    {
                        "id": "v3",
                        "name": "Quiet Shop",
                        "slug": "quiet-shop",
                        "image_urls": [],
                        "video_url": "",
                        "latitude": 18.80,
                        "longitude": 99.00,
                        "social_links": {},
                    },
                ],
                "venue_photos": [
                    {
                        "id": 1,
                        "venue_id": "v2",
                        "image_url": "https://ugc.example.com/momo-1.jpg",
                        "status": "approved",
                        "created_at": "2026-03-27T12:00:00Z",
                    },
                    {
                        "id": 2,
                        "venue_id": "v2",
                        "image_url": "https://ugc.example.com/momo-pending.jpg",
                        "status": "pending",
                        "created_at": "2026-03-27T13:00:00Z",
                    },
                ],
            }
        )
    )

    payload = service.list_shop_media(limit=10, offset=0, include_missing=True)

    assert payload["summary"]["total_shops"] == 3
    assert payload["summary"]["shops_with_media"] == 2

    by_id = {item["shop_id"]: item for item in payload["data"]}
    assert by_id["v1"]["images"] == ["https://cdn.example.com/kai-1.jpg"]
    assert by_id["v1"]["videos"] == ["https://cdn.example.com/kai.mp4"]
    assert by_id["v2"]["images"] == ["https://ugc.example.com/momo-1.jpg"]
    assert by_id["v2"]["coverage"]["has_images"] is True
    assert by_id["v2"]["coverage"]["has_videos"] is False
    assert by_id["v3"]["coverage"]["has_media"] is False


def test_get_shop_media_can_hydrate_missing_image():
    service = VenueMediaService(
        client=_FakeClient(
            {
                "venues": [
                    {
                        "id": "v9",
                        "name": "No Image Yet",
                        "slug": "no-image-yet",
                        "image_urls": [],
                        "video_url": "",
                        "latitude": 18.81,
                        "longitude": 98.97,
                        "social_links": {},
                    }
                ],
                "venue_photos": [],
            }
        )
    )

    async def _fake_google_lookup(_row):
        return "https://maps.googleapis.com/maps/api/place/photo?photo_reference=test"

    service._lookup_google_place_photo = _fake_google_lookup

    payload = asyncio.run(service.get_shop_media("v9", hydrate_missing_image=True))

    assert payload is not None
    assert payload["images"] == [
        "https://maps.googleapis.com/maps/api/place/photo?photo_reference=test"
    ]
    assert payload["coverage"]["has_images"] is True


def test_shop_media_routes_return_media_contract(client, monkeypatch):
    monkeypatch.setattr(
        shops_router.venue_media_service,
        "list_shop_media",
        lambda **_kwargs: {
            "data": [],
            "pagination": {
                "offset": 0,
                "limit": 1000,
                "total": 0,
                "returned": 0,
                "has_more": False,
            },
            "summary": {
                "total_shops": 0,
                "shops_with_images": 0,
                "shops_with_videos": 0,
                "shops_with_media": 0,
            },
        },
    )

    async def _fake_get_shop_media(_shop_id, hydrate_missing_image=True):
        return {
            "shop_id": "abc",
            "name": "ABC",
            "images": ["https://cdn.example.com/abc.jpg"],
            "videos": [],
            "video_url": "",
            "media": [
                {
                    "type": "image",
                    "url": "https://cdn.example.com/abc.jpg",
                    "source": "venues.image_urls",
                    "is_real": True,
                }
            ],
            "counts": {"images": 1, "videos": 0, "total": 1},
            "coverage": {
                "has_images": True,
                "has_videos": False,
                "has_media": True,
                "missing_images": False,
                "missing_videos": True,
            },
            "social_links": {},
        }

    monkeypatch.setattr(
        shops_router.venue_media_service,
        "get_shop_media",
        _fake_get_shop_media,
    )

    index_response = client.get("/api/v1/shops/media")
    detail_response = client.get("/api/v1/shops/abc/media?hydrate_missing_image=false")

    assert index_response.status_code == 200
    assert index_response.json()["summary"]["total_shops"] == 0
    assert detail_response.status_code == 200
    assert detail_response.json()["shop_id"] == "abc"
