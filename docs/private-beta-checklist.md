# Pneuma private-beta acceptance checklist

Use this checklist for every beta install. The supported configuration is an
Apple Silicon Mac or Windows 10/11 x64 PC, local transcription, bundled KJV
scripture, and licensed user-imported Bibles. Cloud transcription, billing,
the translation marketplace, and NDI are not part of this beta.

## macOS acceptance

### Before the service

- Install the DMG on a non-developer Mac; launch Pneuma without a terminal or
  Python environment installed. Because this private beta is ad-hoc signed,
  use Finder's **Open** action if macOS asks for confirmation.
- Confirm the Operator window opens, then use **Launch** to open the
  Presentation window.
- Confirm KJV reference search returns verses and the presentation window shows
  a staged verse correctly.
- If importing a Bible, use a translation the church is licensed to use;
  confirm it appears in search after import.
- Grant microphone permission, select the intended input, and check that the
  audio meter responds to speech.
- Start local transcription and confirm the session changes from Idle to Live.

### During a rehearsal

- Speak a known reference such as “John three sixteen”; confirm it appears in
  the transcript and enters the detection queue with verse text.
- Stage a detection, send it live, and confirm the presentation window updates.
- Exercise Live Sync, Enter, double-Enter, verse pagination, blackout, clear,
  freeze, and resume.
- Pause and resume transcription; then stop it and confirm the microphone is
  released and the session timer resets.
- Close and relaunch the Presentation window while the Operator stays open;
  verify a new verse can still be sent live.

### Failure and recovery checks

- With microphone permission denied or no input device selected, confirm the
  app shows an error and remains usable.
- Start a session before the sidecar is available; confirm the app shows an
  error rather than becoming stuck in Starting.
- Stop/restart the app after a session and confirm it returns to a safe Idle
  state with KJV still searchable.

## Shared feedback

### Record with every result

- Pneuma version, macOS version, Mac model/RAM, microphone/interface, and
  whether the app was installed from the beta DMG.
- The exact spoken phrase or action, expected result, actual result, and a
  screenshot or screen recording for any failure.
- Classify any stuck live output, lost verse data, unrecoverable microphone
  failure, or inability to recover the presentation window as release-blocking.
- Submit the result through the [private-beta feedback form](https://github.com/dezzerr/pneuma/issues/new?template=private-beta-feedback.md).

## Windows acceptance

### Before the service

- Install the MSI on a clean Windows 10 x64 and Windows 11 x64 machine as a
  standard user. Use NSIS as a fallback installation test.
- If SmartScreen warns about the unsigned publisher, choose **More info** and
  **Run anyway** after verifying the installer source.
- Confirm Pneuma launches without Python, Node, Rust, or other developer tools.
- Confirm the bundled `pneuma-sidecar.exe` reaches the ready state.
- Disconnect the network on a clean install and confirm the bundled model still reaches **AI Ready**.
- Confirm KJV reference search returns verses and use **Launch** to open the
  Presentation window.
- Grant microphone permission, select the intended input, and check that the
  audio meter responds to speech.

### During a rehearsal

- Speak a known reference such as “John three sixteen”; confirm it appears in
  the transcript and enters the detection queue with verse text.
- Stage a detection, send it live, and confirm the Presentation window updates.
- Exercise Live Sync, Enter, double-Enter, verse pagination, blackout, clear,
  freeze, and resume.
- Pause, resume, and stop transcription; confirm the microphone is released.
- Close and relaunch the Presentation window while the Operator stays open.

### Failure and installation checks

- Exit Pneuma and confirm no `pneuma-sidecar.exe` process remains.
- Uninstall and reinstall with both MSI and NSIS.
- Test microphone denial/no input and confirm the app remains usable.
- Record Windows version, PC model/RAM, microphone/interface, installer type,
  sidecar errors, and any SmartScreen message.
- Attach `pneuma-sidecar.log` from the Pneuma application-data directory and
  report the p95 `rtf` value for any transcription-latency issue.
