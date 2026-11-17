import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import path from "node:path"
import { createInterface } from "node:readline"
import type { DriverCallbacks, TranscriberSegment, TranscriptionDriver } from "../sttHelper"

const TIMEOUT = 30_000
const MAX_PENDING_PCM = 30 * 32_000

export function whisperExecutable(dir: string) {
    return path.join(dir, "worker", "pneuma-whisper", process.platform === "win32" ? "pneuma-whisper.exe" : "pneuma-whisper")
}

type WhisperMessage =
    | { type: "ready" }
    | { type: "interim"; text: string }
    | { type: "segment"; segment: TranscriberSegment }
    | { type: "error"; message: string }

export class WhisperDriver implements TranscriptionDriver {
    private process: ChildProcessWithoutNullStreams | null = null
    private closed: Promise<void> | null = null
    private ready = false
    private stopping = false

    constructor(private options: DriverCallbacks & { modelDir: string }) {}

    async start() {
        const { modelDir } = this.options
        const child = spawn(whisperExecutable(modelDir), [path.join(modelDir, "model")], {
            windowsHide: true,
            env: { ...process.env, HF_HUB_OFFLINE: "1" }
        })
        this.process = child
        this.closed = new Promise<void>((resolve) => child.once("close", () => {
            this.process = null
            resolve()
        }))
        child.stderr.on("data", () => {}) // Decoder logs must never fill the stderr pipe.

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                fail("Faster-Whisper startup timed out.")
                child.kill()
            }, TIMEOUT)
            const fail = (message: string) => {
                clearTimeout(timeout)
                if (!this.ready) reject(new Error(message))
                else if (!this.stopping) this.options.onError(message)
            }
            child.on("error", (error) => fail(error.message))
            child.stdin.on("error", (error) => fail(error.message))
            child.once("close", (code) => {
                clearTimeout(timeout)
                const started = this.ready
                this.ready = false
                if (this.stopping) reject(new Error("Faster-Whisper stopped during startup."))
                else if (started) this.options.onError(`Faster-Whisper exited unexpectedly (code ${code}).`)
                else reject(new Error(`Faster-Whisper exited (code ${code}).`))
            })

            createInterface({ input: child.stdout }).on("line", (line) => {
                let message: WhisperMessage
                try {
                    message = JSON.parse(line)
                } catch {
                    return
                }
                if (message.type === "ready") {
                    clearTimeout(timeout)
                    this.ready = !this.stopping
                    if (this.ready) resolve()
                } else if (message.type === "error") {
                    fail(message.message)
                } else if (message.type === "interim") {
                    if (!this.stopping) this.options.onInterim?.(message.text)
                } else if (message.type === "segment" && this.ready) {
                    this.options.onSegment(message.segment)
                }
            })
        })
    }

    pushAudio(buffer: Uint8Array) {
        if (!this.ready || this.stopping || !this.process) return
        const input = this.process.stdin
        if (input.writableLength + buffer.byteLength > MAX_PENDING_PCM) {
            this.options.onError("Faster-Whisper fell more than 30 seconds behind live audio.")
            return
        }
        input.write(buffer)
    }

    async stop() {
        const child = this.process
        if (!child) return
        if (this.stopping) return this.closed ?? undefined
        this.stopping = true
        if (this.ready) child.stdin.end()
        else child.kill()
        const timeout = setTimeout(() => child.kill(), TIMEOUT)
        await this.closed
        clearTimeout(timeout)
    }
}
