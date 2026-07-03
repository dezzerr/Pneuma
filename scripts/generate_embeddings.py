#!/usr/bin/env python3
"""Dev/build-time script to pre-compute verse embeddings into a parquet file.

This script reads all verses from the Pneuma SQLite database, embeds them
using sentence-transformers (dev-only convenience), and writes the results
to resources/bible_embeddings.parquet for shipping as a bundled resource.

Usage:
    python scripts/generate_embeddings.py --db-path path/to/pneuma.db --output resources/bible_embeddings.parquet

The output parquet has columns:
    id, book_id, book_name, chapter, verse_start, verse_end, verse_text, vector (384-dim float32)
"""

import argparse
import os
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import sqlite3


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate verse embeddings parquet")
    parser.add_argument("--db-path", required=True, help="Path to pneuma.db")
    parser.add_argument("--output", default="../resources/bible_embeddings.parquet", help="Output parquet path")
    parser.add_argument("--model", default="all-MiniLM-L6-v2", help="Model name")
    parser.add_argument("--batch-size", type=int, default=256, help="Batch size for embedding")
    args = parser.parse_args()

    # Connect to SQLite
    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, book_index, book_name, chapter_number, verse_number, verse_text "
        "FROM local_bible_repository WHERE translation_code = 'KJV' "
        "ORDER BY id"
    ).fetchall()
    conn.close()

    if not rows:
        print("No verses found in database. Is the KJV seed loaded?", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(rows)} verses from {args.db_path}")

    # Load sentence-transformers (dev-only, not shipped)
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print(
            "sentence-transformers not installed. Install with: pip install sentence-transformers",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Loading model '{args.model}'...")
    model = SentenceTransformer(args.model)

    # Embed in batches
    texts = [r["verse_text"] for r in rows]
    print(f"Embedding {len(texts)} verses in batches of {args.batch_size}...")

    all_vectors = []
    for i in range(0, len(texts), args.batch_size):
        batch = texts[i : i + args.batch_size]
        vecs = model.encode(batch, normalize_embeddings=True, show_progress_bar=True)
        all_vectors.append(vecs)
        print(f"  Batch {i // args.batch_size + 1}/{(len(texts) + args.batch_size - 1) // args.batch_size} done")

    vectors = np.vstack(all_vectors).astype(np.float32)
    print(f"Embeddings shape: {vectors.shape}")

    # Build parquet table
    table = pa.table({
        "id": pa.array([r["id"] for r in rows], type=pa.int64()),
        "book_id": pa.array([r["book_index"] for r in rows], type=pa.int64()),
        "book_name": pa.array([r["book_name"] for r in rows], type=pa.string()),
        "chapter": pa.array([r["chapter_number"] for r in rows], type=pa.int64()),
        "verse_start": pa.array([r["verse_number"] for r in rows], type=pa.int64()),
        "verse_end": pa.array([r["verse_number"] for r in rows], type=pa.int64()),
        "verse_text": pa.array([r["verse_text"] for r in rows], type=pa.string()),
        "vector": pa.FixedSizeListArray.from_arrays(
            vectors.flatten(), 384
        ).cast(pa.list_(pa.float32(), 384)),
    })

    # Ensure output directory exists
    output_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    pq.write_table(table, output_path)
    print(f"Wrote {len(rows)} verse embeddings to {output_path}")
    print(f"File size: {os.path.getsize(output_path) / (1024*1024):.1f} MB")


if __name__ == "__main__":
    main()
