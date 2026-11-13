// Conservative recognition aliases, applied only immediately before an explicit
// chapter-and-verse cue. A corrected guess must always be approved by an operator.
const ALIASES: Record<string, string> = {
    deunomy: "Deuteronomy",
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

export function correctSpokenBookReferences(text: string): { text: string; corrected: boolean } {
    let corrected = false
    // The speech engine sometimes splits "verse" into "of S". Restrict this
    // correction to a complete reference and keep it operator-approved.
    const repaired = text.replace(/\b(revelations?)\s+(\d+)\s+of\s+s\s+(\d+)\b/giu, (_match, book, chapter, verse) => {
        corrected = true
        return `${book} ${chapter} verse ${verse}`
    })
    const result = repaired.replace(/\b([\p{L}]+)(?=\s+(?:chapter\s+)?\d+\s+(?:(?:verse|verses)\s+)?\d+\b)/giu, (word) => {
        const replacement = ALIASES[word.toLowerCase()]
        if (!replacement || replacement.toLowerCase() === word.toLowerCase()) return word
        corrected = true
        return replacement
    })
    return { text: result, corrected }
}
