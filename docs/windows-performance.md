# Windows performance investigation

## What caused the lag

The original live path coupled four high-frequency workloads:

1. The audio worklet posted a 100ms PCM frame to the UI thread.
2. The VU meter wrote to the global Zustand store on every animation frame.
3. Every 900ms, the sidecar awaited a new transcription of the complete growing utterance inside the WebSocket receive loop.
4. Final transcript delivery waited for semantic model/index initialization and a 750ms correction hold.

This happens to remain usable on a fast Apple Silicon Mac. On a slower x64
Windows CPU, step 3 stops the sidecar from reading audio while Whisper runs.
Audio therefore queues in WebView2, the next inference covers even more audio,
and latency compounds. At the same time, the global VU update repeatedly
re-renders the multi-panel operator interface while Whisper competes for CPU.

Two Windows-specific differences made recognition worse:

- USB mixers and audio interfaces often expose stereo capture while carrying
  the microphone on only one channel. The old worklet always read channel 1.
- Point-sampling a 44.1/48kHz source at 16kHz introduced avoidable aliasing,
  and the fixed VAD threshold could clip quiet speech on lower-gain devices.

A clean Windows install also had to download the Faster-Whisper model on first
use even though the beta notes described the app as offline. Model loading took
place before the sidecar opened its WebSocket, so the app could appear live
while its audio was actually being discarded.

## Changes made

- Whisper inference is now decoupled from audio ingestion. Only one interim
  inference can be in flight; redundant partials are skipped, finals are
  snapshotted immediately, and stale interim results are discarded.
- Interim inference uses at most the latest six seconds of audio and runs every
  1.4 seconds instead of repeatedly queuing the full utterance every 900ms.
- VAD uses onset/continuation hysteresis plus 300ms of pre-roll for quiet input
  and intact first words.
- The worklet selects the active input channel and applies an averaging
  downsampler before producing 16kHz PCM.
- The capture branch terminates in a zero-gain destination so WebView2's
  pull-driven audio graph cannot prune the message-producing worklet.
- The VU meter runs at 20fps in component-local state, removing application-wide
  repaint pressure.
- The WebSocket client queues configuration until connected, prevents duplicate
  reconnect timers, and caps browser-side PCM backlog at 64KiB.
- The microphone starts only after the sidecar reports ready; the operator pill
  now distinguishes loading, ready, and reconnecting states.
- Final text is emitted before lazy semantic search. A later semantic match is
  merged into the existing transcript instead of creating a duplicate line.
- The correction hold is reduced from 750ms to 300ms.
- Windows limits Whisper to leave two logical cores free (up to six inference
  threads) and launches the CPU-heavy sidecar below normal priority, preserving
  WebView2 responsiveness.
- Release builds download and bundle the base Faster-Whisper model, eliminating
  the first-run network dependency.
- Release sidecar diagnostics are appended to `pneuma-sidecar.log` in the Tauri
  application-data directory. Every inference records audio duration, elapsed
  time, and real-time factor (`rtf`).

## Windows release targets

Validate on Windows 10 and 11, including one 4-core/8GB machine and one current
8-core/16GB machine.

| Measure                            | Release target                                         |
| ---------------------------------- | ------------------------------------------------------ |
| Audio readiness on a warm launch   | under 3 seconds                                        |
| Final reference after speech ends  | under 2 seconds at p95                                 |
| Whisper real-time factor           | below 0.75 at p95; must stay below 1.0                 |
| WebSocket PCM backlog              | below 64KiB; frames must not accumulate continuously   |
| Operator rendering while listening | no repeated task over 50ms; controls remain responsive |
| One-hour rehearsal                 | no increasing transcript delay or sidecar memory trend |

An `rtf` over 1.0 means the PC cannot transcribe that workload in real time with
the selected model. Test the `tiny` tier as a fallback on that hardware, but do
not silently downgrade because it trades recognition accuracy for speed.

## Target-machine verification

1. Install a release build on a clean PC with an up-to-date Evergreen WebView2
   Runtime. Disconnect the network and confirm the AI reaches **AI Ready**.
2. Test the built-in microphone, a mono USB microphone, and a stereo USB mixer
   with signal placed on channel 2. Speak a fixed 20-phrase scripture corpus.
3. Record end-of-speech-to-final latency and word/reference accuracy for every
   phrase. Compare the same WAV/PCM input between macOS and Windows when possible.
4. Inspect `pneuma-sidecar.log`. Separate model time (`rtf`) from WebView/UI lag;
   sustained `rtf >= 1.0` is an inference-capacity failure.
5. Capture a 60-second Edge DevTools Performance trace while listening. Confirm
   the former VU-driven full-app render loop is absent.
6. Use Windows Performance Recorder with Microsoft's WebView2 profile if the UI
   still stalls. Check CPU by process, hard page faults, antivirus activity, GPU
   utilization, and whether hardware acceleration is disabled by policy.
7. Run a one-hour rehearsal with the Presentation window open and confirm that
   transcript delay, process memory, and CPU do not trend upward.

Native Windows measurements remain a release gate: macOS unit/integration tests
can validate scheduling and backpressure, but cannot reproduce WebView2, Windows
audio drivers, Defender scanning, or the target PC's CPU characteristics.
