// Run after npm run build. Input: signed 16-bit LE mono PCM, 16 kHz.
// This probe uses the application's actual local speech driver, without a hosted API.
const fs = require('node:fs')
const path = require('node:path')
const { NemotronDriver } = require('../build/electron/ai/stt/models/nemotronWorker')
async function main() {
    const [audioPath, modelDir, resultPath] = process.argv.slice(2)
    if (!audioPath || !modelDir || !resultPath) throw new Error('Usage: node scripts/pneuma-recognition-probe.cjs audio.pcm model-directory result.json')
    const pcm = fs.readFileSync(audioPath)
    if (!pcm.length || pcm.length % 2) throw new Error('Input must be nonempty Int16 PCM')
    const segments = []
    const failures = []
    const driver = new NemotronDriver({ modelDir: path.resolve(modelDir), language: 'en', decodeLanguage: 'en', onSegment: segment => segments.push(segment), onError: error => failures.push(error) })
    const started = performance.now()
    await driver.start()
    try {
        for (let offset = 0; offset < pcm.length; offset += 3200) driver.pushAudio(pcm.subarray(offset, offset + 3200))
    } finally { await driver.stop() }
    const result = { audioSeconds: pcm.length / 32000, processingSeconds: (performance.now() - started) / 1000, segments, failures }
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ audioSeconds: result.audioSeconds, processingSeconds: result.processingSeconds, segments: segments.length, failures }))
    if (failures.length || !segments.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
