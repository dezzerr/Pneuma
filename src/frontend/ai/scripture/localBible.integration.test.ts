import { readFileSync } from "node:fs"
import { get } from "svelte/store"
import { describe, expect, it, vi } from "vitest"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { scriptures: writable({ local: { id: "local", name: "User Bible" } }), ai: writable({ enabled: true, scripture: { confidence: "ask" } }), sttTranscript: writable({ finalized: "", unprocessed: "" }), aiSmartAction: writable(null), aiSuggestions: writable([]), drawerTabsData: writable({ scripture: { activeSubTab: "local" } }), outputs: writable({}) }
})
vi.mock("../../components/drawer/bible/scripture", () => ({ loadJsonBible: vi.fn() }))
vi.mock("../../components/actions/apiHelper", () => ({ startScripture: vi.fn() }))
vi.mock("../../components/helpers/array", () => ({ keysToID: () => [{ id: "local" }] }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("./BibleVersionDetector", () => ({ detectBibleVersion: vi.fn() }))
import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { aiSuggestions, sttTranscript } from "../../stores"
import { Transcript } from "../stt/transcript"
import { BibleCacheManager } from "./BibleCacheManager"

describe.skipIf(!process.env.PNEUMA_TEST_BIBLE)("installed local Bible integration", () => {
    it("builds an index and detects actual examples, including streamed speech", async () => {
        vi.stubGlobal("window", {})
        const [, bible] = JSON.parse(readFileSync(process.env.PNEUMA_TEST_BIBLE!, "utf8"))
        vi.mocked(loadJsonBible).mockResolvedValue({ data: bible } as any)
        const detector = await BibleCacheManager.getCache("local")
        expect(detector).not.toBeNull()
        expect(detector!.findFinalReferences("Zephaniah 1 verse 1 Zechariah chapter 1 verse 1 Philippians 2 verse 1 Philemon 1 verse 2 second Thessalonians 1 verse 2 Obadiah 1 verse 1 Ezekiel 1 verse 2", "").map((match) => match.content)).toEqual([
            "Zephaniah 1:1", "Zechariah 1:1", "Philippians 2:1", "Philemon 1:2", "2 Thessalonians 1:2", "Obadiah 1:1", "Ezekiel 1:2"
        ])
        expect(detector!.findFinalReferences("Galatians 3 verse 1 Timothy 1 verse 1", "Galatians 3 verse 1")).toEqual([
            { type: "scripture", content: "1 Timothy 1:1", confidence: 50 },
            { type: "scripture", content: "2 Timothy 1:1", confidence: 50 }
        ])
        expect(await detector!.search("the verticals chapter 5 verse 8. Leviticus chapter 1 verse 2.", "")).toMatchObject({ content: "Leviticus 1:2", confidence: 98 })
        expect(await detector!.search("Genesis 1 vs 2", "")).toMatchObject({ content: "Genesis 1:2", confidence: 98 })
        expect(await detector!.search("Haba cook, chapter 5, verse 2", "")).toBeNull()
        expect(detector!.findFinalReferences("Genesis 1:2. Ecclesiastes, chapter 3, verse 1. Malachi 3 verse 10.", "").map((match) => match.content)).toEqual([
            "Genesis 1:2", "Ecclesiastes 3:1", "Malachi 3:10"
        ])
        for (const [text, reference] of [
            ["Genesis 5 Genesis 5.2", "Genesis 5:2"],
            ["Genesis 5.2 Leviticus 5x8", "Leviticus 5:8"],
            ["the verticals chapter 5 verse 8. Leviticus chapter 1 verse 2.", "Leviticus 1:2"],
            ["Romans 2-1", "Romans 2:1"],
            ["Romans chapter 2 verse 1. have a cook, chapter 1, this one.", "Habakkuk 1:1"],
            ["Habakkuk, Chapter 1, there's one. have a clock chapter 1 this too.", "Habakkuk 1:2"],
            ["Habacle, chapter 1, verse 2. Trinomy 1 vs 2", "Deuteronomy 1:2"],
            ["First Chronicles chapter two verse one", "1 Chronicles 2:1"],
            ["Exodus five verse two", "Exodus 5:2"],
            ["Deuteronomy chapter five verse two", "Deuteronomy 5:2"],
            ["Leviticus chapter two verse one", "Leviticus 2:1"]
        ]) {
            expect(await detector!.search(text, "")).toMatchObject({ content: reference })
        }
        for (const [phrase, reference] of [
            ["Deuteronomy chapter five verse two", "Deuteronomy 5:2"],
            ["Habakk chapter one verse one", "Habakkuk 1:1"],
            ["Leviticus chapter two verse one", "Leviticus 2:1"]
        ]) {
            Transcript.push({ text: phrase })
            await vi.waitFor(() => expect(get(aiSuggestions)).toEqual(expect.arrayContaining([expect.objectContaining({ content: reference })])), { timeout: 15000 })
        }
        Transcript.push({ text: "Exodus" })
        Transcript.push({ text: "five verse" })
        Transcript.push({ text: "two" })
        await vi.waitFor(() => expect(get(aiSuggestions)).toEqual(expect.arrayContaining([expect.objectContaining({ content: "Exodus 5:2" })])), { timeout: 15000 })
    }, 30000)
    it.skipIf(!process.env.PNEUMA_TEST_STREAM)(
        "continues detecting references from a recorded real streaming session",
        async () => {
            vi.stubGlobal("window", {})
            const [, bible] = JSON.parse(readFileSync(process.env.PNEUMA_TEST_BIBLE!, "utf8"))
            vi.mocked(loadJsonBible).mockResolvedValue({ data: bible } as any)
            await BibleCacheManager.getCache("local")
            aiSuggestions.set([])
            sttTranscript.set({ finalized: "", unprocessed: "" })
            ;(Transcript as any).resetState()
            let previous = ""
            for (const line of readFileSync(process.env.PNEUMA_TEST_STREAM!, "utf8").trim().split("\n")) {
                const event = JSON.parse(line)
                if (event.type !== "text") continue
                const current = event.committed || ""
                if (!current.startsWith(previous)) throw new Error("Committed transcript unexpectedly revised")
                const delta = current.slice(previous.length)
                if (delta.trim()) Transcript.push({ text: delta.trim(), glue: !/^\s/.test(delta) && previous.length > 0 })
                previous = current
                await new Promise((resolve) => setTimeout(resolve, 40))
            }
            await vi.waitFor(
                () =>
                    expect(get(aiSuggestions)).toEqual(
                        expect.arrayContaining([expect.objectContaining({ content: "Deuteronomy 5:2" }), expect.objectContaining({ content: "James 1:2" }), expect.objectContaining({ content: "Leviticus 3:5" }), expect.objectContaining({ content: "Matthew 1:2" }), expect.objectContaining({ content: "Luke 2:3" }), expect.objectContaining({ content: "Acts 1:21" }), expect.objectContaining({ content: "Genesis 1:3" }), expect.objectContaining({ content: "Exodus 5:2" })])
                    ),
                { timeout: 15000 }
            )
        },
        30000
    )
})
