"""TRIAD explicit data routing — decides which DB handles each domain."""

from enum import Enum


class DataStore(Enum):
    CORE = "supabase"      # Users, auth, orgs, policies
    HISTORY = "neon"       # Chat history, audit logs, analytics
    MEMORY = "qdrant"      # Vector storage, semantic search


_ROUTING_TABLE: dict[str, DataStore] = {
    "users": DataStore.CORE,
    "auth": DataStore.CORE,
    "orgs": DataStore.CORE,
    "policies": DataStore.CORE,
    "chat_history": DataStore.HISTORY,
    "audit_logs": DataStore.HISTORY,
    "analytics": DataStore.HISTORY,
    "vectors": DataStore.MEMORY,
    "semantic_search": DataStore.MEMORY,
}


def route(domain: str) -> DataStore:
    """Return the designated store for a data domain. Defaults to CORE."""
    return _ROUTING_TABLE.get(domain, DataStore.CORE)
