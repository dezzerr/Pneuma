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
import { aiSuggestions } from "../../stores"
import { Transcript } from "../stt/transcript"
import { BibleCacheManager } from "./BibleCacheManager"

describe.skipIf(!process.env.PNEUMA_TEST_BIBLE)("installed local Bible integration", () => {
    it("builds an index and detects actual examples, including streamed speech", async () => {
        vi.stubGlobal("window", {})
        const [, bible] = JSON.parse(readFileSync(process.env.PNEUMA_TEST_BIBLE!, "utf8"))
        vi.mocked(loadJsonBible).mockResolvedValue({ data: bible } as any)
        const detector = await BibleCacheManager.getCache("local")
        expect(detector).not.toBeNull()
        for (const [text, reference] of [
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
})
