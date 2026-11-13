import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../stores", async () => {
    const { writable } = await import("svelte/store")
    return { scriptures: writable({ local: { id: "local", name: "Test Bible" } }) }
})
vi.mock("../../components/drawer/bible/scripture", () => ({ loadJsonBible: vi.fn() }))
import { loadJsonBible } from "../../components/drawer/bible/scripture"
import { get } from "svelte/store"
import { BibleCacheManager, bibleIndexStatus } from "./BibleCacheManager"

const bible = {
    name: "Test",
    metadata: {},
    books: [
        {
            name: "Exodus",
            number: 2,
            chapters: [
                {
                    number: 5,
                    verses: [
                        { number: 1, text: "First" },
                        { number: 2, text: "Second" }
                    ]
                }
            ]
        }
    ]
}

describe("Bible search cache", () => {
    beforeEach(() => {
        ;(BibleCacheManager as any).caches.clear()
        ;(BibleCacheManager as any).rawCaches.clear()
        ;(BibleCacheManager as any).cachePromises.clear()
        vi.resetAllMocks()
    })
    it("retries after a Bible is temporarily unavailable and detects the next reference", async () => {
        vi.mocked(loadJsonBible)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ data: bible } as any)
        expect(await BibleCacheManager.getCache("local")).toBeNull()
        expect(get(bibleIndexStatus).local).toBe("error")
        const detector = await BibleCacheManager.getCache("local")
        expect(get(bibleIndexStatus).local).toBe("ready")
        expect(await detector?.search("Exodus five verse two", "")).toMatchObject({ content: "Exodus 5:2" })
        expect(loadJsonBible).toHaveBeenCalledTimes(2)
    })
    it("retries after a loading error", async () => {
        vi.mocked(loadJsonBible)
            .mockRejectedValueOnce(new Error("temporary error"))
            .mockResolvedValueOnce({ data: bible } as any)
        await expect(BibleCacheManager.getCache("local")).resolves.toBeNull()
        expect(await BibleCacheManager.getCache("local")).not.toBeNull()
    })
})
