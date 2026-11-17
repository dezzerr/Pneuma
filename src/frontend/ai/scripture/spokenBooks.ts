// Conservative recognition aliases, applied only immediately before an explicit
// chapter-and-verse cue. A corrected guess must always be approved by an operator.
const ALIASES: Record<string, string> = {
    trinomy: "Deuteronomy",
    habacle: "Habakkuk",
    "the verticals": "Leviticus",
    "have a cook": "Habakkuk",
    "have a clock": "Habakkuk",
    "echols yest": "Ecclesiastes",
    deunomy: "Deuteronomy",
    detronomy: "Deuteronomy",
    deutronomy: "Deuteronomy",
    urmans: "Romans",
    abacok: "Habakkuk",
    habacock: "Habakkuk",
    revelations: "Revelation",
    firnicales: "1 Chronicles",
    malakai: "Malachi",
    malaki: "Malachi",
    malachai: "Malachi",
    malachy: "Malachi",
    ecclesiastices: "Ecclesiastes",
    eclesiase: "Ecclesiastes",
    ecclesiasis: "Ecclesiastes",
    ecclesiastic: "Ecclesiastes",
    ecclesiastics: "Ecclesiastes",
    ecclesiastes: "Ecclesiastes",
    habakk: "Habakkuk",
    habakok: "Habakkuk",
    habakuk: "Habakkuk",
    habakkuk: "Habakkuk",
    habacook: "Habakkuk",
    habacuc: "Habakkuk",
    habakook: "Habakkuk",
    habakkook: "Habakkuk",
    chronicle: "Chronicles",
    cronicles: "Chronicles",
    cronicals: "Chronicles",
    chronicals: "Chronicles",
    chronicles: "Chronicles"
}

const aliasPattern = Object.keys(ALIASES).join("|")

export function correctSpokenBookReferences(text: string, books: string[] = []): { text: string; corrected: boolean } {
    let corrected = false
    // The speech engine sometimes splits "verse" into "of S". Restrict this
    // correction to a complete reference and keep it operator-approved.
    const repaired = text.replace(/\b(revelations?)\s+(\d+)\s+of\s+s\s+(\d+)\b/giu, (_match, book, chapter, verse) => {
        corrected = true
        return `${book} ${chapter} verse ${verse}`
    })
    // Require both numbers before interpreting punctuation or a phrase like
    // "this one" as a verse cue. Keep the literal transcript for the operator.
    const knownBooks = new Set(books.map((book) => book.toLowerCase().replace(/^[1-3]\s+/, "")))
    const cue = /\b([\p{L}]+|the verticals|have a cook|have a clock|echols yest),?\s+(?:(chapter)\s+)?(\d+)(?:\s*(x|-)\s*|[,\s]+(vs\.?|this|there['’]s|verse|verses)\s+)(\d+|too)\b/giu
    const formatted = repaired.replace(cue, (match, book: string, chapterWord, chapter, symbol, cueWord, last) => {
        const key = book.toLowerCase()
        if (!knownBooks.has(key) && !ALIASES[key]) return match
        if (symbol === "-" && Number(last) >= Number(chapter)) return match // also a possible chapter range
        if ((cueWord === "this" || cueWord?.startsWith("there") || last === "too") && !chapterWord) return match
        const verse = last === "too" ? "2" : last
        const replacement = ALIASES[key] || book
        if (replacement.toLowerCase() === key && cueWord === "verse" && !match.includes(",")) return match
        corrected = true
        return replacement + (chapterWord ? " chapter " : " ") + chapter + " verse " + verse
    })
    const aliasBeforeNumbers = new RegExp(`\\b(${aliasPattern})(?=\\s+(?:chapter\\s+)?\\d+\\s+(?:(?:verse|verses)\\s+)?\\d+\\b)`, "giu")
    const result = formatted.replace(aliasBeforeNumbers, (word) => {
        const replacement = ALIASES[word.toLowerCase()]
        if (replacement.toLowerCase() === word.toLowerCase()) return word
        corrected = true
        return replacement
    })
    return { text: result, corrected }
}
