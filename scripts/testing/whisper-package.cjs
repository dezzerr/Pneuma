// Run with the packaged Electron binary in ELECTRON_RUN_AS_NODE mode.
// Fixture: synthesized Genesis 1:2, Exodus 5:2, Romans 8:2, mono PCM16 at 16 kHz.
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
const { gunzipSync } = require("node:zlib")
const resources = path.resolve(process.argv[2])
const { WhisperDriver } = require(path.join(resources, "app.asar/build/electron/ai/stt/models/whisperDriver"))

async function main() {
    const segments = []
    const driver = new WhisperDriver({ modelDir: path.join(resources, "whisper-base"), onSegment: segment => segments.push(segment.text) })
    await driver.start()
    const pcm = gunzipSync(fs.readFileSync(path.join(__dirname, "fixtures/whisper-scripture.pcm.gz")))
    for (let offset = 0; offset < pcm.length; offset += 6400) driver.pushAudio(pcm.subarray(offset, offset + 6400))
    await driver.stop()
    console.log("Whisper Base packaged replay:", segments)
    assert.equal(segments.length, 3)
    assert.match(segments[0], /genesis/i)
    assert.match(segments[2], /romans/i)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
