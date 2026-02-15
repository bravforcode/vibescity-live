from collections import Counter

from app.main import app


def test_ugc_routes_are_unique():
    keys = []
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = sorted((getattr(route, "methods", set()) or set()) - {"HEAD", "OPTIONS"})
        if not path.startswith("/api/v1/ugc"):
            continue
        for method in methods:
            keys.append(f"{method}:{path}")

    counts = Counter(keys)
    duplicates = [key for key, count in counts.items() if count > 1]
    assert duplicates == []

