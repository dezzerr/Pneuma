"""Tests for SemanticEngine scoring helpers and lazy/error paths.

No real ONNX model or LanceDB is loaded — all heavy dependencies are mocked.
"""

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from pneuma_sidecar.semantic_engine import (
    SemanticEngine,
    _jaccard,
    _keyword_boost,
    _phrase_overlap,
    _tokenize,
)

# ---------------------------------------------------------------------------
# Pure helper functions
# ---------------------------------------------------------------------------


class TestTokenize:
    def test_basic(self):
        assert _tokenize("Hello World") == {"hello", "world"}

    def test_punctuation_removed(self):
        assert _tokenize("faith, hope, love!") == {"faith", "hope", "love"}

    def test_empty(self):
        assert _tokenize("") == set()


class TestJaccard:
    def test_identical(self):
        assert _jaccard({"a", "b"}, {"a", "b"}) == 1.0

    def test_disjoint(self):
        assert _jaccard({"a"}, {"b"}) == 0.0

    def test_partial(self):
        assert _jaccard({"a", "b"}, {"a", "c"}) == 1.0 / 3.0

    def test_empty_sets(self):
        assert _jaccard(set(), {"a"}) == 0.0
        assert _jaccard({"a"}, set()) == 0.0


class TestKeywordBoost:
    def test_all_keywords(self):
        boost = _keyword_boost({"faith", "grace", "love"})
        assert boost == 1.0

    def test_no_keywords(self):
        boost = _keyword_boost({"apple", "banana"})
        assert boost == 0.0

    def test_partial(self):
        boost = _keyword_boost({"faith", "apple"})
        assert 0 < boost < 1.0

    def test_empty(self):
        assert _keyword_boost(set()) == 0.0


class TestPhraseOverlap:
    def test_identical_phrases(self):
        score = _phrase_overlap("the lord is my shepherd", "the lord is my shepherd")
        assert score == 1.0

    def test_no_overlap(self):
        score = _phrase_overlap("apple banana", "cherry date")
        assert score == 0.0

    def test_short_text_no_grams(self):
        assert _phrase_overlap("hi", "hello world") == 0.0


# ---------------------------------------------------------------------------
# SemanticEngine — lazy readiness and error paths
# ---------------------------------------------------------------------------


class TestSemanticEngineLazy:
    def test_search_returns_empty_when_not_loaded(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/fake",
            lance_path="/fake",
        )
        import asyncio

        result = asyncio.run(engine.search("faith"))
        assert result == []

    def test_ensure_ready_loads_model(self):
        engine = SemanticEngine(
            model_path="/fake/model",
            embeddings_path="/fake/emb.parquet",
            lance_path="/fake/lance",
        )

        def fake_index():
            engine._indexed = True

        with (
            patch.object(engine, "_load_model") as mock_load,
            patch.object(engine, "_ensure_indexed", side_effect=fake_index) as mock_index,
        ):
            import asyncio

            asyncio.run(engine.ensure_ready())
            mock_load.assert_called_once()
            mock_index.assert_called_once()
            assert engine._loaded is True
            assert engine._indexed is True

    def test_ensure_ready_skips_if_already_loaded(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/fake",
            lance_path="/fake",
        )
        engine._loaded = True
        engine._indexed = True

        with (
            patch.object(engine, "_load_model") as mock_load,
            patch.object(engine, "_ensure_indexed") as mock_index,
        ):
            import asyncio

            asyncio.run(engine.ensure_ready())
            mock_load.assert_not_called()
            mock_index.assert_not_called()


class TestSemanticEngineSearch:
    def test_search_with_mocked_table(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/fake",
            lance_path="/fake",
            threshold=0.5,
            margin=0.5,
        )
        engine._loaded = True
        engine._indexed = True

        # Mock the LanceDB table search chain
        mock_table = MagicMock()
        mock_results = [
            {
                "_distance": 0.3,
                "book_id": 43,
                "book_name": "John",
                "chapter": 3,
                "verse_start": 16,
                "verse_end": 16,
                "verse_text": "For God so loved the world",
            },
            {
                "_distance": 0.9,
                "book_id": 42,
                "book_name": "Luke",
                "chapter": 6,
                "verse_start": 38,
                "verse_end": 38,
                "verse_text": "Give and it will be given to you",
            },
        ]
        mock_table.search.return_value.limit.return_value.to_list.return_value = mock_results
        engine._table = mock_table

        # Mock _embed_sync to return a dummy vector
        with patch.object(engine, "_embed_sync", return_value=np.array([0.1] * 384)):
            import asyncio

            results = asyncio.run(engine.search("God loved the world"))

        # The second result has high distance (low cosine) and should be filtered by threshold
        assert len(results) >= 1
        assert results[0]["book_name"] == "John"
        assert results[0]["match_type"] == "SEMANTIC"

    def test_search_filters_by_threshold(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/fake",
            lance_path="/fake",
            threshold=0.99,  # Very high — should filter everything
            margin=0.5,
        )
        engine._loaded = True
        engine._indexed = True

        mock_table = MagicMock()
        mock_table.search.return_value.limit.return_value.to_list.return_value = [
            {
                "_distance": 0.5,
                "book_id": 43,
                "book_name": "John",
                "chapter": 3,
                "verse_start": 16,
                "verse_end": 16,
                "verse_text": "For God so loved the world",
            },
        ]
        engine._table = mock_table

        with patch.object(engine, "_embed_sync", return_value=np.array([0.1] * 384)):
            import asyncio

            results = asyncio.run(engine.search("test"))
        assert results == []

    def test_search_margin_filter(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/fake",
            lance_path="/fake",
            threshold=0.0,  # Accept all
            margin=0.01,  # Very tight margin
        )
        engine._loaded = True
        engine._indexed = True

        mock_table = MagicMock()
        mock_table.search.return_value.limit.return_value.to_list.return_value = [
            {
                "_distance": 0.1,
                "book_id": 43,
                "book_name": "John",
                "chapter": 3,
                "verse_start": 16,
                "verse_end": 16,
                "verse_text": "For God so loved the world",
            },
            {
                "_distance": 0.5,
                "book_id": 42,
                "book_name": "Luke",
                "chapter": 6,
                "verse_start": 38,
                "verse_end": 38,
                "verse_text": "Give and it will be given",
            },
        ]
        engine._table = mock_table

        with patch.object(engine, "_embed_sync", return_value=np.array([0.1] * 384)):
            import asyncio

            results = asyncio.run(engine.search("God loved the world"))

        # Margin filter should keep only the top hit
        assert len(results) == 1
        assert results[0]["book_name"] == "John"


class TestSemanticEngineErrors:
    def test_load_model_missing_file(self):
        engine = SemanticEngine(
            model_path="/nonexistent/path",
            embeddings_path="/fake",
            lance_path="/fake",
        )
        with pytest.raises(FileNotFoundError, match="ONNX model not found"):
            engine._load_model()

    def test_ensure_indexed_missing_parquet(self):
        engine = SemanticEngine(
            model_path="/fake",
            embeddings_path="/nonexistent/parquet.parquet",
            lance_path="/tmp/test_lance_db",
        )
        # Mock lancedb to avoid real DB creation
        with patch("lancedb.connect") as mock_connect:
            mock_db = MagicMock()
            mock_db.table_names.return_value = []
            mock_connect.return_value = mock_db
            with pytest.raises(FileNotFoundError, match="Embeddings parquet not found"):
                engine._ensure_indexed()
