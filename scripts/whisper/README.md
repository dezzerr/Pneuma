# Faster-Whisper packaging

The desktop installers bundle a local Faster-Whisper Base model and a standalone worker.
Build on the target OS and architecture using Python 3.11.

```sh
python -m pip install -r scripts/whisper/requirements.txt
node scripts/prepare-whisper.cjs
```

Electron Builder invokes the preparation script automatically. It verifies the model
against pinned hashes and builds the worker with PyInstaller. Set
`PNEUMA_BUILD_PYTHON` to a virtual environment's interpreter when needed.
End users need only the app installer.
