// electron-builder invokes this for both desktop installers. Reuse verified local copies.
const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const { execFileSync } = require("node:child_process")

const root = path.join(__dirname, "../resources/whisper-base")
const base = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-base/resolve/bb53ee204431c90d314c1cc08d28d23e5b7927cc"
const files = [
    ["base-encoder.int8.onnx", "0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11"],
    ["base-decoder.int8.onnx", "9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d"],
    ["base-tokens.txt", "b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126"],
    ["silero_vad.onnx", "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6", "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"]
]

function matches(file, digest) {
    return fs.existsSync(file) && createHash("sha256").update(fs.readFileSync(file)).digest("hex") === digest
}

module.exports = function prepareWhisper() {
    for (const [name, digest, url] of files) {
        const dest = path.join(root, name)
        if (matches(dest, digest)) continue
        const temp = dest + "." + process.pid + ".partial"
        try {
            execFileSync("curl", ["--fail", "--location", "--retry", "3", "--output", temp, url || base + "/" + name], { stdio: "inherit" })
            if (!matches(temp, digest)) throw new Error("Invalid Whisper resource checksum for " + name)
            fs.renameSync(temp, dest)
        } finally {
            fs.rmSync(temp, { force: true })
        }
    }
}

if (require.main === module) module.exports()
