"""LRU + TTL cache for semantic search results.

Normalises query text (lowercase, strip whitespace, remove punctuation)
and stores up to ``max_entries`` results. Entries expire after ``ttl_s``
seconds. On a cache hit the stored results are returned in ~0 ms without
ONNX inference or LanceDB queries.
"""

from __future__ import annotations

import re
import time
from collections import OrderedDict
from typing import Optional


def _normalise(text: str) -> str:
    """Lowercase, strip whitespace, remove punctuation."""
    text = text.lower().strip()
    return re.sub(r"[^\w\s]", "", text)


class SemanticCache:
    """LRU cache with TTL for semantic search results."""

    def __init__(self, max_entries: int = 128, ttl_s: float = 300.0):
        self._store: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
        self.max_entries = max_entries
        self.ttl_s = ttl_s
        self.hits = 0
        self.misses = 0

    def get(self, query: str) -> Optional[list[dict]]:
        key = _normalise(query)
        if not key:
            return None
        entry = self._store.get(key)
        if entry is None:
            self.misses += 1
            return None
        ts, results = entry
        if time.monotonic() - ts > self.ttl_s:
            # Expired — evict
            self._store.pop(key, None)
            self.misses += 1
            return None
        # Move to end (most recently used)
        self._store.move_to_end(key)
        self.hits += 1
        return results

    def put(self, query: str, results: list[dict]) -> None:
        key = _normalise(query)
        if not key:
            return
        self._store[key] = (time.monotonic(), results)
        self._store.move_to_end(key)
        # Evict oldest entries if over capacity
        while len(self._store) > self.max_entries:
            self._store.popitem(last=False)

    def clear(self) -> None:
        self._store.clear()
        self.hits = 0
        self.misses = 0

    def stats(self) -> dict:
        return {"hits": self.hits, "misses": self.misses, "size": len(self._store)}
