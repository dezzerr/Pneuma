#!/usr/bin/env python3
"""Quick test for the semantic engine: load ONNX model, build LanceDB index,
and verify known paraphrases match the correct verses."""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sidecar"))

from pneuma_sidecar.semantic_engine import SemanticEngine


async def main():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    model_path = os.path.join(base, "resources", "models", "all-MiniLM-L6-v2")
    embeddings_path = os.path.join(base, "resources", "bible_embeddings.parquet")
    lance_path = os.path.join(base, "resources", ".lancedb_test")

    engine = SemanticEngine(
        model_path=model_path,
        embeddings_path=embeddings_path,
        lance_path=lance_path,
        threshold=0.70,
    )

    print("Loading model + building LanceDB index...")
    await engine.ensure_ready()
    print("Ready!\n")

    tests = [
        # Near-exact paraphrases (should match at any reasonable threshold)
        ("all things work together for good to them that love God", "Romans", 8, 28),
        ("for God so loved the world that he gave his only begotten son", "John", 3, 16),
        # Looser paraphrases (should match at 0.70 threshold)
        ("love your enemies and pray for those who persecute you", "Matthew", 5, 44),
        ("the Lord is my shepherd I shall not want", "Psalms", 23, 1),
        ("faith is the substance of things hoped for the evidence of things not seen", "Hebrews", 11, 1),
        # Non-scripture (should not match)
        ("the quick brown fox jumps over the lazy dog", None, None, None),
    ]

    all_pass = True
    for text, expected_book, expected_ch, expected_vs in tests:
        results = await engine.search(text, top_k=3)
        if expected_book is None:
            if not results:
                print(f"PASS: '{text[:50]}...' → no match (expected)")
            else:
                print(f"FAIL: '{text[:50]}...' → got {len(results)} matches (expected none)")
                all_pass = False
        else:
            matched = False
            for r in results:
                if (r["book_name"] == expected_book and
                    r["chapter"] == expected_ch and
                    r["verse_start"] == expected_vs):
                    matched = True
                    break
            if matched:
                print(f"PASS: '{text[:50]}...' → {expected_book} {expected_ch}:{expected_vs}")
            else:
                top = results[0] if results else "none"
                print(f"FAIL: '{text[:50]}...' → got {top} (expected {expected_book} {expected_ch}:{expected_vs})")
                all_pass = False

    # Cleanup test lance dir
    import shutil
    if os.path.exists(lance_path):
        shutil.rmtree(lance_path)

    print(f"\n{'ALL TESTS PASSED' if all_pass else 'SOME TESTS FAILED'}")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
