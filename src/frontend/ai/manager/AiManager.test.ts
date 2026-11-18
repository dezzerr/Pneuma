import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { get } from "svelte/store"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { ai: writable({ scripture: { confidence: "ask" } }), aiSmartAction: writable(null), aiSuggestions: writable([]), drawerTabsData: writable({}), outputs: writable({}), scriptures: writable({}) }
})
vi.mock("../../components/actions/apiHelper", () => ({ startScripture: vi.fn(async () => {}) }))
vi.mock("../../components/helpers/array", () => ({ keysToID: () => [] }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("../scripture/BibleCacheManager", () => ({ BibleCacheManager: {} }))
vi.mock("../scripture/BibleVersionDetector", () => ({ detectBibleVersion: vi.fn() }))
import { ai, aiSuggestions } from "../../stores"
import { startScripture } from "../../components/actions/apiHelper"
import { AiManager } from "./AiManager"

describe("Pneuma operator-approved scripture", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        ai.set({ scripture: { confidence: "ask" } })
        aiSuggestions.set([])
        AiManager.liveContent = ""
    })
    afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
    })
    it("waits for approval and preserves the detected translation when presented", () => {
        AiManager.newMatch({ type: "scripture", content: "John 3:16", confidence: 99, scriptureTranslation: "local-bible" })
        expect(startScripture).not.toHaveBeenCalled()
        const suggestion = get(aiSuggestions)[0]
        expect(suggestion.scriptureTranslation).toBe("local-bible")
        suggestion.trigger?.()
        expect(startScripture).toHaveBeenCalledWith({ id: "local-bible", reference: "John 3:16" }, expect.any(Function))
    })
    it("waits for output confirmation before advancing to the next automatic verse", async () => {
        ai.set({ scripture: { confidence: "highest" } })
        AiManager.newMatch({ type: "scripture", content: "John 3:16", confidence: 98, scriptureTranslation: "local-bible" })
        AiManager.newMatch({ type: "scripture", content: "John 3:17", confidence: 98, scriptureTranslation: "local-bible" })
        await vi.advanceTimersByTimeAsync(0)
        expect(startScripture).toHaveBeenCalledTimes(1)
        expect(get(aiSuggestions).map((item) => item.action)).toEqual(["present", "present"])
        expect(AiManager.liveContent).toBe("")

        vi.mocked(startScripture).mock.calls[0][1]?.(true)
        await vi.advanceTimersByTimeAsync(0)
        expect(startScripture).toHaveBeenCalledTimes(2)
        expect(get(aiSuggestions).map((item) => item.action)).toEqual(["present", "presented"])
        expect(AiManager.liveContent).toBe("John 3:16")

        vi.mocked(startScripture).mock.calls[1][1]?.(false)
        await vi.advanceTimersByTimeAsync(0)
        expect(get(aiSuggestions)[0].action).toBe("present")
    })

    it("offers both books for an unqualified numbered reference without auto-presenting", async () => {
        ai.set({ scripture: { confidence: "highest" } })
        for (const content of ["1 Timothy 1:1", "2 Timothy 1:1"]) AiManager.newMatch({ type: "scripture", content, confidence: 50, scriptureTranslation: "local-bible" })
        await vi.advanceTimersByTimeAsync(0)
        expect(get(aiSuggestions).map((item) => item.content)).toEqual(["2 Timothy 1:1", "1 Timothy 1:1"])
        expect(startScripture).not.toHaveBeenCalled()
    })

    it("does not offer an empty detection", () => {
        AiManager.newMatch({ type: "empty", content: "", confidence: 0 })
        expect(get(aiSuggestions)).toEqual([])
        expect(startScripture).not.toHaveBeenCalled()
    })
})
