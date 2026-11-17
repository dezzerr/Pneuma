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
        expect(match).toMatchObject({ type: "scripture", content: "Ecclesiastes 9:8", confidence: 50 })
    })
    it.each([
        ["Leviticus 5x8", "Leviticus", 5, 8],
        ["the verticals chapter 5 verse 8", "Leviticus", 5, 8],
        ["Romans 2-1", "Romans", 2, 1],
        ["have a cook, chapter 1, this one", "Habakkuk", 1, 1],
        ["Habakkuk, Chapter 1, there's one", "Habakkuk", 1, 1],
        ["have a clock chapter 1 this too", "Habakkuk", 1, 2],
        ["Habacle, chapter 1, verse 2", "Habakkuk", 1, 2],
        ["Trinomy 1 vs 2", "Deuteronomy", 1, 2],
        ["Detronomy 1 vs 2", "Deuteronomy", 1, 2],
        ["Deutronomy 1 vs 2", "Deuteronomy", 1, 2],
        ["firnicales three one", "1 Chronicles", 3, 1],
        ["habacook three two", "Habakkuk", 3, 2],
        ["malakai chapter one verse one", "Malachi", 1, 1],
        ["malakai chapter three verse ten", "Malachi", 3, 10],
        ["habakuk chapter two verse four", "Habakkuk", 2, 4],
        ["first chronicals chapter four verse ten", "1 Chronicles", 4, 10]
    ])("detects corrected reference %s for operator review", async (input, book, chapter, verse) => {
        const cache: BibleCacheData = {
            versePool: [],
            verseToIdMap: new Map(),
            referenceIndex: new Map([[`${book.toLowerCase()} ${chapter}`, { bookName: book, chapterNumber: chapter, startVerseId: 0, verseCount: 40 }]]),
            vocabPool: [],
            vocabToIdMap: new Map(),
            wordIdf: new Float32Array(),
            wordPostingsOffsets: new Uint32Array(),
            wordPostings: new Uint32Array(),
            verseTokensOffsets: new Uint32Array(),
            verseTokens: new Uint32Array(),
            bookNames: [book],
            refRegex: new RegExp(`\\b(${book})\\s*(\\d+)[:\\s]+(\\d+)`, "i"),
            totalVerses: 0
        }
        const match = await new BibleSearchDetector(cache).search(input, "")
        expect(match).toMatchObject({ type: "scripture", content: `${book} ${chapter}:${verse}`, confidence: 50 })
    })
    it.each([
        ["first corinthians one verse one", "1 Corinthians", 1, 1],
        ["ephesians three verse one", "Ephesians", 3, 1],
        ["romans three verse eight", "Romans", 3, 8],
        ["first chronicles three one", "1 Chronicles", 3, 1]
    ])("detects an unchanged transcript %s", async (input, book, chapter, verse) => {
        const cache: BibleCacheData = {
            versePool: [],
            verseToIdMap: new Map(),
            referenceIndex: new Map([[`${book.toLowerCase()} ${chapter}`, { bookName: book, chapterNumber: chapter, startVerseId: 0, verseCount: 40 }]]),
            vocabPool: [],
            vocabToIdMap: new Map(),
            wordIdf: new Float32Array(),
            wordPostingsOffsets: new Uint32Array(),
            wordPostings: new Uint32Array(),
            verseTokensOffsets: new Uint32Array(),
            verseTokens: new Uint32Array(),
            bookNames: [book],
            refRegex: new RegExp(`\\b(${book})\\s*(\\d+)[:\\s]+(\\d+)`, "i"),
            totalVerses: 0
        }
        expect(await new BibleSearchDetector(cache).search(input, "")).toMatchObject({ type: "scripture", content: `${book} ${chapter}:${verse}` })
    })
})
