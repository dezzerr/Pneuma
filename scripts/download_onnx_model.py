#!/usr/bin/env python3
"""Download pre-quantized all-MiniLM-L6-v2 ONNX model + tokenizer from HuggingFace."""

import os
import shutil
import sys

def main() -> None:
    output_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "resources",
        "models",
        "all-MiniLM-L6-v2",
    )
    os.makedirs(output_dir, exist_ok=True)

    from huggingface_hub import hf_hub_download

    repo_id = "sentence-transformers/all-MiniLM-L6-v2"
    files = [
        ("onnx/model_quantized.onnx", "model.onnx"),
        ("tokenizer.json", "tokenizer.json"),
        ("tokenizer_config.json", "tokenizer_config.json"),
        ("special_tokens_map.json", "special_tokens_map.json"),
        ("vocab.txt", "vocab.txt"),
        ("config.json", "config.json"),
    ]

    for remote_name, local_name in files:
        print(f"Downloading {remote_name}...")
        try:
            cached = hf_hub_download(repo_id=repo_id, filename=remote_name)
            dst = os.path.join(output_dir, local_name)
            shutil.copy2(cached, dst)
            size = os.path.getsize(dst)
            if size > 1024 * 1024:
                print(f"  Saved {local_name} ({size / (1024*1024):.1f} MB)")
            else:
                print(f"  Saved {local_name} ({size / 1024:.1f} KB)")
        except Exception as e:
            print(f"  WARNING: Could not download {remote_name}: {e}")

    onnx_path = os.path.join(output_dir, "model.onnx")
    tokenizer_path = os.path.join(output_dir, "tokenizer.json")

    if not os.path.exists(onnx_path):
        # Fallback: try non-quantized
        print("Quantized model not found, trying non-quantized...")
        cached = hf_hub_download(repo_id=repo_id, filename="onnx/model.onnx")
        shutil.copy2(cached, onnx_path)

    if not os.path.exists(onnx_path):
        print("ERROR: model.onnx not found!", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(tokenizer_path):
        print("ERROR: tokenizer.json not found!", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone! Files in {output_dir}:")
    for f in os.listdir(output_dir):
        p = os.path.join(output_dir, f)
        if os.path.isfile(p):
            print(f"  {f}: {os.path.getsize(p) / (1024*1024):.1f} MB")


if __name__ == "__main__":
    main()
