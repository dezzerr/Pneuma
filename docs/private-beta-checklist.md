# Pneuma private-beta acceptance checklist

Use this checklist for every beta install. The supported configuration is an
Apple Silicon Mac, local transcription, bundled KJV scripture, and licensed
user-imported Bibles. Cloud transcription, billing, the translation
marketplace, and NDI are not part of this beta.

## Before the service

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

## During a rehearsal

- Speak a known reference such as “John three sixteen”; confirm it appears in
  the transcript and enters the detection queue with verse text.
- Stage a detection, send it live, and confirm the presentation window updates.
- Exercise Live Sync, Enter, double-Enter, verse pagination, blackout, clear,
  freeze, and resume.
- Pause and resume transcription; then stop it and confirm the microphone is
  released and the session timer resets.
- Close and relaunch the Presentation window while the Operator stays open;
  verify a new verse can still be sent live.

## Failure and recovery checks

- With microphone permission denied or no input device selected, confirm the
  app shows an error and remains usable.
- Start a session before the sidecar is available; confirm the app shows an
  error rather than becoming stuck in Starting.
- Stop/restart the app after a session and confirm it returns to a safe Idle
  state with KJV still searchable.

## Record with every result

- Pneuma version, macOS version, Mac model/RAM, microphone/interface, and
  whether the app was installed from the beta DMG.
- The exact spoken phrase or action, expected result, actual result, and a
  screenshot or screen recording for any failure.
- Classify any stuck live output, lost verse data, unrecoverable microphone
  failure, or inability to recover the presentation window as release-blocking.
- Submit the result through the [private-beta feedback form](https://github.com/dezzerr/pneuma/issues/new?template=private-beta-feedback.md).
