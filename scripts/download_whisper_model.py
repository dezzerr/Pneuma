"""Download a release-ready Faster-Whisper model into Tauri resources."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from huggingface_hub import snapshot_download

REQUIRED_FILES = ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=("tiny", "base", "small"), default="base")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    repo_id = f"Systran/faster-whisper-{args.model}"
    output = (
        args.output or Path("resources") / "models" / f"faster-whisper-{args.model}"
    )
    snapshot = Path(
        snapshot_download(repo_id=repo_id, allow_patterns=list(REQUIRED_FILES))
    )
    output.mkdir(parents=True, exist_ok=True)

    for filename in REQUIRED_FILES:
        source = snapshot / filename
        if not source.exists():
            raise FileNotFoundError(f"{repo_id} did not provide {filename}")
        shutil.copy2(source, output / filename)

    print(f"Downloaded {repo_id} to {output.resolve()}")


if __name__ == "__main__":
    main()
