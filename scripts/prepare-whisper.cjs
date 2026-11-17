// electron-builder invokes this on the platform that will run the worker.
const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const { execFileSync } = require("node:child_process")

const root = path.join(__dirname, "../resources/whisper-base")
const model = path.join(root, "model")
const base = "https://huggingface.co/Systran/faster-whisper-base/resolve/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"
const files = [
    ["config.json", "56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a"],
    ["model.bin", "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9"],
    ["tokenizer.json", "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab"],
    ["vocabulary.txt", "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913"]
]

function matches(file, digest) {
    return fs.existsSync(file) && createHash("sha256").update(fs.readFileSync(file)).digest("hex") === digest
}

module.exports = function prepareWhisper() {
    fs.mkdirSync(model, { recursive: true })
    for (const [name, digest] of files) {
        const dest = path.join(model, name)
        if (matches(dest, digest)) continue
        const temp = dest + "." + process.pid + ".partial"
        try {
            execFileSync("curl", ["--fail", "--location", "--retry", "3", "--output", temp, base + "/" + name], { stdio: "inherit" })
            if (!matches(temp, digest)) throw new Error("Invalid Whisper resource checksum for " + name)
            fs.renameSync(temp, dest)
        } finally {
            fs.rmSync(temp, { force: true })
        }
    }

    const work = path.join(__dirname, "../tmp/whisper-build")
    fs.mkdirSync(work, { recursive: true })
    const python = process.env.PNEUMA_BUILD_PYTHON || (process.platform === "win32" ? "python" : "python3")
    execFileSync(python, [
        "-m", "PyInstaller", "--onedir", "--noconfirm", "--noupx", "--name", "pneuma-whisper",
        "--specpath", work, "--workpath", work, "--distpath", path.join(root, "worker"),
        "--collect-data", "faster_whisper", "--collect-binaries", "ctranslate2",
        "--recursive-copy-metadata", "faster_whisper", "--copy-metadata", "onnxruntime",
        path.join(__dirname, "whisper", "worker.py")
    ], { stdio: "inherit", env: { ...process.env, PYINSTALLER_CONFIG_DIR: path.join(work, "cache") } })
}

if (require.main === module) module.exports()
