import { describe, expect, it } from "vitest"
import { correctSpokenBookReferences } from "./spokenBooks"
import { normalizeNumbers } from "./numbers"

describe("spoken Bible book correction", () => {
    it.each([
        ["firnicales three one", "1 Chronicles 3 1"],
        ["habacook three two", "Habakkuk 3 2"],
        ["malakai chapter one verse one", "Malachi chapter 1 verse 1"],
        ["malakai chapter three verse ten", "Malachi chapter 3 verse 10"],
        ["ecclesiastics chapter nine verse eight", "Ecclesiastes chapter 9 verse 8"],
        ["habakuk chapter two verse four", "Habakkuk chapter 2 verse 4"],
        ["first chronicals chapter four verse ten", "1 Chronicles chapter 4 verse 10"]
    ])("corrects a plausible reference: %s", (input, expected) => {
        const result = correctSpokenBookReferences(normalizeNumbers(input))
        expect(result).toEqual({ text: expected, corrected: true })
    })
    it.each(["the chronicles of our church", "malakai chapter 3", "habakuk is a name", "I saw malakai chapter 3 verse ten"])("does not change non-reference text: %s", (text) => {
        expect(correctSpokenBookReferences(text).corrected).toBe(false)
    })
})
