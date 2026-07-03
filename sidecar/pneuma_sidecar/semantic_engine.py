"""Semantic vector search engine for Layer 2 scripture detection.

Uses a pre-computed LanceDB index of all-MiniLM-L6-v2 embeddings (384-dim)
and an ONNX runtime model to embed live transcript text for cosine similarity
search. No PyTorch dependency — pure ONNX + tokenizers at runtime.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from typing import Optional

import numpy as np

# Distinctive biblical terms that boost relevance when present in the query.
_BIBLICAL_KEYWORDS = frozenset({
    "god", "jesus", "christ", "lord", "faith", "grace", "love", "spirit",
    "holy", "sin", "salvation", "heaven", "prayer", "mercy", "peace",
    "covenant", "righteousness", "kingdom", "glory", "worship", "hope",
    "light", "truth", "life", "death", "blood", "cross", "resurrection",
    "shepherd", "soul", "heart", "flesh", "world", "eternal", "everlasting",
})


def _tokenize(text: str) -> set[str]:
    """Lowercase, strip punctuation, split into word tokens."""
    return set(re.sub(r"[^\w\s]", "", text.lower()).split())


def _jaccard(query_tokens: set[str], verse_tokens: set[str]) -> float:
    """Word overlap (Jaccard similarity) between query and verse."""
    if not query_tokens or not verse_tokens:
        return 0.0
    intersection = query_tokens & verse_tokens
    union = query_tokens | verse_tokens
    return len(intersection) / len(union)


def _keyword_boost(query_tokens: set[str]) -> float:
    """Fraction of distinctive biblical keywords present in the query."""
    if not query_tokens:
        return 0.0
    hits = query_tokens & _BIBLICAL_KEYWORDS
    return len(hits) / len(query_tokens)


def _phrase_overlap(query: str, verse: str) -> float:
    """2-gram overlap score between query and verse text."""
    q_words = re.sub(r"[^\w\s]", "", query.lower()).split()
    v_words = re.sub(r"[^\w\s]", "", verse.lower()).split()
    if len(q_words) < 2 or len(v_words) < 2:
        return 0.0
    q_grams = {tuple(q_words[i:i+2]) for i in range(len(q_words) - 1)}
    v_grams = {tuple(v_words[i:i+2]) for i in range(len(v_words) - 1)}
    overlap = q_grams & v_grams
    return len(overlap) / max(len(q_grams), 1)


class SemanticEngine:
    """Lazily-loaded ONNX embedding model + LanceDB vector store."""

    def __init__(
        self,
        model_path: str,
        embeddings_path: str,
        lance_path: str,
        threshold: float = 0.70,
        margin: float = 0.05,
    ):
        self.model_path = model_path
        self.embeddings_path = embeddings_path
        self.lance_path = lance_path
        self.threshold = threshold
        self.margin = margin

        self._session = None  # onnxruntime.InferenceSession
        self._tokenizer = None  # tokenizers.Tokenizer
        self._db = None  # lancedb.DBConnection
        self._table = None  # lancedb.table.Table
        self._lock = asyncio.Lock()
        self._loaded = False
        self._indexed = False

    def _load_model(self) -> None:
        """Load ONNX model + tokenizer (CPU only)."""
        import onnxruntime as ort
        from tokenizers import Tokenizer

        onnx_file = os.path.join(self.model_path, "model.onnx")
        tokenizer_file = os.path.join(self.model_path, "tokenizer.json")

        if not os.path.exists(onnx_file):
            raise FileNotFoundError(f"ONNX model not found: {onnx_file}")
        if not os.path.exists(tokenizer_file):
            raise FileNotFoundError(f"Tokenizer not found: {tokenizer_file}")

        print("[pneuma-sidecar] Loading ONNX embedding model...", file=sys.stderr)
        self._session = ort.InferenceSession(
            onnx_file,
            providers=["CPUExecutionProvider"],
        )
        self._tokenizer = Tokenizer.from_file(tokenizer_file)
        self._tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
        print("[pneuma-sidecar] ONNX embedding model ready.", file=sys.stderr)

    def _ensure_indexed(self) -> None:
        """Bulk-load pre-computed embeddings parquet into LanceDB if table missing."""
        import lancedb
        import pyarrow as pa
        import pyarrow.parquet as pq

        os.makedirs(self.lance_path, exist_ok=True)
        self._db = lancedb.connect(self.lance_path)

        existing = self._db.table_names()
        if "bible_verses" in existing:
            self._table = self._db.open_table("bible_verses")
            self._indexed = True
            return

        if not os.path.exists(self.embeddings_path):
            raise FileNotFoundError(
                f"Embeddings parquet not found: {self.embeddings_path}"
            )

        print("[pneuma-sidecar] Loading verse embeddings into LanceDB...", file=sys.stderr)
        table_arrow = pq.read_table(self.embeddings_path)
        self._table = self._db.create_table("bible_verses", data=table_arrow, mode="overwrite")
        self._indexed = True
        print(
            f"[pneuma-sidecar] LanceDB indexed ({self._table.count_rows()} verses).",
            file=sys.stderr,
        )

    def _embed_sync(self, text: str) -> np.ndarray:
        """Embed text via ONNX: tokenize -> infer -> mean-pool -> L2-normalize."""
        assert self._session is not None and self._tokenizer is not None

        enc = self._tokenizer.encode(text)
        input_ids = np.array([enc.ids], dtype=np.int64)
        attention_mask = np.array([enc.attention_mask], dtype=np.int64)

        inputs = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
        }

        # Try token_type_ids if the model expects it
        try:
            token_type_ids = np.zeros_like(input_ids)
            inputs["token_type_ids"] = token_type_ids
        except Exception:
            pass

        outputs = self._session.run(None, inputs)
        # all-MiniLM-L6-v2: output shape (1, seq_len, 384)
        token_embeddings = outputs[0]
        mask = attention_mask.astype(np.float32)
        # Mean pooling: sum(embeddings * mask) / sum(mask)
        masked = token_embeddings * mask[:, :, None]
        summed = masked.sum(axis=1)
        counts = mask.sum(axis=1, keepdims=True)
        counts = np.clip(counts, 1e-9, None)
        pooled = summed / counts
        # L2 normalize
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        norms = np.clip(norms, 1e-12, None)
        normalized = pooled / norms
        return normalized[0]  # (384,)

    async def _embed(self, text: str) -> np.ndarray:
        async with self._lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._embed_sync, text)

    def _search_sync(self, text: str, top_k: int = 5) -> list[dict]:
        """Embed query, search LanceDB, then re-rank with composite scoring."""
        assert self._table is not None

        query_vec = self._embed_sync(text)
        results = self._table.search(query_vec.tolist()).limit(top_k).to_list()

        query_tokens = _tokenize(text)
        kw_boost = _keyword_boost(query_tokens)

        matches = []
        for r in results:
            dist = r.get("_distance", 1.0)
            # LanceDB returns L2 distance; convert to cosine similarity
            cosine = 1.0 - (dist * dist) / 2.0
            if cosine < self.threshold:
                continue

            verse_text = r.get("verse_text", "")
            verse_tokens = _tokenize(verse_text)
            jac = _jaccard(query_tokens, verse_tokens)
            phrase = _phrase_overlap(text, verse_text)

            # Composite score: 60% cosine + 20% jaccard + 10% keyword + 10% phrase
            composite = (
                0.6 * cosine
                + 0.2 * jac
                + 0.1 * kw_boost
                + 0.1 * phrase
            )

            matches.append({
                "match_type": "SEMANTIC",
                "book_id": int(r["book_id"]),
                "book_name": r["book_name"],
                "chapter": int(r["chapter"]),
                "verse_start": int(r["verse_start"]),
                "verse_end": int(r["verse_end"]),
                "score": float(composite),
            })

        matches.sort(key=lambda m: m["score"], reverse=True)

        # Top-hit margin filter: keep only candidates within `margin` of the
        # best re-ranked score so the operator isn't shown weak matches.
        if matches:
            best = matches[0]["score"]
            matches = [m for m in matches if best - m["score"] <= self.margin]

        return matches

    async def search(self, text: str, top_k: int = 5) -> list[dict]:
        """Search for semantic matches. Returns list of DetectedScripture dicts."""
        if not self._loaded:
            return []
        async with self._lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._search_sync, text, top_k)

    async def ensure_ready(self) -> None:
        """Lazily load model and ensure LanceDB is indexed."""
        if self._loaded and self._indexed:
            return
        loop = asyncio.get_running_loop()
        if not self._loaded:
            await loop.run_in_executor(None, self._load_model)
            self._loaded = True
        if not self._indexed:
            await loop.run_in_executor(None, self._ensure_indexed)
