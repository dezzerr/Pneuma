# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Pneuma AI sidecar.

Produces a one-folder bundle named ``pneuma-sidecar`` that can be launched
directly by the Tauri app in release builds (no system Python required).

Build (macOS):
    cd sidecar
    .venv/bin/pip install pyinstaller
    .venv/bin/pyinstaller pneuma_sidecar.spec --noconfirm

Build (Windows):
    cd sidecar
    .venv\Scripts\pip install pyinstaller
    .venv\Scripts\pyinstaller pneuma_sidecar.spec --noconfirm

Output: dist/pneuma-sidecar/ (macOS) or dist\pneuma-sidecar\ (Windows)
"""

import sys
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# --- Hidden imports for native-heavy dependencies ---------------------------

hiddenimports = []

# faster-whisper / ctranslate2
hiddenimports += collect_submodules("faster_whisper")
hiddenimports += collect_submodules("ctranslate2")
hiddenimports += [
    "ctranslate2",
    "ctranslate2.converters",
    "ctranslate2.extensions",
]

# onnxruntime
hiddenimports += collect_submodules("onnxruntime")

# tokenizers
hiddenimports += ["tokenizers", "tokenizers.models", "tokenizers.trainers"]

# lancedb
hiddenimports += collect_submodules("lancedb")

# pyarrow
hiddenimports += collect_submodules("pyarrow")

# numpy
hiddenimports += ["numpy.core._multiarray_umath"]

# websockets
hiddenimports += collect_submodules("websockets")

# --- Data files -------------------------------------------------------------

datas = []
datas += collect_data_files("faster_whisper")
datas += collect_data_files("tokenizers")
datas += collect_data_files("lancedb", include_py_files=False)

# --- Binaries (native .so/.dylib/.dll) --------------------------------------

binaries = []
binaries += collect_data_files("ctranslate2", include_py_files=False)
binaries += collect_data_files("onnxruntime", include_py_files=False)


# --- Entry point ------------------------------------------------------------

entry_script = "pneuma_sidecar/__main__.py"


a = Analysis(
    [entry_script],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        "torch",
        "torchvision",
        "torchaudio",
        "tensorflow",
        "matplotlib",
        "scipy",
        "pandas",
        "sklearn",
        "IPython",
        "jupyter",
        "notebook",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="pneuma-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="pneuma-sidecar",
)
