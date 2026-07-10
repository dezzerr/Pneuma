"""Tests for SemanticCache — LRU + TTL cache for semantic search results."""

from unittest.mock import patch

from pneuma_sidecar.semantic_cache import SemanticCache, _normalise


class TestNormalise:
    def test_lowercase(self):
        assert _normalise("HELLO") == "hello"

    def test_strip_whitespace(self):
        assert _normalise("  hello  ") == "hello"

    def test_remove_punctuation(self):
        assert _normalise("hello, world!") == "hello world"

    def test_empty(self):
        assert _normalise("") == ""


class TestCacheHitMiss:
    def test_miss_on_empty_cache(self):
        cache = SemanticCache()
        assert cache.get("faith") is None
        assert cache.misses == 1
        assert cache.hits == 0

    def test_hit_after_put(self):
        cache = SemanticCache()
        cache.put("faith", [{"book_id": 1}])
        result = cache.get("faith")
        assert result is not None
        assert result[0]["book_id"] == 1
        assert cache.hits == 1
        assert cache.misses == 0

    def test_miss_after_different_query(self):
        cache = SemanticCache()
        cache.put("faith", [{"book_id": 1}])
        assert cache.get("grace") is None
        assert cache.misses == 1

    def test_normalisation_key_match(self):
        cache = SemanticCache()
        cache.put("Faith!", [{"book_id": 1}])
        # Different casing/punctuation should still hit
        assert cache.get("faith") is not None
        assert cache.hits == 1

    def test_empty_key_returns_none(self):
        cache = SemanticCache()
        assert cache.get("") is None
        assert cache.get("   ") is None


class TestTTLExpiry:
    def test_expired_entry_returns_none(self):
        cache = SemanticCache(ttl_s=1.0)
        cache.put("faith", [{"book_id": 1}])

        # Simulate time passing beyond TTL
        with patch("pneuma_sidecar.semantic_cache.time.monotonic") as mock_time:
            mock_time.return_value = 0.0
            cache.put("faith", [{"book_id": 1}])

            mock_time.return_value = 2.0  # Beyond TTL
            result = cache.get("faith")

        assert result is None
        assert cache.misses == 1

    def test_non_expired_entry_returns_result(self):
        cache = SemanticCache(ttl_s=10.0)

        with patch("pneuma_sidecar.semantic_cache.time.monotonic") as mock_time:
            mock_time.return_value = 0.0
            cache.put("faith", [{"book_id": 1}])

            mock_time.return_value = 5.0  # Within TTL
            result = cache.get("faith")

        assert result is not None
        assert cache.hits == 1


class TestLRUEviction:
    def test_evict_oldest_when_over_capacity(self):
        cache = SemanticCache(max_entries=3)
        cache.put("a", [1])
        cache.put("b", [2])
        cache.put("c", [3])
        cache.put("d", [4])  # Should evict "a"

        assert cache.get("a") is None
        assert cache.get("b") is not None
        assert cache.get("d") is not None

    def test_lru_order_updated_on_get(self):
        cache = SemanticCache(max_entries=3)
        cache.put("a", [1])
        cache.put("b", [2])
        cache.put("c", [3])

        # Access "a" to make it most recently used
        cache.get("a")

        # Now add "d" — should evict "b" (least recently used)
        cache.put("d", [4])

        assert cache.get("a") is not None
        assert cache.get("b") is None


class TestOverwriteAndClear:
    def test_overwrite_existing_key(self):
        cache = SemanticCache()
        cache.put("faith", [{"book_id": 1}])
        cache.put("faith", [{"book_id": 2}])
        result = cache.get("faith")
        assert result[0]["book_id"] == 2

    def test_clear(self):
        cache = SemanticCache()
        cache.put("a", [1])
        cache.put("b", [2])
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None
        assert cache.hits == 0
        assert cache.misses == 2
        stats = cache.stats()
        assert stats["size"] == 0


class TestStats:
    def test_stats_reflect_state(self):
        cache = SemanticCache()
        cache.put("a", [1])
        cache.get("a")
        cache.get("b")
        stats = cache.stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["size"] == 1
