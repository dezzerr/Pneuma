# Pneuma desktop prototype

Free, local-first Mac and Windows desktop presentation application based on FreeShow, GPL-3.0. Original copyright and LICENSE retained. Modifications started 13 November 2026. Upstream baseline: ChurchApps/FreeShow c8ec93aee774b27b5e74c63346296581efed1bdd.

This prototype reuses FreeShow's presentation, local speech recognition, scripture matching and operator suggestions. No subscription, account or hosted transcription backend is required. Optional upstream online integrations remain available; this is not a network-isolated edition.

## Run and package

Node 22.12+, Python 3.12 with setuptools, and platform native build prerequisites described in README.md are required. Run `npm ci`, `npm start`. Run `npm run test:unit` and `npm run build` before packaging. `npm run release:local` creates unsigned local packages without publishing.

The Pneuma desktop workflow builds Apple Silicon macOS and Windows x64 packages and uploads build artifacts. It does not publish a release. Original upstream workflows are preserved inactive in config/upstream-workflows to avoid publishing under upstream identities.

## Use local sermon detection

1. Import a properly licensed local Bible in Scripture and select it. An API Bible does not support local detection.
2. In Smart/AI settings, enable the feature and download its local speech model. Initial setup requires internet; recognition runs locally afterwards.
3. Select your microphone/audio input. Keep scripture auto presentation set to Ask.
4. Detected references appear in the transcription suggestion panel. Open a suggestion to preview scripture and approve it to present.

Model files and the user's test sermon are not included in source or installers. Intel Mac transcription is not supported by the inherited Nemotron engine; an alternative engine remains necessary for Intel support. Windows packages require Windows runtime testing. Unsigned Mac packages are development builds, not notarized public releases.

## Changes

- Pneuma package identity, main UI branding and existing Pneuma icons.
- Separate default Documents/Pneuma Desktop content directory.
- Disabled upstream automatic updater and automatic error reporting.
- Preserved detected Bible translation through preview and approved presentation.
- Context-limited corrections for Ecclesiastes variants observed in the sermon test.
- Regression tests for approval, translation retention and spoken-reference corrections.
- Desktop smoke test now handles popup dismissal and the Mac save shortcut correctly.
- Encoder test feeds frames at capture cadence and waits for output pipes to drain.

## Validation, 13 November 2026

Production build succeeded. Full unit/integration suite passed all 188 tests, including the reference-correction tests. Desktop smoke test passed on Apple Silicon: startup, first-run setup, create show, edit groups, save and close. Screenshot: test-output/screenshots/pneuma-desktop.png. Packaged Apple Silicon application also launched successfully with disposable settings; screenshot: test-output/screenshots/pneuma-packaged.png. Local unsigned DMG created successfully.

Real local recognition used the user-selected YouTube sermon Ky0brGRvEs8, requested range 46:00–51:00. Stream-copy extraction retained approximately ten seconds of preroll (309.97 seconds total). Recognition processed that audio in 33.85 seconds, produced 267 segments and reported no engine errors. This is an offline throughput probe, not an accuracy benchmark or microphone latency measurement. Recognition errors remain in the transcript. Model downloads were checked against upstream SHA-256 hashes.

Reproduce the recognition probe after building:

```
node scripts/pneuma-recognition-probe.cjs audio.pcm model-directory result.json
```

Input is signed 16-bit little-endian mono PCM at 16 kHz. Keep copyrighted recordings and full transcripts out of Git.

## Remaining release gates

End-to-end live microphone → correct scripture → operator approval → audience output verification; Windows installer and device validation; Intel Mac engine; full branding review; distribution permissions for any bundled Bible/model content; signing/notarization. The present package is an early development prototype.

## Parakeet local transcription (Apple Silicon prototype)

This build can use the Parakeet Unified English GGUF already installed by Hex, without copying or changing Hex's files or sending audio to a server. It expects `~/Library/Application Support/Hex/models/parakeet-unified-en-0.6b-Q8_0.gguf`. This model is not bundled or redistributed with Pneuma. On this Mac an existing Nemotron setting is switched once if the worker and Hex model are present; choose Nemotron again under Settings → Smart → Transcription if desired. Windows retains Nemotron; Intel Mac transcription remains unsupported. Parakeet is not yet supported on either platform. A missing model or worker results in an explicit error, and Nemotron remains selectable.

The streaming worker is built from MIT-licensed transcribe.cpp commit `275cd50d2c4104c204009a197ac091b9687668e5`; its source, reproducible build script and upstream/third-party notices are in `scripts/parakeet`. The prebuilt Apple Silicon worker is in `resources/parakeet/mac-arm64`. The model has separate NVIDIA licensing. The actual user's model is read in place; no model file is copied or checked into this repository.

With `PNEUMA_PARAKEET_TEST_PCM` pointing to 16 kHz mono s16le audio and the Hex model present, run `npx vitest run --config config/testing/vitest.config.ts src/electron/ai/stt/models/ParakeetTranscriber.test.ts`. A 20-second excerpt of the user-selected sermon was streamed at real-time cadence through the worker and produced the word Ecclesiastes. This is not proof of real microphone performance or Windows support.

### Streaming responsiveness

Parakeet uses the 560 ms chunk / 560 ms right-context configuration and reads audio in 200 ms batches. Microphone data arriving before the model signals readiness is discarded rather than queued; the UI shows that the model is starting. A 90-second real-time replay of the user-provided sermon excerpt on this Apple Silicon Mac produced first text after 1.8 seconds and completed in 90.1 seconds with peak feed lag 0.13 seconds. On a 20-second excerpt, the prior and balanced configurations produced the same 36 words; this is not an accuracy or microphone benchmark for all speakers or machines. The matcher handles an immediate explicit follow-on such as "Leviticus 1 verse 1, verse 2" without reselecting verse 1.
