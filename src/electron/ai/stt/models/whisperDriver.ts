import path from "path"
import type { DriverCallbacks, TranscriptionDriver } from "../sttHelper"

const SAMPLE_RATE = 16000

export class WhisperDriver implements TranscriptionDriver {
    private recognizer: any
    private vad: any

    constructor(private options: DriverCallbacks & { modelDir?: string }) {}

    async start() {
        const dir = this.options.modelDir
        if (!dir) throw new Error("Whisper Base model directory is missing")
        const sherpa = require("sherpa-onnx-node")
        this.recognizer = new sherpa.OfflineRecognizer({
            featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
            modelConfig: {
                whisper: {
                    encoder: path.join(dir, "base-encoder.int8.onnx"),
                    decoder: path.join(dir, "base-decoder.int8.onnx"),
                    language: "en",
                    task: "transcribe"
                },
                tokens: path.join(dir, "base-tokens.txt"),
                numThreads: 3,
                provider: "cpu"
            }
        })
        this.vad = new sherpa.Vad({
            sileroVad: { model: path.join(dir, "silero_vad.onnx"), threshold: 0.3, minSilenceDuration: 0.5, minSpeechDuration: 0.15, maxSpeechDuration: 10, windowSize: 512 },
            sampleRate: SAMPLE_RATE, numThreads: 1, provider: "cpu"
        }, 30)
    }

    pushAudio(buffer: Uint8Array) {
        const pcm = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        const samples = new Float32Array(Math.floor(buffer.byteLength / 2))
        for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768
        this.vad.acceptWaveform(samples)
        this.decodeSpeech()
    }

    async stop() {
        if (!this.vad) return
        // Include a final phrase when the operator stops before the next pause.
        this.vad.acceptWaveform(new Float32Array(SAMPLE_RATE))
        this.vad.flush()
        this.decodeSpeech()
        this.vad = null
        this.recognizer = null
    }

    private decodeSpeech() {
        while (!this.vad.isEmpty()) {
            const { samples, start } = this.vad.front(false)
            this.vad.pop()
            const stream = this.recognizer.createStream()
            stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples })
            this.recognizer.decode(stream)
            const text = this.recognizer.getResult(stream).text.trim()
            if (text) this.options.onSegment({ text, startMs: start / 16, endMs: (start + samples.length) / 16, utteranceEnd: true, language: "en" })
        }
    }
}
