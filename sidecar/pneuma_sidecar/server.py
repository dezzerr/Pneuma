"""WebSocket inference server for the Pneuma sidecar.

Protocol (localhost only):

  Client -> Server
    * Binary frames: little-endian Int16 mono PCM @ 16 kHz (raw audio).
    * Text frames (JSON control), e.g.:
        {"type": "config", "model": "base"}
        {"type": "reset"}

  Server -> Client (text/JSON)
    * Status:
        {"event_type": "STATUS",
         "payload": {"state": "loading_model"|"ready"|"error",
                     "message": "..."}}
    * Transcript (matches the PRD WebSocket contract):
        {"event_type": "TRANSCRIPT_CHUNK",
         "payload": {"raw_text": "...",
                     "is_final": true,
                     "confidence_score": 0.97,
                     "detected_scriptures": []}}

In **local mode** a lightweight energy gate detects utterance boundaries;
Faster-Whisper's built-in Silero `vad_filter` then trims each segment before
transcription. In **cloud mode** raw PCM is streamed directly to Deepgram
Nova-3, which handles endpointing and transcription server-side. Scripture
detection runs on final transcripts via a regex parser with a 750ms
inference-delay hold so that follow-up corrections can replace a pending
detection before it is emitted. Cloud guardrails: 10-min idle pause and
45s connection-drop warning.
"""

from __future__ import annotations

import asyncio
import json
import math
import sys
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from pneuma_sidecar.scripture_parser import parse as parse_scriptures
from pneuma_sidecar.semantic_engine import SemanticEngine
from pneuma_sidecar.semantic_cache import SemanticCache
from pneuma_sidecar.deepgram_engine import DeepgramEngine

try:
    import websockets
except ImportError as exc:  # pragma: no cover - dependency guard
    print(f"[pneuma-sidecar] Missing dependency: {exc}", file=sys.stderr)
    raise

# --- Audio / VAD constants -------------------------------------------------

SAMPLE_RATE = 16_000           # Hz, fixed contract with the frontend worklet
START_RMS = 0.015              # energy above this is treated as speech
SILENCE_HANGOVER_MS = 700      # trailing silence that ends an utterance
MIN_UTTERANCE_MS = 350         # ignore blips shorter than this
PARTIAL_INTERVAL_MS = 900      # emit interim transcripts this often while speaking
MAX_UTTERANCE_MS = 15_000      # force-finalize runaway segments
SCRIPTURE_HOLD_MS = 750        # inference-delay hold before emitting detected scriptures


def _ms_to_samples(ms: float) -> int:
    return int(SAMPLE_RATE * ms / 1000.0)


@dataclass
class Utterance:
    """Accumulates PCM samples for the current speech segment."""

    chunks: list[np.ndarray] = field(default_factory=list)
    total_samples: int = 0
    is_speaking: bool = False
    silence_samples: int = 0
    samples_since_partial: int = 0

    def add(self, samples: np.ndarray) -> None:
        self.chunks.append(samples)
        self.total_samples += samples.shape[0]
        self.samples_since_partial += samples.shape[0]

    def audio(self) -> np.ndarray:
        if not self.chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(self.chunks)

    def duration_ms(self) -> float:
        return self.total_samples / SAMPLE_RATE * 1000.0

    def reset(self) -> None:
        self.chunks.clear()
        self.total_samples = 0
        self.is_speaking = False
        self.silence_samples = 0
        self.samples_since_partial = 0


class TranscriptionEngine:
    """Lazily-loaded Faster-Whisper model wrapper."""

    # Initial prompt biases the model toward Bible vocabulary so book names
    # and chapter/verse phrasing are recognised correctly.
    _INITIAL_PROMPT = (
        "Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth "
        "Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs "
        "Ecclesiastes Song of Solomon Isaiah Jeremiah Lamentations Ezekiel "
        "Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk "
        "Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts "
        "Romans Corinthians Galatians Ephesians Philippians Colossians "
        "Thessalonians Timothy Titus Philemon Hebrews James Peter Jude "
        "Revelation chapter verse chapters verses first second third "
        "first Corinthians second Thessalonians first Timothy second Peter"
    )

    def __init__(self, model_size: str = "base", compute_type: str = "int8"):
        self.model_size = model_size
        self.compute_type = compute_type
        self._model = None
        self._lock = asyncio.Lock()

    def load(self) -> None:
        from faster_whisper import WhisperModel

        print(
            f"[pneuma-sidecar] Loading Faster-Whisper '{self.model_size}' "
            f"({self.compute_type}, cpu)...",
            file=sys.stderr,
        )
        self._model = WhisperModel(
            self.model_size, device="cpu", compute_type=self.compute_type
        )
        print("[pneuma-sidecar] Model ready.", file=sys.stderr)

    def _transcribe_sync(self, audio: np.ndarray) -> tuple[str, float]:
        assert self._model is not None
        segments, _info = self._model.transcribe(
            audio,
            language="en",
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt=self._INITIAL_PROMPT,
        )
        texts: list[str] = []
        logprobs: list[float] = []
        for seg in segments:
            texts.append(seg.text.strip())
            logprobs.append(seg.avg_logprob)

        text = " ".join(t for t in texts if t).strip()
        if logprobs:
            # avg_logprob is negative; map to a 0..1 confidence.
            confidence = float(min(1.0, max(0.0, math.exp(sum(logprobs) / len(logprobs)))))
        else:
            confidence = 0.0
        return text, confidence

    async def transcribe(self, audio: np.ndarray) -> tuple[str, float]:
        async with self._lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._transcribe_sync, audio)


async def _send(ws, message: dict) -> None:
    try:
        await ws.send(json.dumps(message))
    except Exception:  # noqa: BLE001 - connection may have closed mid-send
        pass


def _transcript_message(
    text: str,
    confidence: float,
    is_final: bool,
    detected_scriptures: list | None = None,
) -> dict:
    return {
        "event_type": "TRANSCRIPT_CHUNK",
        "payload": {
            "raw_text": text,
            "is_final": is_final,
            "confidence_score": round(confidence, 4),
            "detected_scriptures": detected_scriptures or [],
        },
    }


class Session:
    """Per-connection audio buffering + transcription scheduling."""

    def __init__(
        self,
        ws,
        engine: TranscriptionEngine,
        semantic: Optional[SemanticEngine] = None,
        engine_mode: str = "local",
        deepgram_key: str = "",
        deepgram_model: str = "nova-3",
    ):
        self.ws = ws
        self.engine = engine
        self.semantic = semantic
        self.engine_mode = engine_mode
        self.utt = Utterance()
        # Inference-delay hold state
        self._pending_text: str = ""
        self._pending_confidence: float = 0.0
        self._pending_scriptures: list[dict] = []
        self._hold_task: asyncio.Task | None = None
        # Deepgram cloud engine (created lazily if key provided)
        self._deepgram: Optional[DeepgramEngine] = None
        self._deepgram_key = deepgram_key
        self._deepgram_model = deepgram_model
        # Semantic search result cache (LRU + TTL)
        self._semantic_cache = SemanticCache()

    async def handle_pcm(self, frame: bytes) -> None:
        if not frame:
            return

        # Cloud mode: forward PCM to Deepgram; transcripts arrive via callback
        if self.engine_mode == "cloud" and self._deepgram_key:
            if self._deepgram is None:
                self._deepgram = DeepgramEngine(self._deepgram_key, self._deepgram_model)
            if not self._deepgram.is_connected:
                await self._deepgram.connect(
                    on_transcript=self._on_deepgram_transcript,
                    on_status=self._on_deepgram_status,
                )
            await self._deepgram.feed_pcm(frame)
            return

        # Local mode: energy-gate VAD + batch transcription
        samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
        if samples.size == 0:
            return

        rms = float(np.sqrt(np.mean(samples**2)))
        is_voice = rms >= START_RMS

        if is_voice:
            self.utt.is_speaking = True
            self.utt.silence_samples = 0
            self.utt.add(samples)
        elif self.utt.is_speaking:
            # Keep trailing silence as part of the segment until hangover passes.
            self.utt.silence_samples += samples.size
            self.utt.add(samples)

        if not self.utt.is_speaking:
            return

        # Emit an interim transcript periodically for responsiveness.
        if (
            self.utt.samples_since_partial >= _ms_to_samples(PARTIAL_INTERVAL_MS)
            and self.utt.duration_ms() >= MIN_UTTERANCE_MS
        ):
            self.utt.samples_since_partial = 0
            await self._emit(is_final=False)

        # Finalize on trailing silence or a runaway segment.
        if self.utt.silence_samples >= _ms_to_samples(SILENCE_HANGOVER_MS) or (
            self.utt.duration_ms() >= MAX_UTTERANCE_MS
        ):
            await self._emit(is_final=True)
            self.utt.reset()

    async def _emit(self, is_final: bool) -> None:
        if self.utt.duration_ms() < MIN_UTTERANCE_MS:
            return
        audio = self.utt.audio()
        text, confidence = await self.engine.transcribe(audio)
        if not text:
            return

        if not is_final:
            # Partials: emit immediately with empty detected_scriptures
            await _send(self.ws, _transcript_message(text, confidence, is_final=False))
            return

        await self._process_final_transcript(text, confidence)

    async def _process_final_transcript(self, text: str, confidence: float) -> None:
        """Run scripture detection on a final transcript and emit (with hold timer)."""
        # Layer 1: regex
        scriptures = parse_scriptures(text)

        if not scriptures and self.semantic is not None:
            # Check semantic cache first
            cached = self._semantic_cache.get(text)
            if cached is not None:
                scriptures = cached
                print(f"[pneuma-sidecar] Semantic cache HIT", file=sys.stderr)
            else:
                # Layer 2: semantic vector search on regex miss
                try:
                    await self.semantic.ensure_ready()
                    scriptures = await self.semantic.search(text)
                except Exception as exc:  # noqa: BLE001
                    print(f"[pneuma-sidecar] Semantic search error: {exc}", file=sys.stderr)
                else:
                    self._semantic_cache.put(text, scriptures)
                    print(f"[pneuma-sidecar] Semantic cache MISS", file=sys.stderr)

        if not scriptures:
            await self._flush_pending()
            await _send(self.ws, _transcript_message(text, confidence, is_final=True))
            return

        await self._hold_final(text, confidence, scriptures)

    async def _hold_final(
        self, text: str, confidence: float, scriptures: list[dict]
    ) -> None:
        """Store pending detection and start/reset the hold timer."""
        # If we already have a pending chunk, emit it now (without scriptures)
        if self._hold_task is not None:
            self._hold_task.cancel()
            self._hold_task = None
            await _send(
                self.ws,
                _transcript_message(
                    self._pending_text,
                    self._pending_confidence,
                    is_final=True,
                ),
            )

        self._pending_text = text
        self._pending_confidence = confidence
        self._pending_scriptures = scriptures
        self._hold_task = asyncio.create_task(self._hold_timer())

    async def _hold_timer(self) -> None:
        """Wait SCRIPTURE_HOLD_MS then emit the held chunk with scriptures."""
        try:
            await asyncio.sleep(SCRIPTURE_HOLD_MS / 1000.0)
        except asyncio.CancelledError:
            return
        await self._flush_pending()

    async def _flush_pending(self) -> None:
        """Emit the held chunk (if any) with its detected scriptures."""
        if self._hold_task is not None:
            self._hold_task.cancel()
            self._hold_task = None
        if self._pending_text:
            await _send(
                self.ws,
                _transcript_message(
                    self._pending_text,
                    self._pending_confidence,
                    is_final=True,
                    detected_scriptures=self._pending_scriptures,
                ),
            )
            self._pending_text = ""
            self._pending_confidence = 0.0
            self._pending_scriptures = []

    async def _on_deepgram_transcript(
        self, text: str, confidence: float, is_final: bool
    ) -> None:
        """Callback for Deepgram streaming transcripts."""
        if not is_final:
            await _send(self.ws, _transcript_message(text, confidence, is_final=False))
            return
        await self._process_final_transcript(text, confidence)

    def _on_deepgram_status(self, state: str, message: Optional[str] = None) -> None:
        """Forward Deepgram guardrail status events to the client."""
        asyncio.create_task(_send(self.ws, {
            "event_type": "STATUS",
            "payload": {"state": state, "message": message or ""},
        }))

    async def _switch_engine(self, mode: str) -> None:
        """Switch between cloud and local transcription engines."""
        if mode == self.engine_mode:
            return
        await self._flush_pending()
        self.utt.reset()

        if mode == "cloud" and self._deepgram_key:
            if self._deepgram is None:
                self._deepgram = DeepgramEngine(self._deepgram_key, self._deepgram_model)
            await self._deepgram.connect(
                on_transcript=self._on_deepgram_transcript,
                on_status=self._on_deepgram_status,
            )
            self.engine_mode = "cloud"
        else:
            if self._deepgram is not None:
                await self._deepgram.disconnect()
            self.engine_mode = "local"

        await _send(self.ws, {
            "event_type": "STATUS",
            "payload": {"state": "engine_switched", "message": self.engine_mode},
        })

    async def cleanup(self) -> None:
        """Clean up session resources."""
        await self._flush_pending()
        if self._deepgram is not None:
            await self._deepgram.disconnect()

    async def handle_control(self, raw: str) -> None:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            return
        mtype = msg.get("type")
        if mtype == "reset":
            self.utt.reset()
            await self._flush_pending()
        elif mtype == "config":
            engine_val = msg.get("engine")
            if engine_val in ("cloud", "local"):
                await self._switch_engine(engine_val)
            # Allow mid-session Deepgram key injection
            dg_key = msg.get("deepgram_key")
            if isinstance(dg_key, str) and dg_key:
                self._deepgram_key = dg_key
            # Adjust inference-delay hold at runtime
            hold_ms = msg.get("inference_delay_ms")
            if isinstance(hold_ms, (int, float)) and 100 <= hold_ms <= 5000:
                global SCRIPTURE_HOLD_MS
                SCRIPTURE_HOLD_MS = int(hold_ms)
            # Adjust semantic threshold at runtime
            sem_thresh = msg.get("semantic_threshold")
            if isinstance(sem_thresh, (int, float)) and 0.3 <= sem_thresh <= 0.99:
                if self.semantic is not None:
                    self.semantic.threshold = float(sem_thresh)
            # Update hot words for Whisper initial prompt
            hot_words = msg.get("hot_words")
            if isinstance(hot_words, list):
                self.engine._INITIAL_PROMPT = self._build_initial_prompt(hot_words)

    @staticmethod
    def _build_initial_prompt(hot_words: list[str]) -> str:
        base = (
            "Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth "
            "Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs "
            "Ecclesiastes Song of Solomon Isaiah Jeremiah Lamentations Ezekiel "
            "Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk "
            "Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts "
            "Romans Corinthians Galatians Ephesians Philippians Colossians "
            "Thessalonians Timothy Titus Philemon Hebrews James Peter Jude "
            "Revelation chapter verse chapters verses first second third "
            "first Corinthians second Thessalonians first Timothy second Peter"
        )
        if hot_words:
            return base + " " + " ".join(hot_words)
        return base


def make_handler(
    engine: TranscriptionEngine,
    semantic: Optional[SemanticEngine] = None,
    engine_mode: str = "local",
    deepgram_key: str = "",
    deepgram_model: str = "nova-3",
):
    async def handler(ws):
        await _send(ws, {"event_type": "STATUS", "payload": {"state": "ready"}})
        session = Session(
            ws, engine, semantic,
            engine_mode=engine_mode,
            deepgram_key=deepgram_key,
            deepgram_model=deepgram_model,
        )
        try:
            async for message in ws:
                if isinstance(message, (bytes, bytearray)):
                    await session.handle_pcm(bytes(message))
                else:
                    await session.handle_control(message)
        except websockets.ConnectionClosed:
            pass
        finally:
            await session.cleanup()

    return handler


async def serve(
    host: str,
    port: int,
    model_size: str,
    embeddings_path: str = "",
    lance_path: str = "",
    onnx_model_path: str = "",
    engine_mode: str = "local",
    deepgram_key: str = "",
) -> None:
    engine = TranscriptionEngine(model_size=model_size)
    try:
        await asyncio.get_running_loop().run_in_executor(None, engine.load)
    except Exception as exc:  # noqa: BLE001
        print(f"[pneuma-sidecar] Model load failed: {exc}", file=sys.stderr)
        raise

    # Initialize semantic engine if paths are provided
    semantic: Optional[SemanticEngine] = None
    if embeddings_path and lance_path and onnx_model_path:
        semantic = SemanticEngine(
            model_path=onnx_model_path,
            embeddings_path=embeddings_path,
            lance_path=lance_path,
        )
        print("[pneuma-sidecar] Semantic engine configured (lazy load).", file=sys.stderr)
    else:
        print("[pneuma-sidecar] Semantic engine disabled (no paths provided).", file=sys.stderr)

    handler = make_handler(engine, semantic, engine_mode, deepgram_key)
    async with websockets.serve(handler, host, port, max_size=None):
        print(
            f"[pneuma-sidecar] Listening on ws://{host}:{port} "
            f"(model={model_size}, engine={engine_mode})",
            file=sys.stderr,
        )
        await asyncio.Future()  # run forever
