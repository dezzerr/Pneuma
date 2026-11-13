import { describe, expect, it } from "vitest"
import { BibleSearchDetector } from "./BibleSearchDetector"
import type { BibleCacheData } from "./BibleCacheManager"

describe("sermon scripture detection", () => {
    it("suggests Ecclesiastes 9:8 from a recognition error observed in the sermon", async () => {
        const cache: BibleCacheData = {
            versePool: [],
            verseToIdMap: new Map(),
            referenceIndex: new Map([["ecclesiastes 9", { bookName: "Ecclesiastes", chapterNumber: 9, startVerseId: 0, verseCount: 18 }]]),
            vocabPool: [],
            vocabToIdMap: new Map(),
            wordIdf: new Float32Array(),
            wordPostingsOffsets: new Uint32Array(),
            wordPostings: new Uint32Array(),
            verseTokensOffsets: new Uint32Array(),
            verseTokens: new Uint32Array(),
            bookNames: ["Ecclesiastes"],
            refRegex: /\b(ecclesiastes)\s*(?:chapter\s*)?(\d+)(?:[\s,:.]+(?:verse\s*)?(\d+))?/iu,
            totalVerses: 0
        }
        const match = await new BibleSearchDetector(cache).search("my test is still in ecclesiastices chapter nine verse eight", "")
        expect(match).toMatchObject({ type: "scripture", content: "Ecclesiastes 9:8" })
    })
})
