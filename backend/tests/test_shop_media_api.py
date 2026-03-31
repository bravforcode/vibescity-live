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
    assert payload["summary"]["total_shops_scanned"] == 3
    assert payload["summary"]["shops_with_media"] == 2
    assert payload["summary"]["shops_with_complete_media"] == 1
    assert payload["summary"]["shops_missing_complete_media"] == 2

    by_id = {item["shop_id"]: item for item in payload["data"]}
    assert by_id["v1"]["images"] == ["https://cdn.example.com/kai-1.jpg"]
    assert by_id["v1"]["videos"] == ["https://cdn.example.com/kai.mp4"]
    assert by_id["v1"]["coverage"]["has_complete_media"] is True
    assert by_id["v2"]["images"] == ["https://ugc.example.com/momo-1.jpg"]
    assert by_id["v2"]["coverage"]["has_images"] is True
    assert by_id["v2"]["coverage"]["has_videos"] is False
    assert by_id["v2"]["coverage"]["has_complete_media"] is False
    assert by_id["v3"]["coverage"]["has_media"] is False
    assert by_id["v3"]["coverage"]["missing_complete_media"] is True


def test_get_shop_media_stays_real_only_when_media_is_missing():
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

    payload = asyncio.run(service.get_shop_media("v9", hydrate_missing_image=True))

    assert payload is not None
    assert payload["images"] == []
    assert payload["coverage"]["has_images"] is False
    assert payload["coverage"]["has_media"] is False
    assert payload["coverage"]["has_complete_media"] is False


def test_require_complete_filters_incomplete_rows_from_index_and_detail():
    service = VenueMediaService(
        client=_FakeClient(
            {
                "venues": [
                    {
                        "id": "v1",
                        "name": "Complete Shop",
                        "slug": "complete-shop",
                        "image_urls": ["https://cdn.example.com/complete.jpg"],
                        "video_url": "https://cdn.example.com/complete.mp4",
                        "social_links": {},
                    },
                    {
                        "id": "v2",
                        "name": "Image Only Shop",
                        "slug": "image-only-shop",
                        "image_urls": ["https://cdn.example.com/image-only.jpg"],
                        "video_url": "",
                        "social_links": {},
                    },
                ],
                "venue_photos": [],
            }
        )
    )

    payload = service.list_shop_media(
        limit=10,
        offset=0,
        include_missing=False,
        require_complete=True,
    )

    assert payload["summary"]["total_shops"] == 1
    assert payload["summary"]["total_shops_scanned"] == 2
    assert payload["summary"]["shops_with_complete_media"] == 1
    assert [item["shop_id"] for item in payload["data"]] == ["v1"]
    assert asyncio.run(service.get_shop_media("v2", require_complete=True)) is None


def test_social_profiles_do_not_count_as_videos_without_post_urls():
    service = VenueMediaService(
        client=_FakeClient(
            {
                "venues": [
                    {
                        "id": "v10",
                        "name": "Profile Only",
                        "slug": "profile-only",
                        "image_urls": [],
                        "video_url": "",
                        "latitude": 18.81,
                        "longitude": 98.97,
                        "social_links": {
                            "facebook": "https://www.facebook.com/coolcampingresort",
                            "instagram": "https://www.instagram.com/coolcampingresort/",
                            "tiktok": "https://www.tiktok.com/@coolcampingresort",
                            "youtube": "https://www.youtube.com/watch?v=abc123xyz00",
                        },
                    }
                ],
                "venue_photos": [],
            }
        )
    )

    payload = service.list_shop_media(limit=10, offset=0, include_missing=True)
    item = payload["data"][0]

    assert item["videos"] == ["https://www.youtube.com/watch?v=abc123xyz00"]
    assert item["counts"]["videos"] == 1
    assert item["coverage"]["has_videos"] is True


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
                "total_shops_scanned": 0,
                "shops_with_images": 0,
                "shops_with_videos": 0,
                "shops_with_media": 0,
                "shops_with_complete_media": 0,
                "shops_missing_complete_media": 0,
            },
        },
    )

    async def _fake_get_shop_media(
        _shop_id,
        hydrate_missing_image=False,
        require_complete=False,
    ):
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
                "has_complete_media": False,
                "missing_images": False,
                "missing_videos": True,
                "missing_complete_media": True,
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
