from types import SimpleNamespace

import app.api.routers.owner as owner


class FakeQuery:
    def __init__(self, owner_id):
        self.owner_id = owner_id

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    def execute(self):
        return SimpleNamespace(data={"owner_id": self.owner_id})


class FakeSupabase:
    def __init__(self, owner_id):
        self.owner_id = owner_id

    def table(self, _name):
        return FakeQuery(self.owner_id)


def test_owner_stats_success(client, override_auth, monkeypatch):
    fake_db = FakeSupabase(owner_id=override_auth.id)
    monkeypatch.setattr(owner, "supabase", fake_db)
    monkeypatch.setattr(owner, "supabase_admin", None)

    response = client.get("/api/v1/owner/stats/123")
    assert response.status_code == 200
    data = response.json()
    assert data["shop_id"] == "123"


def test_owner_stats_forbidden(client, override_auth, monkeypatch):
    fake_db = FakeSupabase(owner_id="someone-else")
    monkeypatch.setattr(owner, "supabase", fake_db)
    monkeypatch.setattr(owner, "supabase_admin", None)

    response = client.get("/api/v1/owner/stats/123")
    assert response.status_code == 403
