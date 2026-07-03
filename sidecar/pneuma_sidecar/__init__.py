"""Pneuma local AI inference sidecar.

Runs a localhost WebSocket server that accepts 16 kHz / 16-bit / mono PCM audio
frames, performs voice-activity segmentation, transcribes speech with
Faster-Whisper, and streams TRANSCRIPT_CHUNK JSON messages back to the Tauri UI.
"""

__version__ = "0.1.0"
