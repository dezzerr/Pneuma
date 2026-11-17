import { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => os.homedir(), getAppPath: () => process.cwd() } }))
import { ParakeetTranscriber, parakeetStatus } from "./ParakeetTranscriber"

describe.skipIf(!process.env.PNEUMA_PARAKEET_TEST_PCM)("Parakeet native streaming", () => {
    it("streams real audio from the existing local model into final segments", async () => {
        expect(parakeetStatus().ready).toBe(true)
        const pcm = readFileSync(process.env.PNEUMA_PARAKEET_TEST_PCM!)
        const output: string[] = []
        const errors: string[] = []
        const driver = new ParakeetTranscriber(
            (segment) => output.push(segment.text),
            (error) => errors.push(error),
            () => {}
        )
        const startup = driver.start()
        // Microphone capture begins before model initialization completes.
        // This must not enqueue stale audio or exhaust the bounded queue.
        for (let i = 0; i < 170; i++) driver.pushAudio(new Uint8Array(3200))
        await startup
        try {
            for (let pos = 0; pos < pcm.length; pos += 16000) {
                driver.pushAudio(pcm.subarray(pos, pos + 16000))
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        } finally {
            await driver.stop()
        }
        expect(errors).toEqual([])
        expect(output.join(" ").toLowerCase()).toContain("ecclesiastes")
    }, 90000)
})
