import { whisperExecutable } from "../../stt/models/whisperDriver"
import { app } from "electron"
import fs from "fs"
import path from "path"

export function whisperModelDir() {
    const resources = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "resources")
    return path.join(resources, "whisper-base")
}

export function whisperStatus() {
    const dir = whisperModelDir()
    const required = ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"].map((file) => path.join(dir, "model", file))
    const ready = [...required, whisperExecutable(dir)].every((file) => fs.existsSync(file))
    return ready ? { ready } : { ready, error: "The Faster-Whisper engine or model is missing from this build." }
}
