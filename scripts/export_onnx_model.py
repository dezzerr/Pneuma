#!/usr/bin/env python3
"""Export all-MiniLM-L6-v2 to ONNX format + copy tokenizer for runtime use.

This is a dev-time script. After running this, you can uninstall
sentence-transformers and torch from the runtime venv.
"""

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

    print("Loading sentence-transformers model 'all-MiniLM-L6-v2'...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Export ONNX
    onnx_path = os.path.join(output_dir, "model.onnx")
    print(f"Exporting ONNX to {onnx_path}...")
    model.save(
        os.path.join(output_dir, "_st_export"),
        model_name="all-MiniLM-L6-v2",
    )

    # sentence-transformers saves onnx in the export dir
    exported_onnx = os.path.join(output_dir, "_st_export", "model.onnx")
    if os.path.exists(exported_onnx):
        shutil.copy2(exported_onnx, onnx_path)
        print(f"  Copied model.onnx ({os.path.getsize(onnx_path) / (1024*1024):.1f} MB)")
    else:
        # Try alternative: use transformers to export
        print("  sentence-transformers export not found, trying transformers export...")
        import torch
        from transformers import AutoTokenizer, AutoModel

        tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
        hf_model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")

        # Dummy input for tracing
        dummy = tokenizer("test", return_tensors="pt", padding=True, truncation=True, max_length=512)
        torch.onnx.export(
            hf_model,
            (dummy["input_ids"], dummy["attention_mask"], dummy.get("token_type_ids")),
            onnx_path,
            input_names=["input_ids", "attention_mask", "token_type_ids"],
            output_names=["last_hidden_state"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "seq"},
                "attention_mask": {0: "batch", 1: "seq"},
                "token_type_ids": {0: "batch", 1: "seq"},
                "last_hidden_state": {0: "batch", 1: "seq"},
            },
            opset_version=14,
        )
        print(f"  Exported model.onnx ({os.path.getsize(onnx_path) / (1024*1024):.1f} MB)")

    # Copy tokenizer.json
    tokenizer_src = os.path.join(output_dir, "_st_export", "tokenizer.json")
    if not os.path.exists(tokenizer_src):
        # Try huggingface cache
        from transformers import AutoTokenizer
        tok = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
        tok.save_pretrained(output_dir)
        tokenizer_src = os.path.join(output_dir, "tokenizer.json")

    if os.path.exists(tokenizer_src):
        tokenizer_dst = os.path.join(output_dir, "tokenizer.json")
        if tokenizer_src != tokenizer_dst:
            shutil.copy2(tokenizer_src, tokenizer_dst)
        print(f"  Copied tokenizer.json")

    # Clean up intermediate export dir
    export_dir = os.path.join(output_dir, "_st_export")
    if os.path.exists(export_dir):
        shutil.rmtree(export_dir)

    # Verify files exist
    if not os.path.exists(onnx_path):
        print("ERROR: model.onnx not found!", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(os.path.join(output_dir, "tokenizer.json")):
        print("ERROR: tokenizer.json not found!", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone! ONNX model + tokenizer exported to {output_dir}")
    print(f"  model.onnx: {os.path.getsize(onnx_path) / (1024*1024):.1f} MB")
    print(f"  tokenizer.json: {os.path.getsize(os.path.join(output_dir, 'tokenizer.json')) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
