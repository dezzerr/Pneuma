# Pneuma Sidecar (AI Inference)

Local WebSocket server that turns streamed microphone PCM into live transcripts
using [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper). Part of
Milestone 2 (AI Pipeline & Sidecar Integration).

## Requirements

- **CPython 3.11** (recommended — `ctranslate2`/`faster-whisper` wheels). 3.12
  also works; 3.13/3.14 may lack wheels.

## Setup (dev)

```bash
# from the repo root
python3.11 -m venv sidecar/.venv
sidecar/.venv/bin/pip install --upgrade pip
sidecar/.venv/bin/pip install -r sidecar/requirements.txt
```

## Run (dev)

```bash
sidecar/.venv/bin/python -m pneuma_sidecar --port 8765 --model base
```

Run from inside `sidecar/` (so the `pneuma_sidecar` package is importable), or:

```bash
PYTHONPATH=sidecar sidecar/.venv/bin/python -m pneuma_sidecar
```

Development runs download the Whisper model weights on first use (cached under
`~/.cache/huggingface`). Release builds download the selected model during CI
and bundle it under `resources/models`, so an installed app is offline from its
first launch.

## Protocol

- **Client → Server**
  - Binary frames: little-endian Int16 mono PCM @ 16 kHz.
  - Text frames (JSON): `{"type": "config"|"reset", ...}`.
- **Server → Client** (JSON text):
  - `{"event_type": "STATUS", "payload": {"state": "ready", ...}}`
  - `{"event_type": "TRANSCRIPT_CHUNK", "payload": { raw_text, is_final, confidence_score, detected_scriptures }}`

Scripture detection (`detected_scriptures`) is handled by the UI/regex layer and
is emitted empty by the sidecar.

## Model tiers (PRD FR-2)

| Tier  | Flag            | Footprint    |
| ----- | --------------- | ------------ |
| tiny  | `--model tiny`  | < 400 MB RAM |
| base  | `--model base`  | ~800 MB RAM  |
| small | `--model small` | ~1.5 GB RAM  |

## Packaging (PyInstaller)

The sidecar is bundled as a one-folder PyInstaller artifact so the Tauri app
can ship it without requiring a system Python install.

### Prerequisites

- Python 3.11 venv at `sidecar/.venv` with runtime deps installed
- PyInstaller installed in the venv:
  ```bash
  sidecar/.venv/bin/pip install -r sidecar/requirements-packaging.txt
  ```

### Build (macOS)

```bash
cd sidecar
.venv/bin/pyinstaller pneuma_sidecar.spec --noconfirm
```

Output: `sidecar/dist/pneuma-sidecar/pneuma-sidecar` (executable + dependencies)

### Build (Windows)

```cmd
cd sidecar
.venv\Scripts\pyinstaller pneuma_sidecar.spec --noconfirm
```

Output: `sidecar\dist\pneuma-sidecar\pneuma-sidecar.exe`

### How it works

- **Dev builds** (`tauri dev`): Tauri spawns `sidecar/.venv/bin/python -m pneuma_sidecar` directly. No packaging needed.
- **Release builds** (`tauri build`): Tauri bundles `sidecar/dist/pneuma-sidecar/` as a resource. The Rust sidecar launcher resolves it from `resource_dir()` and spawns the bundled executable.

### Tauri release build

Download the release model, build the PyInstaller artifact, then build Tauri:

```bash
sidecar/.venv/bin/python scripts/download_whisper_model.py --model base
cd sidecar && .venv/bin/pyinstaller pneuma_sidecar.spec --noconfirm && cd ..
npm run tauri build
```

Tauri will bundle the `sidecar/dist/pneuma-sidecar/` directory alongside the
embeddings parquet and ONNX model. The packaged app launches the bundled
sidecar automatically on startup.

### Notes

- Build on the target platform — macOS builds produce macOS binaries, Windows builds produce Windows binaries.
- The spec excludes `torch`, `tensorflow`, `scipy`, `pandas` etc. to keep the bundle lean.
- CI release builds bundle the base model. A locally built release falls back to the Hugging Face cache/network if the resource model was not downloaded first.
