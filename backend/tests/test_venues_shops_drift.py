from types import SimpleNamespace

from app.services.venue_repository import VenueRepository


class _FakeQuery:
    def __init__(self, table_name, dataset):
        self.table_name = table_name
        self.dataset = dataset
        self._single = False
        self._updates = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def single(self):
        self._single = True
        return self

    def update(self, payload):
        self._updates = payload
        return self

    def execute(self):
        if isinstance(self.dataset, Exception):
            raise self.dataset
        if self._single:
            first = self.dataset[0] if self.dataset else None
            return SimpleNamespace(data=first)
        if self._updates is not None:
            return SimpleNamespace(data=[{"updated": True, **self._updates}])
        return SimpleNamespace(data=self.dataset)


class _FakeClient:
    def __init__(self, sources):
        self.sources = sources
        self.calls = []

    def table(self, name):
        self.calls.append(name)
        return _FakeQuery(name, self.sources.get(name, []))


def test_repository_prefers_venues_when_available():
    client = _FakeClient(
        {
            "venues": [{"id": "v1", "owner_id": "owner-a"}],
            "shops": [{"id": "legacy", "owner_id": "owner-b"}],
        }
    )
    repository = VenueRepository(client)

    pending = repository.list_pending()
    owner_id = repository.get_owner("v1")

    assert pending.data[0]["id"] == "v1"
    assert owner_id == "owner-a"
    assert client.calls.count("venues") >= 2


def test_repository_falls_back_to_shops_when_venues_fails():
    client = _FakeClient(
        {
            "venues": RuntimeError("venues unavailable"),
            "shops": [{"id": "legacy-1", "owner_id": "legacy-owner"}],
        }
    )
    repository = VenueRepository(client)

    pending = repository.list_pending()
    owner_id = repository.get_owner("legacy-1")

    assert pending.data[0]["id"] == "legacy-1"
    assert owner_id == "legacy-owner"
    assert client.calls[:2] == ["venues", "shops"]


def test_repository_reject_sets_archived_status():
    client = _FakeClient({"venues": [{"id": "v1"}]})
    repository = VenueRepository(client)

    res = repository.reject("v1", "spam")

    assert res.data[0]["status"] == "archived"
    assert res.data[0]["metadata"]["rejection_reason"] == "spam"
