"""TRIAD lazy initialization — DB/vector clients created on first use only."""

import threading
from collections.abc import Callable
from typing import Any


class LazyClient:
    """Thread-safe lazy singleton wrapper."""

    def __init__(self, factory: Callable[[], Any]):
        self._factory = factory
        self._instance: Any | None = None
        self._lock = threading.Lock()

    @property
    def instance(self) -> Any:
        if self._instance is None:
            with self._lock:
                if self._instance is None:
                    self._instance = self._factory()
        return self._instance

    def reset(self) -> None:
        with self._lock:
            self._instance = None
