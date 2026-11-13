// Conservative recognition aliases, applied only immediately before an explicit
// chapter-and-verse cue. A corrected guess must always be approved by an operator.
const ALIASES: Record<string, string> = {
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
    const result = text.replace(/\b([\p{L}]+)(?=\s+(?:chapter\s+)?\d+\s+(?:(?:verse|verses)\s+)?\d+\b)/giu, (word) => {
        const replacement = ALIASES[word.toLowerCase()]
        if (!replacement || replacement.toLowerCase() === word.toLowerCase()) return word
        corrected = true
        return replacement
    })
    return { text: result, corrected }
}
