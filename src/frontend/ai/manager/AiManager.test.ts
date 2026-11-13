import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { get } from "svelte/store"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { ai: writable({ scripture: { confidence: "ask" } }), aiSmartAction: writable(null), aiSuggestions: writable([]), drawerTabsData: writable({}), outputs: writable({}), scriptures: writable({}) }
})
vi.mock("../../components/actions/apiHelper", () => ({ startScripture: vi.fn() }))
vi.mock("../../components/helpers/array", () => ({ keysToID: () => [] }))
vi.mock("../../components/helpers/output", () => ({ getFirstActiveOutput: () => null }))
vi.mock("../../converters/bible", () => ({ setActiveScripture: vi.fn() }))
vi.mock("../../utils/common", () => ({ newToast: vi.fn() }))
vi.mock("../llm/llmManager", () => ({ getLLMManager: () => null }))
vi.mock("../scripture/BibleCacheManager", () => ({ BibleCacheManager: {} }))
vi.mock("../scripture/BibleVersionDetector", () => ({ detectBibleVersion: vi.fn() }))
import { aiSuggestions } from "../../stores"
import { startScripture } from "../../components/actions/apiHelper"
import { AiManager } from "./AiManager"

describe("Pneuma operator-approved scripture", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
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
        expect(startScripture).toHaveBeenCalledWith({ id: "local-bible", reference: "John 3:16" })
    })
    it("does not offer an empty detection", () => {
        AiManager.newMatch({ type: "empty", content: "", confidence: 0 })
        expect(get(aiSuggestions)).toEqual([])
        expect(startScripture).not.toHaveBeenCalled()
    })
})
