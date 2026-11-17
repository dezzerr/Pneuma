import { app } from "electron"
import fs from "fs"
import path from "path"

export function whisperModelDir() {
    const resources = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "resources")
    return path.join(resources, "whisper-base")
}

export function whisperStatus() {
    if (process.platform === "darwin" && process.arch === "x64") return { ready: false, error: "This Whisper Base build requires Apple Silicon on Mac." }
    const files = ["base-encoder.int8.onnx", "base-decoder.int8.onnx", "base-tokens.txt", "silero_vad.onnx"]
    const ready = files.every((file) => fs.existsSync(path.join(whisperModelDir(), file)))
    return ready ? { ready } : { ready, error: "Whisper Base model files are missing from this build." }
}
