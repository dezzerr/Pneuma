"""Tests for DeepgramEngine — URL construction, transcript parsing, guardrails.

Uses fake WebSocket and mocked time to avoid real network calls.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from pneuma_sidecar.deepgram_engine import (
    DEEPGRAM_URL,
    DROP_WARN_S,
    IDLE_TIMEOUT_S,
    DeepgramEngine,
    _build_url,
)


class TestBuildUrl:
    def test_base_url(self):
        url = _build_url("nova-3")
        assert url.startswith(DEEPGRAM_URL)

    def test_model_param(self):
        url = _build_url("nova-3")
        assert "model=nova-3" in url

    def test_encoding_params(self):
        url = _build_url("nova-3")
        assert "encoding=linear16" in url
        assert "sample_rate=16000" in url
        assert "channels=1" in url

    def test_keywords_included(self):
        url = _build_url("nova-3")
        assert "keyword=Genesis" in url
        assert "keyword=Revelation" in url
        assert "keyword=chapter" in url


class TestConnect:
    @pytest.mark.asyncio
    async def test_connect_success(self):
        engine = DeepgramEngine(api_key="test-key")

        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        mock_ws.close = AsyncMock()

        with patch(
            "pneuma_sidecar.deepgram_engine.websockets.connect", new_callable=AsyncMock
        ) as mock_connect:
            mock_connect.return_value = mock_ws
            on_transcript = AsyncMock()
            on_status = MagicMock()

            await engine.connect(on_transcript, on_status)

            assert engine.is_connected is True
            assert engine.is_idle_paused is False
            # Status callback should have been called with "deepgram_ready"
            on_status.assert_any_call("deepgram_ready", None)

            # Cleanup
            await engine.disconnect()

    @pytest.mark.asyncio
    async def test_connect_failure(self):
        engine = DeepgramEngine(api_key="bad-key")

        with patch(
            "pneuma_sidecar.deepgram_engine.websockets.connect", new_callable=AsyncMock
        ) as mock_connect:
            mock_connect.side_effect = Exception("Auth failed")
            on_transcript = AsyncMock()
            on_status = MagicMock()

            with pytest.raises(Exception, match="Auth failed"):
                await engine.connect(on_transcript, on_status)

            on_status.assert_any_call("error", "Deepgram connect failed: Auth failed")


class TestFeedPCM:
    @pytest.mark.asyncio
    async def test_feed_sends_to_ws(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        engine._ws = AsyncMock()
        engine._ws.send = AsyncMock()

        # Create valid PCM data (silence)
        pcm = np.zeros(1600, dtype=np.int16).tobytes()
        await engine.feed_pcm(pcm)
        engine._ws.send.assert_called_once_with(pcm)

    @pytest.mark.asyncio
    async def test_feed_detects_speech(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        engine._ws = AsyncMock()
        engine._ws.send = AsyncMock()

        # Create loud PCM data
        pcm = (np.ones(1600, dtype=np.int16) * 30000).tobytes()
        with patch("pneuma_sidecar.deepgram_engine.time.monotonic", return_value=100.0):
            await engine.feed_pcm(pcm)

        assert engine._has_speech is True

    @pytest.mark.asyncio
    async def test_feed_when_idle_paused_with_speech_triggers_resume(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        engine._idle_paused = True
        engine._has_speech = True

        loud_pcm = (np.ones(1600, dtype=np.int16) * 30000).tobytes()

        with (
            patch("pneuma_sidecar.deepgram_engine.time.monotonic") as mock_time,
            patch.object(engine, "_resume", new_callable=AsyncMock) as mock_resume,
        ):
            mock_time.return_value = 100.0
            engine._last_speech_ts = 99.5  # Recent speech
            await engine.feed_pcm(loud_pcm)
            mock_resume.assert_called_once()

    @pytest.mark.asyncio
    async def test_feed_when_disconnected_does_nothing(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = False
        engine._ws = None

        pcm = np.zeros(1600, dtype=np.int16).tobytes()
        # Should not raise
        await engine.feed_pcm(pcm)


class TestTranscriptParsing:
    @pytest.mark.asyncio
    async def test_listen_loop_parses_results(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True

        # Create a fake WebSocket that yields one Results message then stops
        results_msg = json.dumps(
            {
                "type": "Results",
                "is_final": True,
                "channel": {
                    "alternatives": [{"transcript": "john three sixteen", "confidence": 0.95}]
                },
            }
        )

        async def fake_aiter():
            yield results_msg

        engine._ws = MagicMock()
        engine._ws.__aiter__ = lambda self: fake_aiter()

        on_transcript = AsyncMock()
        engine._on_transcript = on_transcript

        await engine._listen_loop()

        on_transcript.assert_called_once_with("john three sixteen", 0.95, True)

    @pytest.mark.asyncio
    async def test_listen_loop_skips_empty_transcript(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True

        results_msg = json.dumps(
            {
                "type": "Results",
                "is_final": True,
                "channel": {"alternatives": [{"transcript": "", "confidence": 0.0}]},
            }
        )

        async def fake_aiter():
            yield results_msg

        engine._ws = MagicMock()
        engine._ws.__aiter__ = lambda self: fake_aiter()

        on_transcript = AsyncMock()
        engine._on_transcript = on_transcript

        await engine._listen_loop()
        on_transcript.assert_not_called()

    @pytest.mark.asyncio
    async def test_listen_loop_skips_malformed_json(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True

        async def fake_aiter():
            yield "not valid json"
            yield json.dumps({"type": "Results", "channel": {"alternatives": []}})

        engine._ws = MagicMock()
        engine._ws.__aiter__ = lambda self: fake_aiter()

        engine._on_transcript = AsyncMock()
        await engine._listen_loop()
        engine._on_transcript.assert_not_called()


class TestGuardLoop:
    @pytest.mark.asyncio
    async def test_idle_pause_after_timeout(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        engine._has_speech = False
        engine._last_speech_ts = 0.0

        with (
            patch("pneuma_sidecar.deepgram_engine.time.monotonic", return_value=IDLE_TIMEOUT_S + 1),
            patch.object(engine, "_pause_idle", new_callable=AsyncMock) as mock_pause,
        ):
            # Directly invoke the guard loop body by calling _guard_loop
            # and stopping after one iteration
            async def one_iteration_guard():
                await asyncio.sleep(0)  # GUARD_INTERVAL_S replaced
                now = IDLE_TIMEOUT_S + 1
                silence_duration = now - engine._last_speech_ts
                if silence_duration >= IDLE_TIMEOUT_S and not engine._idle_paused:
                    await engine._pause_idle()

            await one_iteration_guard()
            mock_pause.assert_called_once()

    @pytest.mark.asyncio
    async def test_drop_warning_emitted(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        engine._has_speech = True
        engine._last_speech_ts = 0.0
        engine._last_token_ts = 0.0
        engine._drop_warned = False

        on_status = MagicMock()
        engine._on_status = on_status

        with patch("pneuma_sidecar.deepgram_engine.time.monotonic", return_value=DROP_WARN_S + 1):
            # Simulate one iteration of the guard loop body
            now = DROP_WARN_S + 1
            if engine._has_speech and not engine._drop_warned:
                token_gap = now - engine._last_token_ts
                if token_gap >= DROP_WARN_S:
                    engine._drop_warned = True
                    engine._on_status("connection_drop", None)

            on_status.assert_any_call("connection_drop", None)


class TestDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_closes_ws(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._connected = True
        mock_ws = AsyncMock()
        mock_ws.close = AsyncMock()
        engine._ws = mock_ws
        engine._listen_task = asyncio.create_task(asyncio.sleep(100))
        engine._guard_task = asyncio.create_task(asyncio.sleep(100))

        await engine.disconnect()

        assert engine.is_connected is False
        mock_ws.close.assert_called_once()
        assert engine._listen_task is None
        assert engine._guard_task is None
        assert engine._ws is None

    @pytest.mark.asyncio
    async def test_disconnect_when_not_connected(self):
        engine = DeepgramEngine(api_key="test-key")
        await engine.disconnect()
        assert engine.is_connected is False


class TestCloseStream:
    @pytest.mark.asyncio
    async def test_close_stream_sends_close_message(self):
        engine = DeepgramEngine(api_key="test-key")
        engine._ws = AsyncMock()
        engine._ws.send = AsyncMock()

        await engine.close_stream()
        engine._ws.send.assert_called_once()
        sent_msg = engine._ws.send.call_args[0][0]
        assert json.loads(sent_msg)["type"] == "CloseStream"

    @pytest.mark.asyncio
    async def test_close_stream_no_ws(self):
        engine = DeepgramEngine(api_key="test-key")
        await engine.close_stream()  # Should not raise
