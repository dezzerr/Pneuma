# Pneuma 0.1.0 private beta

## Who this build is for

Church media teams using an Apple Silicon Mac or Windows 10/11 x64 PC who can
run a rehearsal before using Pneuma in a live service. The macOS build is
ad-hoc signed; the Windows build is unsigned. Neither build is notarized or
Authenticode-signed for public distribution.

## Install

### macOS

1. Open `Pneuma_0.1.0_aarch64.dmg`.
2. Drag **Pneuma** to Applications.
3. Open Pneuma from Finder. If macOS asks for confirmation, use Finder's
   **Open** action to approve this private-beta build.
4. On first launch, allow microphone access and choose the intended input.

### Windows

1. Use the MSI installer as the primary installation path. Use the NSIS
   installer only if MSI cannot be used on the test machine.
2. If Windows SmartScreen warns that the publisher is unknown, choose
   **More info**, verify the file came from the Pneuma beta distribution, and
   choose **Run anyway**.
3. Launch Pneuma from the Start menu and allow microphone access when asked.
4. Do not install Python, Node, Rust, or other developer tools; the installer
   includes the transcription sidecar and runtime assets.

## Supported in this beta

- Local, offline transcription using the bundled base model.
- Bundled KJV scripture search and display.
- Licensed user Bible imports in OpenSong XML, Zefania XML, and SQLite formats.
- Operator and Presentation windows, staging, live output, hotkeys, themes,
  and canvas controls.

## Not included in this beta

- Cloud transcription and billing.
- Translation marketplace downloads.
- NDI broadcast.

## Before a live service

Complete the [private-beta acceptance checklist](private-beta-checklist.md)
during a rehearsal. Report outcomes through the
[private-beta feedback form](https://github.com/dezzerr/pneuma/issues/new?template=private-beta-feedback.md).

Please treat a stuck live output, lost verse data, unrecoverable microphone
failure, or an unrecoverable Presentation window as release-blocking.
