"""Tests for the WebSocket inference server — Session, control messages, cleanup.

Uses fake WebSocket and mocked transcription engine to avoid real model loading.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from pneuma_sidecar.server import (
    Session,
    TranscriptionEngine,
    Utterance,
    _ms_to_samples,
    _transcript_message,
    make_handler,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_fake_ws():
    """Create a fake WebSocket that records sent messages."""
    ws = AsyncMock()
    ws.send = AsyncMock()
    sent_messages = []

    async def capture_send(data):
        sent_messages.append(data)

    ws.send.side_effect = capture_send
    return ws, sent_messages


def make_mock_engine():
    engine = MagicMock(spec=TranscriptionEngine)
    engine.transcribe = AsyncMock(return_value=("john three sixteen", 0.95))
    engine._INITIAL_PROMPT = "test prompt"
    return engine


def silence_pcm(ms: float) -> bytes:
    samples = int(16000 * ms / 1000.0)
    return np.zeros(samples, dtype=np.int16).tobytes()


def speech_pcm(ms: float) -> bytes:
    samples = int(16000 * ms / 1000.0)
    return (np.ones(samples, dtype=np.int16) * 30000).tobytes()


# ---------------------------------------------------------------------------
# Utterance dataclass
# ---------------------------------------------------------------------------


class TestUtterance:
    def test_add_increments_counters(self):
        utt = Utterance()
        samples = np.ones(100, dtype=np.float32)
        utt.add(samples)
        assert utt.total_samples == 100
        assert utt.samples_since_partial == 100
        assert len(utt.chunks) == 1

    def test_audio_concatenates_chunks(self):
        utt = Utterance()
        utt.add(np.ones(50, dtype=np.float32))
        utt.add(np.ones(50, dtype=np.float32))
        audio = utt.audio()
        assert audio.shape == (100,)

    def test_audio_empty(self):
        utt = Utterance()
        assert utt.audio().shape == (0,)

    def test_duration_ms(self):
        utt = Utterance()
        utt.add(np.ones(16000, dtype=np.float32))
        assert utt.duration_ms() == 1000.0

    def test_reset(self):
        utt = Utterance()
        utt.add(np.ones(100, dtype=np.float32))
        utt.is_speaking = True
        utt.silence_samples = 50
        utt.reset()
        assert utt.total_samples == 0
        assert utt.is_speaking is False
        assert utt.silence_samples == 0
        assert utt.samples_since_partial == 0


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


class TestMsToSamples:
    def test_one_second(self):
        assert _ms_to_samples(1000) == 16000

    def test_half_second(self):
        assert _ms_to_samples(500) == 8000

    def test_zero(self):
        assert _ms_to_samples(0) == 0


class TestTranscriptMessage:
    def test_final_with_scriptures(self):
        msg = _transcript_message("hello", 0.9, True, [{"book_id": 1}])
        assert msg["event_type"] == "TRANSCRIPT_CHUNK"
        assert msg["payload"]["raw_text"] == "hello"
        assert msg["payload"]["is_final"] is True
        assert msg["payload"]["confidence_score"] == 0.9
        assert msg["payload"]["detected_scriptures"] == [{"book_id": 1}]

    def test_partial_without_scriptures(self):
        msg = _transcript_message("hello", 0.5, False)
        assert msg["payload"]["is_final"] is False
        assert msg["payload"]["detected_scriptures"] == []


# ---------------------------------------------------------------------------
# Session — local mode VAD
# ---------------------------------------------------------------------------


class TestSessionVAD:
    @pytest.mark.asyncio
    async def test_silence_does_not_start_utterance(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_pcm(silence_pcm(100))
        assert session.utt.is_speaking is False
        assert session.utt.total_samples == 0

    @pytest.mark.asyncio
    async def test_speech_starts_utterance(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_pcm(speech_pcm(100))
        assert session.utt.is_speaking is True
        assert session.utt.total_samples > 0

    @pytest.mark.asyncio
    async def test_silence_after_speech_accumulates(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_pcm(speech_pcm(100))
        assert session.utt.is_speaking is True
        await session.handle_pcm(silence_pcm(100))
        # Silence after speech should accumulate
        assert session.utt.silence_samples > 0

    @pytest.mark.asyncio
    async def test_empty_frame_ignored(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_pcm(b"")
        assert session.utt.total_samples == 0


# ---------------------------------------------------------------------------
# Session — final transcript emission with scripture hold
# ---------------------------------------------------------------------------


class TestSessionFinalTranscript:
    @pytest.mark.asyncio
    async def test_final_emits_with_scriptures(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)

        # Feed enough speech + silence to trigger final
        await session.handle_pcm(speech_pcm(500))
        await session.handle_pcm(silence_pcm(800))

        # Wait for hold timer (750ms default)
        await asyncio.sleep(0.9)

        # Should have sent at least one message
        assert len(sent) > 0
        # Find the final transcript with scriptures
        finals = [json.loads(m) for m in sent if "TRANSCRIPT_CHUNK" in m]
        assert len(finals) > 0
        final = finals[-1]
        assert final["payload"]["is_final"] is True
        assert final["payload"]["raw_text"] == "john three sixteen"
        # Scriptures should be detected from "john three sixteen"
        assert len(final["payload"]["detected_scriptures"]) > 0

    @pytest.mark.asyncio
    async def test_final_without_scriptures_emits_immediately(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        engine.transcribe = AsyncMock(return_value=("hello world", 0.9))
        session = Session(ws, engine)

        await session.handle_pcm(speech_pcm(500))
        await session.handle_pcm(silence_pcm(800))

        # No hold timer for non-scripture text — should emit immediately
        await asyncio.sleep(0.05)
        finals = [json.loads(m) for m in sent if "TRANSCRIPT_CHUNK" in m]
        assert len(finals) > 0
        assert finals[-1]["payload"]["detected_scriptures"] == []


# ---------------------------------------------------------------------------
# Session — control messages
# ---------------------------------------------------------------------------


class TestSessionControl:
    @pytest.mark.asyncio
    async def test_reset_clears_utterance(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        session.utt.is_speaking = True
        session.utt.total_samples = 1000
        await session.handle_control(json.dumps({"type": "reset"}))
        assert session.utt.is_speaking is False
        assert session.utt.total_samples == 0

    @pytest.mark.asyncio
    async def test_config_engine_switch(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine, deepgram_key="test-key")
        with patch.object(session, "_switch_engine", new_callable=AsyncMock) as mock_switch:
            await session.handle_control(json.dumps({"type": "config", "engine": "cloud"}))
            mock_switch.assert_called_once_with("cloud")
        # Should emit engine_switched status (via _switch_engine, but we mocked it)
        # So just verify the switch was called

    @pytest.mark.asyncio
    async def test_config_deepgram_key_injection(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_control(json.dumps({"type": "config", "deepgram_key": "new-key"}))
        assert session._deepgram_key == "new-key"

    @pytest.mark.asyncio
    async def test_config_inference_delay(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        import pneuma_sidecar.server as server_mod

        original = server_mod.SCRIPTURE_HOLD_MS
        await session.handle_control(json.dumps({"type": "config", "inference_delay_ms": 1000}))
        assert server_mod.SCRIPTURE_HOLD_MS == 1000
        server_mod.SCRIPTURE_HOLD_MS = original  # Restore

    @pytest.mark.asyncio
    async def test_config_semantic_threshold(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        mock_semantic = MagicMock()
        mock_semantic.threshold = 0.7
        session = Session(ws, engine, semantic=mock_semantic)
        await session.handle_control(json.dumps({"type": "config", "semantic_threshold": 0.85}))
        assert mock_semantic.threshold == 0.85

    @pytest.mark.asyncio
    async def test_config_hot_words(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_control(
            json.dumps({"type": "config", "hot_words": ["pastor", "sermon"]})
        )
        assert "pastor" in engine._INITIAL_PROMPT
        assert "sermon" in engine._INITIAL_PROMPT

    @pytest.mark.asyncio
    async def test_invalid_json_ignored(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_control("not valid json")
        # Should not raise

    @pytest.mark.asyncio
    async def test_unknown_type_ignored(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        await session.handle_control(json.dumps({"type": "unknown"}))
        # Should not raise


# ---------------------------------------------------------------------------
# Session — cleanup
# ---------------------------------------------------------------------------


class TestSessionCleanup:
    @pytest.mark.asyncio
    async def test_cleanup_flushes_pending(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine)
        session._pending_text = "pending text"
        session._pending_confidence = 0.8
        session._pending_scriptures = [{"book_id": 1}]
        await session.cleanup()
        # Should have flushed the pending text
        finals = [json.loads(m) for m in sent if "TRANSCRIPT_CHUNK" in m]
        assert len(finals) > 0
        assert finals[-1]["payload"]["raw_text"] == "pending text"

    @pytest.mark.asyncio
    async def test_cleanup_disconnects_deepgram(self):
        ws, _ = make_fake_ws()
        engine = make_mock_engine()
        session = Session(ws, engine, deepgram_key="test-key")
        mock_dg = AsyncMock()
        mock_dg.disconnect = AsyncMock()
        session._deepgram = mock_dg
        await session.cleanup()
        mock_dg.disconnect.assert_called_once()


# ---------------------------------------------------------------------------
# make_handler — protocol
# ---------------------------------------------------------------------------


class TestMakeHandler:
    @pytest.mark.asyncio
    async def test_handler_sends_ready_status(self):
        engine = make_mock_engine()
        ws, sent = make_fake_ws()

        handler = make_handler(engine)

        # Start handler, then cancel after initial status
        async def stop_after_ready():
            await asyncio.sleep(0.05)
            ws.connection_closing = True

        # Simulate a connection that immediately closes
        async def empty_aiter():
            return
            yield  # Make it an async generator

        ws.__aiter__ = lambda self: empty_aiter()
        ws.__aiter__ = lambda self: empty_aiter()

        with patch("pneuma_sidecar.server.websockets.ConnectionClosed", Exception):
            await handler(ws)

        statuses = [json.loads(m) for m in sent if "STATUS" in m]
        assert any(s["payload"]["state"] == "ready" for s in statuses)

    @pytest.mark.asyncio
    async def test_handler_processes_binary_and_text(self):
        engine = make_mock_engine()
        ws, sent = make_fake_ws()

        async def msg_aiter():
            yield speech_pcm(500)
            yield silence_pcm(800)
            yield json.dumps({"type": "reset"})

        ws.__aiter__ = lambda self: msg_aiter()

        with patch("pneuma_sidecar.server.websockets.ConnectionClosed", Exception):
            handler = make_handler(engine)
            await handler(ws)

        # Should have received the ready status and possibly transcript
        statuses = [json.loads(m) for m in sent if "STATUS" in m]
        assert len(statuses) > 0


# ---------------------------------------------------------------------------
# Session — semantic fallback and cache
# ---------------------------------------------------------------------------


class TestSemanticFallback:
    @pytest.mark.asyncio
    async def test_semantic_search_on_regex_miss(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        engine.transcribe = AsyncMock(return_value=("the lord is my shepherd", 0.9))
        mock_semantic = MagicMock()
        mock_semantic.ensure_ready = AsyncMock()
        mock_semantic.search = AsyncMock(return_value=[{"book_id": 19, "book_name": "Psalms"}])
        session = Session(ws, engine, semantic=mock_semantic)

        await session.handle_pcm(speech_pcm(500))
        await session.handle_pcm(silence_pcm(800))
        await asyncio.sleep(0.2)

        mock_semantic.ensure_ready.assert_called_once()
        mock_semantic.search.assert_called_once()

    @pytest.mark.asyncio
    async def test_semantic_cache_hit_skips_search(self):
        ws, sent = make_fake_ws()
        engine = make_mock_engine()
        engine.transcribe = AsyncMock(return_value=("the lord is my shepherd", 0.9))
        mock_semantic = MagicMock()
        mock_semantic.ensure_ready = AsyncMock()
        mock_semantic.search = AsyncMock(return_value=[{"book_id": 19}])
        session = Session(ws, engine, semantic=mock_semantic)

        # Pre-populate cache
        session._semantic_cache.put("the lord is my shepherd", [{"book_id": 19, "cached": True}])

        await session.handle_pcm(speech_pcm(500))
        await session.handle_pcm(silence_pcm(800))
        await asyncio.sleep(0.2)

        # Search should NOT be called since cache hit
        mock_semantic.search.assert_not_called()
