# Pneuma Desktop

A free, open-source church presentation app for macOS and Windows, built on [FreeShow](https://github.com/ChurchApps/FreeShow). Local sermon transcription and scripture suggestions help an operator prepare and approve what reaches the screens. No Pneuma subscription or hosted transcription backend is required.

**Development prototype:** Apple Silicon Mac builds and local recognition have been exercised. Windows packages are built by GitHub Actions and require device testing. Intel Mac transcription is not yet supported.

## Getting started

Download a test package from the **Pneuma desktop packages** GitHub Actions workflow artifacts. Packages are unsigned development builds. Initial speech-model setup requires a download. Import a local Bible you have permission to use, select it in Scripture, enable Smart/AI, choose a microphone and keep auto presentation set to **Ask**. Open a detected reference to preview it, then approve presentation.

## Development

Use Node 22.12 or newer and platform native build prerequisites from [the upstream README](UPSTREAM_README.md).

```sh
npm ci
npm start
```

```sh
npm run test:unit
npm run build
npm run release:local
```

See [PNEUMA.md](PNEUMA.md) for implementation details, validation evidence, recognition-probe instructions and outstanding release gates. The original Pneuma implementation remains on the repository's main branch while this prototype is evaluated.

## Licence and attribution

Based on FreeShow by ChurchApps and contributors, under [GPL-3.0](LICENSE). This is a modified version, not an official FreeShow release. Original notices are retained. Bible texts, speech models and other third-party assets have their own terms. Test sermon recordings and transcripts are not distributed in this repository.
