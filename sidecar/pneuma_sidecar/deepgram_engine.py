"""Deepgram Nova-3 cloud streaming transcription engine.

Streams raw 16 kHz Int16 PCM to Deepgram's real-time WebSocket API
and parses Results into (text, confidence, is_final) callbacks.

Guardrails:
  - 10-minute idle timeout: pauses the Deepgram socket after sustained
    silence to protect API margins; auto-resumes on next speech.
  - 45-second connection-drop warning: emits a STATUS warning if PCM
    is flowing but no transcript tokens arrive within 45 s.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Awaitable, Callable, Optional

import numpy as np

try:
    import websockets
except ImportError as exc:  # pragma: no cover
    print(f"[pneuma-sidecar] Missing dependency: {exc}", file=sys.stderr)
    raise

DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen"

IDLE_TIMEOUT_S = 600  # 10 minutes
DROP_WARN_S = 45      # 45 seconds
SPEECH_RMS_THRESHOLD = 0.015
GUARD_INTERVAL_S = 5

# Keywords to bias Deepgram toward Bible book names and scripture vocabulary.
_BIBLE_KEYWORDS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "Samuel", "Kings", "Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah",
    "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
    "Acts", "Romans", "Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "Thessalonians", "Timothy",
    "Titus", "Philemon", "Hebrews", "James", "Peter", "Jude",
    "Revelation", "chapter", "verse", "verses",
]


def _build_url(model: str) -> str:
    url = (
        f"{DEEPGRAM_URL}"
        f"?model={model}"
        f"&smart_format=true"
        f"&encoding=linear16"
        f"&sample_rate=16000"
        f"&channels=1"
        f"&endpointing=300"
    )
    # Add each keyword as a separate keyword param (Deepgram API spec).
    for kw in _BIBLE_KEYWORDS:
        url += f"&keyword={kw}"
    return url

TranscriptCallback = Callable[[str, float, bool], Awaitable[None]]
StatusCallback = Callable[[str, Optional[str]], None]


class DeepgramEngine:
    """Async streaming client for Deepgram Nova-3."""

    def __init__(self, api_key: str, model: str = "nova-3"):
        self.api_key = api_key
        self.model = model
        self._ws = None
        self._on_transcript: Optional[TranscriptCallback] = None
        self._on_status: Optional[StatusCallback] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._guard_task: Optional[asyncio.Task] = None
        self._connected = False

        self._last_speech_ts: float = time.monotonic()
        self._last_token_ts: float = time.monotonic()
        self._has_speech: bool = False
        self._idle_paused: bool = False
        self._drop_warned: bool = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def is_idle_paused(self) -> bool:
        return self._idle_paused

    async def connect(
        self,
        on_transcript: TranscriptCallback,
        on_status: StatusCallback = None,
    ) -> None:
        self._on_transcript = on_transcript
        self._on_status = on_status

        headers = {"Authorization": f"Token {self.api_key}"}
        url = _build_url(self.model)

        try:
            self._ws = await websockets.connect(
                url, additional_headers=headers, max_size=None
            )
        except Exception as exc:
            self._on_status("error", f"Deepgram connect failed: {exc}")
            raise

        self._connected = True
        self._idle_paused = False
        self._drop_warned = False
        self._has_speech = False
        self._last_speech_ts = time.monotonic()
        self._last_token_ts = time.monotonic()

        self._listen_task = asyncio.create_task(self._listen_loop())
        self._guard_task = asyncio.create_task(self._guard_loop())

        self._on_status("deepgram_ready", None)

    async def feed_pcm(self, pcm: bytes) -> None:
        # Always analyze PCM for speech, even when idle_paused
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size > 0:
            rms = float(np.sqrt(np.mean(samples**2)))
            if rms >= SPEECH_RMS_THRESHOLD:
                self._last_speech_ts = time.monotonic()
                self._has_speech = True

        # If idle_paused, check for speech to trigger auto-resume
        if self._idle_paused:
            if self._has_speech and (time.monotonic() - self._last_speech_ts) < 1.0:
                print("[pneuma-sidecar] Speech detected after idle, resuming Deepgram...", file=sys.stderr)
                await self._resume()
            return

        if not self._connected or self._ws is None:
            return

        try:
            await self._ws.send(pcm)
        except Exception:
            pass

    async def close_stream(self) -> None:
        if self._ws is not None:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

    async def disconnect(self) -> None:
        self._connected = False
        if self._guard_task:
            self._guard_task.cancel()
            self._guard_task = None
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    async def _listen_loop(self) -> None:
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                mtype = msg.get("type")

                if mtype == "Results":
                    self._last_token_ts = time.monotonic()
                    self._drop_warned = False

                    is_final = msg.get("is_final", False)
                    channel = msg.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue

                    alt = alternatives[0]
                    text = alt.get("transcript", "").strip()
                    confidence = float(alt.get("confidence", 0.0))

                    if text and self._on_transcript:
                        await self._on_transcript(text, confidence, is_final)

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if self._connected:
                self._on_status("error", f"Deepgram listen error: {exc}")

    async def _guard_loop(self) -> None:
        try:
            while self._connected:
                await asyncio.sleep(GUARD_INTERVAL_S)
                now = time.monotonic()

                silence_duration = now - self._last_speech_ts
                if silence_duration >= IDLE_TIMEOUT_S and not self._idle_paused:
                    await self._pause_idle()

                if self._has_speech and not self._drop_warned:
                    token_gap = now - self._last_token_ts
                    if token_gap >= DROP_WARN_S:
                        self._drop_warned = True
                        self._on_status("connection_drop", None)

        except asyncio.CancelledError:
            pass

    async def _pause_idle(self) -> None:
        self._idle_paused = True
        self._on_status("idle_paused", None)
        await self.close_stream()
        print("[pneuma-sidecar] Deepgram paused after 10 min idle.", file=sys.stderr)

    async def _resume(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

        headers = {"Authorization": f"Token {self.api_key}"}
        url = _build_url(self.model)

        try:
            self._ws = await websockets.connect(
                url, additional_headers=headers, max_size=None
            )
            self._idle_paused = False
            self._last_token_ts = time.monotonic()
            self._drop_warned = False
            self._listen_task = asyncio.create_task(self._listen_loop())
            if not self._guard_task or self._guard_task.done():
                self._guard_task = asyncio.create_task(self._guard_loop())
            self._on_status("deepgram_ready", None)
            print("[pneuma-sidecar] Resumed Deepgram after speech.", file=sys.stderr)
        except Exception as exc:
            self._on_status("error", f"Deepgram resume failed: {exc}")
