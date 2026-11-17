import { whisperModelDir } from "../../setup/models/whisper"
import path from "path"
import type { SttEngineOptions } from "../../../../types/ai/AiSettings"
import { LocalModelManager } from "../../setup/LocalModelManager"
import type { TranscriberSegment } from "../sttHelper"
import { NemotronDriver, type NemotronWorkerRequest, type NemotronWorkerResponse } from "./nemotronWorker"

const WORKER_START_TIMEOUT = 30000
const WORKER_FLUSH_TIMEOUT = 3000
const WORKER_STALL_TIMEOUT = 60000
const WORKER_STALL_CHECK_INTERVAL = 5000

export class SherpaTranscriber {
    private options: SttEngineOptions
    private onSegment: (segment: TranscriberSegment) => void
    private onError: (message: string) => void
    private onInterim?: (text: string) => void

    private child: Electron.UtilityProcess | null = null
    private fallback: NemotronDriver | null = null
    private stopped = false

    private readyResolve: ((ok: boolean) => void) | null = null
    private stoppedResolve: (() => void) | null = null
    private startErrorMessage = ""

    private lastWorkerMessageAt = 0
    private stallTimer: NodeJS.Timeout | null = null
    private restarting = false
    private modelDir = ""
    private acceptingAudio = false
    private pendingBytes = 0

    constructor(private engine: "nemotron" | "whisper", options: SttEngineOptions, onSegment: (segment: TranscriberSegment) => void, onError: (message: string) => void, onInterim?: (text: string) => void) {
        this.options = options
        this.onSegment = onSegment
        this.onError = onError
        this.onInterim = onInterim
    }

    async start() {
        this.modelDir = this.engine === "whisper" ? whisperModelDir() : LocalModelManager.getModelDir("nemotron")
        if (await this.startWorker()) return true
        if (this.startErrorMessage) throw new Error(this.startErrorMessage)

        if (this.engine === "whisper") throw new Error("Could not start the Whisper Base transcription process")
        this.fallback = new NemotronDriver({
            language: this.options.language || "en",
            decodeLanguage: this.options.language,
            modelDir: this.modelDir,
            onSegment: this.onSegment,
            onInterim: this.onInterim,
            onError: this.onError
        })
        await this.fallback.start()
        return true
    }

    async stop() {
        this.stopped = true
        this.clearStallTimer()

        const { child } = this
        this.child = null

        if (child) {
            try {
                this.post(child, { type: "stop" })
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(resolve, this.engine === "whisper" ? 30000 : WORKER_FLUSH_TIMEOUT)
                    this.stoppedResolve = () => {
                        clearTimeout(timer)
                        resolve()
                    }
                })
            } catch {}
            try {
                child.kill()
            } catch {}
        }

        if (this.fallback) {
            await this.fallback.stop()
            this.fallback = null
        }
        return true
    }

    pushAudio(buffer: Uint8Array) {
        if (this.child) {
            if (this.engine === "whisper") {
                if (!this.acceptingAudio || this.stopped) return false
                this.pendingBytes += buffer.byteLength
                if (this.pendingBytes > 30 * 32000) {
                    this.acceptingAudio = false
                    this.onError("Whisper Base fell more than 30 seconds behind live audio.")
                    return false
                }
            }
            this.post(this.child, { type: "audio", data: buffer })
            return true
        }
        if (!this.fallback) return false
        this.fallback.pushAudio(buffer)
        return true
    }

    private async startWorker(): Promise<boolean> {
        let child: Electron.UtilityProcess
        try {
            const { utilityProcess } = require("electron") as typeof import("electron")
            if (!utilityProcess?.fork) return false
            child = utilityProcess.fork(path.join(__dirname, "./nemotronWorker.js"), [], { serviceName: "FreeShow AI transcription" })
        } catch (err) {
            console.error("[nemotron] Could not spawn the decode process:", err)
            return false
        }

        this.child = child
        this.pendingBytes = 0
        this.acceptingAudio = false
        this.lastWorkerMessageAt = Date.now()
        this.armStallWatchdog()

        child.on("message", (msg: NemotronWorkerResponse) => this.handleWorkerMessage(msg))
        child.on("exit", (code) => {
            if (this.child !== child) return
            this.child = null
            this.readyResolve?.(false)
            this.stoppedResolve?.()
            if (!this.stopped) this.onError(`${this.engine} transcription process exited unexpectedly (code ${code})`)
        })

        this.post(child, { type: "start", engine: this.engine, language: this.options.language || "en", decodeLanguage: this.options.language, modelDir: this.modelDir })

        const ok = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                this.readyResolve = null
                resolve(false)
            }, WORKER_START_TIMEOUT)
            this.readyResolve = (value: boolean) => {
                clearTimeout(timer)
                this.readyResolve = null
                resolve(value)
            }
        })

        if (!ok) {
            this.child = null
            try {
                child.kill()
            } catch {}
        }
        return ok
    }

    private handleWorkerMessage(message: NemotronWorkerResponse) {
        if (!message || typeof message !== "object") return
        this.lastWorkerMessageAt = Date.now()

        const handlers: Record<string, () => void> = {
            segment: () => message.type === "segment" && this.onSegment(message.segment),
            interim: () => message.type === "interim" && this.onInterim?.(message.text),
            ready: () => {
                this.acceptingAudio = true
                this.readyResolve?.(true)
            },
            consumed: () => { if (message.type === "consumed") this.pendingBytes -= message.bytes },
            stopped: () => this.stoppedResolve?.(),
            error: () => {
                if (message.type !== "error") return
                if (this.readyResolve) {
                    this.startErrorMessage = message.message
                    this.readyResolve(false)
                } else if (!this.stopped) {
                    this.onError(message.message)
                }
            }
        }

        handlers[message.type]?.()
    }

    private post(child: Electron.UtilityProcess, message: NemotronWorkerRequest) {
        try {
            child.postMessage(message)
        } catch (err) {
            console.error("[nemotron] Failed to reach the decode process:", err)
        }
    }

    private clearStallTimer() {
        if (this.stallTimer) {
            clearInterval(this.stallTimer)
            this.stallTimer = null
        }
    }

    private armStallWatchdog() {
        this.clearStallTimer()
        this.stallTimer = setInterval(() => void this.checkStall(), WORKER_STALL_CHECK_INTERVAL)
        this.stallTimer.unref?.()
    }

    private async checkStall() {
        if (this.stopped || this.restarting || !this.child) return
        if (Date.now() - this.lastWorkerMessageAt < WORKER_STALL_TIMEOUT) return

        this.restarting = true

        // likely just not speaking
        console.info(`[nemotron] Decode process went silent for ${Math.round((Date.now() - this.lastWorkerMessageAt) / 1000)}s - restarting process`)

        const { child } = this
        this.child = null
        try {
            child?.kill()
        } catch {}
        this.onInterim?.("")

        try {
            const ok = await this.startWorker()
            if (!ok && !this.stopped) this.onError(this.startErrorMessage || `${this.engine} transcription process could not be restarted`)
        } finally {
            this.restarting = false
        }
    }
}
