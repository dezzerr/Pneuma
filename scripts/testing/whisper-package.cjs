// Run with the packaged Electron binary in ELECTRON_RUN_AS_NODE mode.
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
const { gunzipSync } = require("node:zlib")
const { setTimeout: delay } = require("node:timers/promises")
const resources = path.resolve(process.argv[2])
const { WhisperDriver } = require(path.join(resources, "app.asar/build/electron/ai/stt/models/whisperDriver"))

async function replay(fixture, references) {
    const segments = []
    const failures = []
    const driver = new WhisperDriver({
        modelDir: path.join(resources, "whisper-base"),
        onSegment: segment => segments.push(segment.text),
        onError: message => failures.push(message)
    })
    await driver.start()
    try {
        const pcm = gunzipSync(fs.readFileSync(path.join(__dirname, "fixtures", fixture)))
        const started = performance.now()
        for (let offset = 0; offset < pcm.length; offset += 3200) {
            const waitMs = offset / 32 - (performance.now() - started)
            if (waitMs > 0) await delay(waitMs)
            driver.pushAudio(pcm.subarray(offset, offset + 3200))
        }
    } finally {
        await driver.stop()
    }
    console.log("Packaged Faster-Whisper replay:", segments)
    assert.deepEqual(failures, [])
    assert.equal(segments.length, references.length)
    references.forEach((ref, index) => assert.match(segments[index], ref))
}

async function main() {
    await replay("whisper-scripture.pcm.gz", [
        /genesis (?:chapter )?1\D+2\b/i,
        /exodus (?:chapter )?5\D+2\b/i,
        /romans (?:chapter )?8\D+2\b/i
    ])
    await replay("whisper-book-names.pcm.gz", [
        /deuteronomy (?:chapter )?5\D+2\b/i,
        /habakkuk (?:chapter )?1\D+1\b/i,
        /(?:first|1) chronicles (?:chapter )?2\D+1\b/i,
        /ecclesiastes (?:chapter )?3\D+1\b/i,
        /malachi (?:chapter )?3\D+10\b/i
    ])
}

main().catch(error => { console.error(error); process.exitCode = 1 })
