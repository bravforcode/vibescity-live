from types import SimpleNamespace

import app.api.routers.ugc as ugc


class FakeQuery:
    def __init__(self, data=None, single=False):
        self._data = data or []
        self._single = single
        self._insert_payload = None

    def insert(self, payload):
        self._insert_payload = payload
        self._data = [payload]
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def single(self):
        self._single = True
        return self

    def upsert(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._single:
            return SimpleNamespace(data=self._data[0] if self._data else None)
        return SimpleNamespace(data=self._data)


class FakeSupabase:
    def __init__(self, table_data=None):
        self.table_data = table_data or {}

    def table(self, name):
        return FakeQuery(self.table_data.get(name, []))

    def rpc(self, *_args, **_kwargs):
        return FakeQuery([])


def test_submit_shop(client, override_auth, monkeypatch):
    fake_db = FakeSupabase({"user_submissions": []})
    monkeypatch.setattr(ugc, "supabase", fake_db)
    monkeypatch.setattr(ugc, "grant_rewards", lambda *_args, **_kwargs: None)

    payload = {
        "name": "Test Shop",
        "category": "Cafe",
        "latitude": 18.78,
        "longitude": 98.98,
        "province": "Chiang Mai",
        "images": [],
        "description": "Nice place",
    }
    res = client.post("/api/v1/ugc/shops", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True


def test_check_in_duplicate(client, override_auth, monkeypatch):
    fake_db = FakeSupabase({"check_ins": [{"id": 1}]})
    monkeypatch.setattr(ugc, "supabase", fake_db)
    monkeypatch.setattr(ugc, "grant_rewards", lambda *_args, **_kwargs: None)

    payload = {"venue_id": 123, "note": "hello"}
    res = client.post("/api/v1/ugc/check-in", json=payload)
    assert res.status_code == 429


def test_upload_photo(client, override_auth, monkeypatch):
    fake_db = FakeSupabase({"venue_photos": []})
    monkeypatch.setattr(ugc, "supabase", fake_db)
    monkeypatch.setattr(ugc, "grant_rewards", lambda *_args, **_kwargs: None)

    payload = {"venue_id": 123, "image_url": "https://example.com/x.jpg", "caption": "ok"}
    res = client.post("/api/v1/ugc/photos", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
