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

Production build succeeded. Full unit/integration suite passed 184 tests before adding four additional reference-correction tests; the focused scripture/approval suite then passed all 19 tests. Desktop smoke test passed on Apple Silicon: startup, first-run setup, create show, edit groups, save and close. Screenshot: test-output/screenshots/pneuma-desktop.png.

Real local recognition used the user-selected YouTube sermon Ky0brGRvEs8, requested range 46:00–51:00. Stream-copy extraction retained approximately ten seconds of preroll (309.97 seconds total). Recognition processed that audio in 33.85 seconds, produced 267 segments and reported no engine errors. This is an offline throughput probe, not an accuracy benchmark or microphone latency measurement. Recognition errors remain in the transcript. Model downloads were checked against upstream SHA-256 hashes.

Reproduce the recognition probe after building:

```
node scripts/pneuma-recognition-probe.cjs audio.pcm model-directory result.json
```

Input is signed 16-bit little-endian mono PCM at 16 kHz. Keep copyrighted recordings and full transcripts out of Git.

## Remaining release gates

End-to-end live microphone → correct scripture → operator approval → audience output verification; Windows installer and device validation; Intel Mac engine; full branding review; distribution permissions for any bundled Bible/model content; signing/notarization. The present package is an early development prototype.
