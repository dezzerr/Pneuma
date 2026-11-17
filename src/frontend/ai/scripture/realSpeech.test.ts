import { describe, expect, it } from "vitest"
import { BibleSearchDetector } from "./BibleSearchDetector"
import { CHAPTER_PATTERN, ORDINAL_PREFIX_PATTERN, VERSE_PATTERN } from "./referenceDictionary"
import type { BibleCacheData } from "./BibleCacheManager"

const names = ["Genesis", "Exodus", "Leviticus", "Habakkuk", "1 Chronicles", "2 Chronicles", "Deuteronomy", "Isaiah", "Acts", "Revelation", "Romans"]
const references: [string, number, number][] = [
    ["Genesis", 5, 32],
    ["Exodus", 5, 23],
    ["Leviticus", 1, 17],
    ["Leviticus", 2, 16],
    ["Habakkuk", 1, 17],
    ["Habakkuk", 2, 20],
    ["Deuteronomy", 1, 46],
    ["Deuteronomy", 2, 37],
    ["Habakkuk", 3, 19],
    ["1 Chronicles", 1, 54],
    ["1 Chronicles", 2, 55],
    ["Deuteronomy", 5, 33],
    ["Isaiah", 3, 26],
    ["Acts", 5, 42],
    ["Revelation", 3, 22],
    ["Romans", 8, 39]
]
const data: BibleCacheData = {
    versePool: [],
    verseToIdMap: new Map(),
    referenceIndex: new Map(references.map(([name, chapter, count]) => [`${name.toLowerCase()} ${chapter}`, { bookName: name, chapterNumber: chapter, startVerseId: 0, verseCount: count }])),
    vocabPool: [],
    vocabToIdMap: new Map(),
    wordIdf: new Float32Array(),
    wordPostingsOffsets: new Uint32Array(),
    wordPostings: new Uint32Array(),
    verseTokensOffsets: new Uint32Array(),
    verseTokens: new Uint32Array(),
    bookNames: names,
    refRegex: new RegExp(`\\b((?:(?:[1-3]|${ORDINAL_PREFIX_PATTERN})\\s+)?(?:${names.map((b) => b.replace(/\s+/g, "\\s+")).join("|")}))\\b\\s*(?:${CHAPTER_PATTERN})?\\s*(\\d+)(?:[\\s,:.]+(?:${VERSE_PATTERN})?\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?)?`, "iu"),
    totalVerses: 0
}
const detector = new BibleSearchDetector(data)
describe("actual user transcript with production reference pattern", () => {
    it.each([
        ["First Chronicles chapter two verse one", "1 Chronicles 2:1"],
        ["Deutronomy chapter five verse one", "Deuteronomy 5:1"],
        ["Detronomy one verse one", "Deuteronomy 1:1"],
        ["Exodus five verse two", "Exodus 5:2"],
        ["Exodus chapter five verse two", "Exodus 5:2"],
        ["Deuteronomy chapter five verse two", "Deuteronomy 5:2"],
        ["Habakk chapter one verse one", "Habakkuk 1:1"],
        ["Habakok chapter one verse two", "Habakkuk 1:2"],
        ["Leviticus chapter two verse one", "Leviticus 2:1"],
        ["Genesis five verse three", "Genesis 5:3"],
        ["First Chronicles one verse two", "1 Chronicles 1:2"],
        ["Deunomy five verse two", "Deuteronomy 5:2"],
        ["Deutronomy five verse two", "Deuteronomy 5:2"],
        ["Isaiah three verse nine", "Isaiah 3:9"],
        ["Acts five verse two", "Acts 5:2"],
        ["Revelations three of S one", "Revelation 3:1"],
        ["Revelations three verse one", "Revelation 3:1"],
        ["Urmans eight two", "Romans 8:2"],
        ["Romans eight verse two", "Romans 8:2"],
        ["Romans chapter eight verse two", "Romans 8:2"],
        ["Abacok three verse one", "Habakkuk 3:1"],
        ["Habacock three verse one", "Habakkuk 3:1"]
    ])("detects %s", async (spoken, reference) => {
        expect(await detector.search(spoken, "")).toMatchObject({ type: "scripture", content: reference })
    })
    it("detects a follow-on verse after a full reference in the same transcript", async () => {
        expect(await detector.search("Leviticus one verse one verse two", "Leviticus 1:1")).toMatchObject({ content: "Leviticus 1:2" })
    })
    it("keeps a follow-on to a corrected book name in the approval queue", async () => {
        expect(await detector.search("Habakok one verse one verse two", "")).toMatchObject({ content: "Habakkuk 1:2", confidence: 50 })
    })
    it("does not treat a later number in ordinary speech as a follow-on verse", async () => {
        expect(await detector.search("Leviticus one verse one and we have two children", "Leviticus 1:1")).toMatchObject({ content: "Leviticus 1:1" })
    })
    it("prefers the newer explicit book reference", async () => {
        expect(await detector.search("Leviticus one verse one Acts five verse two", "Leviticus 1:1")).toMatchObject({ content: "Acts 5:2" })
    })
    it("does not auto-present verse one while the speaker is still naming the verse", async () => {
        expect(await detector.search("Genesis chapter five", "")).toBeNull()
        expect(await detector.search("Genesis chapter five verse three", "")).toMatchObject({ content: "Genesis 5:3", confidence: 98 })
    })
    it.each(["Deunomy five verse two", "Urmans eight two", "Revelations three of S one"])("requires approval for a guessed reference: %s", async (spoken) => {
        expect(await detector.search(spoken, "")).toMatchObject({ confidence: 50 })
    })
    it("rejects a chapter that does not exist", async () => {
        expect(await detector.search("Habacock five verse one", "")).toBeNull()
    })
    it("does not reuse the previous book when the spoken reference is invalid", async () => {
        expect(await detector.search("Habacock five verse one", "Genesis 5:3")).toBeNull()
    })
    it("rejects an out-of-range verse", async () => {
        expect(await detector.search("Genesis five verse ninety nine", "")).toBeNull()
    })
})
