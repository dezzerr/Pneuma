// 66 KJV books in canonical order, 1-based index.
export const BOOK_NAMES: string[] = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

// Maximum chapters per book (1-based), ported from sidecar/pneuma_sidecar/scripture_parser.py.
export const MAX_CHAPTERS: Record<number, number> = {
  // OT
  1: 50,
  2: 40,
  3: 27,
  4: 36,
  5: 34,
  6: 24,
  7: 21,
  8: 4,
  9: 31,
  10: 24,
  11: 22,
  12: 25,
  13: 29,
  14: 36,
  15: 10,
  16: 13,
  17: 10,
  18: 42,
  19: 150,
  20: 31,
  21: 12,
  22: 8,
  23: 66,
  24: 52,
  25: 5,
  26: 48,
  27: 14,
  28: 14,
  29: 3,
  30: 9,
  31: 1,
  32: 4,
  33: 7,
  34: 3,
  35: 3,
  36: 3,
  37: 2,
  38: 14,
  39: 4,
  // NT
  40: 28,
  41: 16,
  42: 24,
  43: 21,
  44: 28,
  45: 16,
  46: 16,
  47: 13,
  48: 6,
  49: 6,
  50: 4,
  51: 4,
  52: 5,
  53: 3,
  54: 6,
  55: 4,
  56: 3,
  57: 1,
  58: 13,
  59: 5,
  60: 5,
  61: 3,
  62: 5,
  63: 1,
  64: 1,
  65: 1,
  66: 22,
};

export function normalizeBookQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function filterBooks(query: string): string[] {
  const nq = normalizeBookQuery(query);
  if (!nq) return [];
  return BOOK_NAMES.filter((name) => {
    const lower = name.toLowerCase();
    return lower.startsWith(nq) || lower.replace(/\s/g, "").startsWith(nq.replace(/\s/g, ""));
  }).sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aStarts =
      aLower.startsWith(nq) || aLower.replace(/\s/g, "").startsWith(nq.replace(/\s/g, ""));
    const bStarts =
      bLower.startsWith(nq) || bLower.replace(/\s/g, "").startsWith(nq.replace(/\s/g, ""));
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return aLower.localeCompare(bLower);
  });
}

export function bookNameToIndex(name: string): number | null {
  const nq = normalizeBookQuery(name);
  // Exact match first
  const exact = BOOK_NAMES.findIndex((b) => normalizeBookQuery(b) === nq);
  if (exact >= 0) return exact + 1;
  // Prefix fallback
  const prefix = BOOK_NAMES.findIndex((b) => normalizeBookQuery(b).startsWith(nq));
  if (prefix >= 0) return prefix + 1;
  return null;
}
