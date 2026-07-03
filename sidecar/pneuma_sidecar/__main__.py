"""Entry point for the Pneuma sidecar.

Usage:
    python -m pneuma_sidecar [--host 127.0.0.1] [--port 8765] [--model base]
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from pneuma_sidecar.server import serve


def main() -> None:
    parser = argparse.ArgumentParser(prog="pneuma-sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--model",
        default="base",
        help="Faster-Whisper model size: tiny | base | small",
    )
    parser.add_argument(
        "--embeddings-path",
        default="",
        help="Path to bible_embeddings.parquet for semantic search",
    )
    parser.add_argument(
        "--lance-path",
        default="",
        help="Path to LanceDB directory for vector store",
    )
    parser.add_argument(
        "--onnx-model-path",
        default="",
        help="Path to ONNX embedding model directory",
    )
    parser.add_argument(
        "--engine",
        default="local",
        choices=["local", "cloud"],
        help="Transcription engine: local (Faster-Whisper) or cloud (Deepgram)",
    )
    parser.add_argument(
        "--deepgram-key",
        default="",
        help="Deepgram API key (required for cloud engine mode)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(serve(
            args.host, args.port, args.model,
            args.embeddings_path, args.lance_path, args.onnx_model_path,
            args.engine, args.deepgram_key,
        ))
    except KeyboardInterrupt:
        print("[pneuma-sidecar] Shutting down.", file=sys.stderr)


if __name__ == "__main__":
    main()
