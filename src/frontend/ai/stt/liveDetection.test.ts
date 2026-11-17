import { beforeEach, describe, expect, it, vi } from "vitest"
import { get } from "svelte/store"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return {
        ai: writable({ enabled: true, scripture: { confidence: "ask" } }),
        sttTranscript: writable({ finalized: "", unprocessed: "" }),
        aiSmartAction: writable(null),
        aiSuggestions: writable([]),
        drawerTabsData: writable({ scripture: { activeSubTab: "local" } }),
        scriptures: writable({ local: { id: "local", name: "Local Bible" } }),
        outputs: writable({})
    }
})
vi.mock("../../components/actions/apiHelper", () => ({ startScripture: vi.fn() }))
vi.mock("../../components/helpers/array", () => ({ keysToID: () => [{ id: "local" }] }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("../scripture/BibleVersionDetector", () => ({ detectBibleVersion: vi.fn() }))
vi.mock("../scripture/BibleCacheManager", async () => {
    const { BibleSearchDetector } = await import("../scripture/BibleSearchDetector")
    const detector = new BibleSearchDetector({
        versePool: [],
        verseToIdMap: new Map(),
        referenceIndex: new Map([["exodus 5", { bookName: "Exodus", chapterNumber: 5, startVerseId: 0, verseCount: 23 }]]),
        vocabPool: [],
        vocabToIdMap: new Map(),
        wordIdf: new Float32Array(),
        wordPostingsOffsets: new Uint32Array(),
        wordPostings: new Uint32Array(),
        verseTokensOffsets: new Uint32Array(),
        verseTokens: new Uint32Array(),
        bookNames: ["Exodus"],
        refRegex: /\b(exodus)\s*(?:chapter\s*)?(\d+)(?:[\s,:.]+(?:verse\s*)?(\d+))?/iu,
        totalVerses: 0
    })
    return { BibleCacheManager: { getCache: vi.fn(async () => detector), preloadAllInBackground: vi.fn() } }
})
import { ai, aiSuggestions, sttTranscript } from "../../stores"
import { Transcript } from "./transcript"

describe("live transcript to scripture suggestions", () => {
    beforeEach(() => {
        ai.set({ enabled: true, scripture: { confidence: "ask" } })
        aiSuggestions.set([])
        sttTranscript.set({ finalized: "", unprocessed: "" })
        ;(Transcript as any).resetState()
    })
    it("continues detecting references after the first passage in the same session", async () => {
        Transcript.push({ text: "Exodus five verse two" })
        await vi.waitFor(() => expect(get(aiSuggestions)).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Exodus 5:2" })])))
        Transcript.push({ text: "Exodus five verse three" })
        await vi.waitFor(() => expect(get(aiSuggestions)).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Exodus 5:3" })])))
    })
    it("shows interim Faster-Whisper text and detects only the finalized verse", async () => {
        vi.useFakeTimers()
        try {
            ai.update((settings) => ({ ...settings, stt: { engine: "whisper" } }))
            Transcript.push({ text: "Exodus 5:2", interim: true })
            await vi.advanceTimersByTimeAsync(400)
            expect(get(sttTranscript).unprocessed).toBe("Exodus 5:2")
            expect(get(aiSuggestions)).toEqual([])
            Transcript.push({ text: "Exodus 5:3" })
            await vi.waitFor(() => expect(get(aiSuggestions).map((item) => item.content)).toEqual(["Exodus 5:3"]))
        } finally {
            vi.useRealTimers()
        }
    })
    it("keeps every complete reference in a single finalized phrase", async () => {
        Transcript.push({ text: "Exodus 5:2. Exodus 5:3." })
        await vi.waitFor(() => expect(get(aiSuggestions).map((item) => item.content)).toEqual(["Exodus 5:3", "Exodus 5:2"]))
    })
    it("keeps references when final phrases arrive before earlier searches finish", async () => {
        Transcript.push({ text: "Exodus 5:2" })
        Transcript.push({ text: "Exodus 5:3" })
        Transcript.push({ text: "Exodus 5:4" })
        await vi.waitFor(() => expect(get(aiSuggestions).map((item) => item.content)).toEqual(["Exodus 5:4", "Exodus 5:3", "Exodus 5:2"]))
    })
    it("suggests a verse after it arrives across multiple speech segments", async () => {
        Transcript.push({ text: "Exodus" })
        Transcript.push({ text: "five verse" })
        Transcript.push({ text: "two" })
        await vi.waitFor(() => expect(get(aiSuggestions)).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Exodus 5:2", scriptureTranslation: "local" })])))
    })
})
