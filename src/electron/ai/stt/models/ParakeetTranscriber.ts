import { app } from "electron"
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import fs from "fs"
import path from "path"
import readline from "readline"
import type { TranscriberSegment } from "../sttHelper"

export function parakeetPaths() {
    const helper = app.isPackaged ? path.join(process.resourcesPath, "pneuma-parakeet", "pneuma-parakeet") : path.join(app.getAppPath(), "resources", "parakeet", "mac-arm64", "pneuma-parakeet")
    const model = path.join(app.getPath("home"), "Library", "Application Support", "Hex", "models", "parakeet-unified-en-0.6b-Q8_0.gguf")
    return { helper, model }
}

export function parakeetStatus() {
    if (process.platform !== "darwin" || process.arch !== "arm64") return { ready: false, error: "Parakeet is currently available on Apple Silicon Macs only." }
    const { helper, model } = parakeetPaths()
    if (!fs.existsSync(helper)) return { ready: false, error: "Parakeet worker is not installed in this build." }
    if (!fs.existsSync(model)) return { ready: false, error: "Hex's Parakeet model was not found. Install the local model in Hex or select Nemotron." }
    return { ready: true }
}

export class ParakeetTranscriber {
    private child: ChildProcessWithoutNullStreams | null = null
    private stopped = false
    private committed = ""
    private bufferedBytes = 0
    constructor(
        private onSegment: (segment: TranscriberSegment) => void,
        private onError: (message: string) => void,
        private onInterim: (text: string) => void
    ) {}

    async start(): Promise<void> {
        const { helper, model } = parakeetPaths()
        const child = spawn(helper, [model], { stdio: ["pipe", "pipe", "pipe"] })
        this.child = child
        child.stdin.on("error", (error) => {
            if (!this.stopped) this.onError(`Parakeet audio input failed: ${error.message}`)
        })
        let stderr = ""
        child.stderr.on("data", (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-2000)
        })
        await new Promise<void>((resolve, reject) => {
            let ready = false
            const timer = setTimeout(() => {
                child.kill()
                reject(new Error("Parakeet model startup timed out"))
            }, 60000)
            child.once("error", (error) => {
                clearTimeout(timer)
                reject(error)
            })
            child.once("exit", (code) => {
                clearTimeout(timer)
                if (!ready) reject(new Error(`Parakeet failed to start (${code}): ${stderr.slice(-300)}`))
                else if (!this.stopped) this.onError(`Parakeet stopped unexpectedly (${code}).`)
            })
            readline.createInterface({ input: child.stdout }).on("line", (line) => {
                let event: { type?: string; committed?: string; tentative?: string }
                try {
                    event = JSON.parse(line)
                } catch {
                    return
                }
                if (event.type === "ready" && !ready) {
                    ready = true
                    clearTimeout(timer)
                    resolve()
                    return
                }
                if (event.type !== "text") return
                const next = event.committed || ""
                if (next.startsWith(this.committed)) {
                    const delta = next.slice(this.committed.length)
                    if (delta.trim()) this.onSegment({ text: delta.trim(), startMs: 0, endMs: 0, glue: !/^\s/.test(delta) && this.committed.length > 0 })
                    this.committed = next
                } else if (next !== this.committed) {
                    this.onError("Parakeet revised committed text; restart transcription to avoid duplicate output.")
                    return
                }
                this.onInterim(event.tentative || "")
            })
        })
    }
    pushAudio(buffer: Uint8Array): void {
        const child = this.child
        if (!child || this.stopped || !child.stdin.writable) return
        // Bound queued audio: never let a slow worker grow memory without limit.
        if (this.bufferedBytes > 32000 * 15) {
            this.onError("Parakeet cannot keep up with audio on this computer.")
            return
        }
        this.bufferedBytes += buffer.byteLength
        child.stdin.write(Buffer.from(buffer), () => {
            this.bufferedBytes -= buffer.byteLength
        })
    }
    async stop(): Promise<void> {
        this.stopped = true
        const child = this.child
        this.child = null
        if (!child || child.exitCode !== null) return
        child.stdin.end()
        await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                child.kill()
                resolve()
            }, 5000)
            child.once("exit", () => {
                clearTimeout(timer)
                resolve()
            })
        })
    }
}
