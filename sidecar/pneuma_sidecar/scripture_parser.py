"""Regex-based scripture reference parser for spoken transcript text.

Detects Bible references in natural spoken English, e.g.:
  "romans chapter eight verse twenty eight"  -> Romans 8:28
  "john three sixteen"                        -> John 3:16
  "genesis 1 verses 1 through 3"              -> Genesis 1:1-3
  "first corinthians chapter thirteen verse four" -> 1 Corinthians 13:4

Returns a list of dicts matching the DetectedScripture schema used by the
frontend / Tauri event contract.
"""

from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# Book names — 66 KJV books, book_id = index + 1 (matches DB book_index)
# ---------------------------------------------------------------------------

_BOOKS: list[tuple[int, str, list[str]]] = [
    (1, "Genesis", ["genesis", "gen"]),
    (2, "Exodus", ["exodus", "exod", "exo"]),
    (3, "Leviticus", ["leviticus", "lev"]),
    (4, "Numbers", ["numbers", "num"]),
    (5, "Deuteronomy", ["deuteronomy", "deut", "duet", "deutronomy", "do you turn on me", "g tronon"]),
    (6, "Joshua", ["joshua", "josh"]),
    (7, "Judges", ["judges", "judg"]),
    (8, "Ruth", ["ruth"]),
    (9, "1 Samuel", ["first samuel", "1st samuel", "1 samuel", "first sam", "1 sam", "i samuel"]),
    (10, "2 Samuel", ["second samuel", "2nd samuel", "2 samuel", "second sam", "2 sam", "ii samuel"]),
    (11, "1 Kings", ["first kings", "1st kings", "1 kings", "i kings"]),
    (12, "2 Kings", ["second kings", "2nd kings", "2 kings", "ii kings"]),
    (13, "1 Chronicles", ["first chronicles", "1st chronicles", "1 chronicles", "first chron", "1 chron", "i chronicles"]),
    (14, "2 Chronicles", ["second chronicles", "2nd chronicles", "2 chronicles", "second chron", "2 chron", "ii chronicles"]),
    (15, "Ezra", ["ezra"]),
    (16, "Nehemiah", ["nehemiah", "neh", "nahimea", "name my", "name myer", "nehemiya"]),
    (17, "Esther", ["esther", "esth"]),
    (18, "Job", ["job"]),
    (19, "Psalms", ["psalms", "psalm", "ps"]),
    (20, "Proverbs", ["proverbs", "prov", "prov"]),
    (21, "Ecclesiastes", ["ecclesiastes", "eccles", "ecc", "ecclesiasties"]),
    (22, "Song of Solomon", ["song of solomon", "song of songs", "song solomon", "song"]),
    (23, "Isaiah", ["isaiah", "isa"]),
    (24, "Jeremiah", ["jeremiah", "jer"]),
    (25, "Lamentations", ["lamentations", "lam"]),
    (26, "Ezekiel", ["ezekiel", "ezek"]),
    (27, "Daniel", ["daniel", "dan"]),
    (28, "Hosea", ["hosea", "hos"]),
    (29, "Joel", ["joel"]),
    (30, "Amos", ["amos"]),
    (31, "Obadiah", ["obadiah", "obad", "obedeo", "oh bad dear", "oh bad deal", "or badilla", "opa dia", "or badia"]),
    (32, "Jonah", ["jonah", "jon"]),
    (33, "Micah", ["micah", "mic"]),
    (34, "Nahum", ["nahum", "nah"]),
    (35, "Habakkuk", ["habakkuk", "hab", "have a cook", "have a good fight", "have a quick chat", "have a clock", "have a good trip", "have a cook fine"]),
    (36, "Zephaniah", ["zephaniah", "zeph", "zephanieo"]),
    (37, "Haggai", ["haggai", "hag", "hey guys", "a guy won", "hugai", "hugai wah", "a guy"]),
    (38, "Zechariah", ["zechariah", "zech", "zacharia", "zachary", "the career", "the korea", "the carrillo"]),
    (39, "Malachi", ["malachi", "mal", "malak", "malakai"]),
    (40, "Matthew", ["matthew", "matt", "mat"]),
    (41, "Mark", ["mark"]),
    (42, "Luke", ["luke", "look"]),
    (43, "John", ["john"]),
    (44, "Acts", ["acts", "act"]),
    (45, "Romans", ["romans", "rom"]),
    (46, "1 Corinthians", ["first corinthians", "1st corinthians", "1 corinthians", "first cor", "1 cor", "i corinthians"]),
    (47, "2 Corinthians", ["second corinthians", "2nd corinthians", "2 corinthians", "second cor", "2 cor", "ii corinthians"]),
    (48, "Galatians", ["galatians", "gal"]),
    (49, "Ephesians", ["ephesians", "eph", "efficient", "efficiency", "efficients"]),
    (50, "Philippians", ["philippians", "phil"]),
    (51, "Colossians", ["colossians", "col"]),
    (52, "1 Thessalonians", ["first thessalonians", "1st thessalonians", "1 thessalonians", "first thess", "1 thess", "i thessalonians", "first thessalonians three", "there's a loneon's"]),
    (53, "2 Thessalonians", ["second thessalonians", "2nd thessalonians", "2 thessalonians", "second thess", "2 thess", "ii thessalonians", "second there's a loneon's", "second thessalonians three"]),
    (54, "1 Timothy", ["first timothy", "1st timothy", "1 timothy", "first tim", "1 tim", "i timothy"]),
    (55, "2 Timothy", ["second timothy", "2nd timothy", "2 timothy", "second tim", "2 tim", "ii timothy"]),
    (56, "Titus", ["titus"]),
    (57, "Philemon", ["philemon", "philem"]),
    (58, "Hebrews", ["hebrews", "heb", "he brews"]),
    (59, "James", ["james", "jas"]),
    (60, "1 Peter", ["first peter", "1st peter", "1 peter", "first pet", "1 pet", "i peter"]),
    (61, "2 Peter", ["second peter", "2nd peter", "2 peter", "second pet", "2 pet", "ii peter"]),
    (62, "1 John", ["first john", "1st john", "1 john", "i john"]),
    (63, "2 John", ["second john", "2nd john", "2 john", "ii john"]),
    (64, "3 John", ["third john", "3rd john", "3 john", "iii john"]),
    (65, "Jude", ["jude"]),
    (66, "Revelation", ["revelation", "rev", "revelations"]),
]

# Build alias -> (book_id, book_name) lookup (lowercase)
_ALIAS_MAP: dict[str, tuple[int, str]] = {}
for _bid, _bname, _aliases in _BOOKS:
    for _alias in _aliases:
        _ALIAS_MAP[_alias] = (_bid, _bname)

# Build regex alternation of aliases, longest first to avoid partial matches
_sorted_aliases = sorted(_ALIAS_MAP.keys(), key=len, reverse=True)
_BOOK_PATTERN = r"(?:" + "|".join(re.escape(a) for a in _sorted_aliases) + r")"

# ---------------------------------------------------------------------------
# Phonetic number parser — word-to-int conversion
# ---------------------------------------------------------------------------

_UNITS: dict[str, int] = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}

_TENS: dict[str, int] = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}

_ORDINALS: dict[str, int] = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
    "nineteenth": 19, "twentieth": 20, "thirtieth": 30, "fortieth": 40,
    "fiftieth": 50, "sixtieth": 60, "seventieth": 70, "eightieth": 80,
    "ninetieth": 90, "hundredth": 100,
}

# Multiplier words
_HUNDRED = "hundred"
_THOUSAND = "thousand"

# Number word pattern (matches sequences of number words, possibly hyphenated)
# Build number-word alternation sorted by length descending so that
# "sixteen" matches before "six", "seventeen" before "seven", etc.
_NUM_WORDS_ALL = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
    "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety", "first", "second", "third", "fourth", "fifth", "sixth",
    "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
    "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
    "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth",
    "eightieth", "ninetieth", "hundredth", "hundred", "thousand",
]
_NUM_WORDS_SORTED = sorted(_NUM_WORDS_ALL, key=len, reverse=True)
_NUM_WORD = r"(?:" + "|".join(_NUM_WORDS_SORTED) + r")"

# Digit pattern (with optional ordinal suffix: 8th, 2nd, 3rd, 1st)
_DIGIT = r"\d{1,4}(?:st|nd|rd|th)?"

# Combined number token: either digits or a sequence of number words
_NUM_TOKEN = rf"(?:{_DIGIT}|(?:{_NUM_WORD}(?:[\s\-]+{_NUM_WORD})*))"


def words_to_number(token: str) -> Optional[int]:
    """Convert a word-number phrase like 'twenty eight' or 'one hundred' to int.

    Also handles digit strings and ordinal words.
    """
    token = token.strip().lower()

    # Pure digit (strip ordinal suffix if present)
    if token.isdigit():
        return int(token)
    # Strip ordinal suffix from digit strings
    _digit_ordinal = re.match(r"^(\d+)(?:st|nd|rd|th)$", token)
    if _digit_ordinal:
        return int(_digit_ordinal.group(1))

    # Normalise hyphens to spaces
    token = token.replace("-", " ")
    words = token.split()

    if not words:
        return None

    total = 0
    current = 0

    for w in words:
        if w in _ORDINALS:
            current += _ORDINALS[w]
        elif w in _UNITS:
            current += _UNITS[w]
        elif w in _TENS:
            current += _TENS[w]
        elif w == _HUNDRED:
            current = (current if current else 1) * 100
        elif w == _THOUSAND:
            current = (current if current else 1) * 1000
            total += current
            current = 0
        else:
            return None

    return total + current if (total + current) > 0 else None


# ---------------------------------------------------------------------------
# Regex patterns for scripture references
# ---------------------------------------------------------------------------

# Pre-compiled patterns — each captures: book, chapter, verse_start, verse_end(optional)
# Keyword aliases for Whisper mis-transcriptions
_CHAPTER_KW = r"(?:chapter|chap|chapsify)"
_VERSE_KW = r"(?:verse|verses|vs|of us)"
_RANGE_KW = r"(?:through|to|till|until|two|2|plus)"
_DASH = r"[-\u2013\u2014]"

# 1. "<book> chapter <N> verse <N>"  (single verse)
_PATTERN_CHAPTER_VERSE = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 2. "<book> chapter <N> verses <N> through <N>"  (range)
_PATTERN_CHAPTER_VERSES_THROUGH = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+{_RANGE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 3. "<book> chapter <N> verses <N> and <N>"  (non-contiguous, treat as range)
_PATTERN_CHAPTER_VERSES_AND = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+and\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 4. "<book> <N> verses <N> through <N>"  (without "chapter" keyword)
_PATTERN_VERSES_THROUGH = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+{_RANGE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 5. "<book> chapter <N> verse <N> through <N>"  (singular "verse" with range)
_PATTERN_CHAPTER_VERSE_THROUGH = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+{_RANGE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 6. "<book> <N> verse <N> through <N>"  (singular "verse" with range, without "chapter")
_PATTERN_BOOK_NUM_VERSE_THROUGH = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+{_RANGE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 7. "<book> chapter <N> verse <N> and <N>"  (singular "verse" with "and")
_PATTERN_CHAPTER_VERSE_AND = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+and\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 8. "<book> <N> verse <N> and <N>"  (singular "verse" with "and", without "chapter")
_PATTERN_BOOK_NUM_VERSE_AND = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s+and\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 9. Hyphen/dash range: "<book> chapter <N> verse[s] <N>-<N>"
_PATTERN_VERSE_HYPHEN_CHAPTER = re.compile(
    rf"({_BOOK_PATTERN})\s+{_CHAPTER_KW}\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 10. Hyphen/dash range: "<book> <N> verse[s] <N>-<N>"  (without "chapter")
_PATTERN_VERSE_HYPHEN_NO_CHAPTER = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 11. Hyphen/dash range: "<book> <N> <N>-<N>"  (shorthand)
_PATTERN_SHORTHAND_HYPHEN = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 12. All-hyphen triple: "<book> <N>-<N>-<N>"  (chapter-verseStart-verseEnd)
_PATTERN_ALL_HYPHEN_TRIPLE = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 13. Hyphen chapter-verse: "<book> <N>-<N>"  (chapter:verse with hyphen)
_PATTERN_HYPHEN_CHAPTER_VERSE = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s*{_DASH}\s*({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 14. "<book> <N> verse <N>"  (without "chapter" keyword but with "verse")
_PATTERN_BOOK_NUM_VERSE = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+{_VERSE_KW}\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# 15. "<book> <N> <N>"  (shorthand: "John three sixteen")
_PATTERN_SHORTHAND = re.compile(
    rf"({_BOOK_PATTERN})\s+({_NUM_TOKEN})\s+({_NUM_TOKEN})",
    re.IGNORECASE,
)

# Ordered most-specific to least-specific
_PATTERNS = [
    _PATTERN_CHAPTER_VERSES_THROUGH,
    _PATTERN_CHAPTER_VERSE_THROUGH,
    _PATTERN_VERSES_THROUGH,
    _PATTERN_BOOK_NUM_VERSE_THROUGH,
    _PATTERN_CHAPTER_VERSES_AND,
    _PATTERN_CHAPTER_VERSE_AND,
    _PATTERN_BOOK_NUM_VERSE_AND,
    _PATTERN_VERSE_HYPHEN_CHAPTER,
    _PATTERN_VERSE_HYPHEN_NO_CHAPTER,
    _PATTERN_SHORTHAND_HYPHEN,
    _PATTERN_ALL_HYPHEN_TRIPLE,
    _PATTERN_HYPHEN_CHAPTER_VERSE,
    _PATTERN_CHAPTER_VERSE,
    _PATTERN_BOOK_NUM_VERSE,
    _PATTERN_SHORTHAND,
]

# ---------------------------------------------------------------------------
# Validation — basic sanity checks
# ---------------------------------------------------------------------------

_MAX_CHAPTERS: dict[int, int] = {
    # OT
    1: 50, 2: 40, 3: 27, 4: 36, 5: 34, 6: 24, 7: 21, 8: 4, 9: 31, 10: 24,
    11: 22, 12: 25, 13: 29, 14: 36, 15: 10, 16: 13, 17: 10, 18: 42, 19: 150,
    20: 31, 21: 12, 22: 8, 23: 66, 24: 52, 25: 5, 26: 48, 27: 14, 28: 14,
    29: 3, 30: 9, 31: 1, 32: 4, 33: 7, 34: 3, 35: 3, 36: 3, 37: 2, 38: 14,
    39: 4,
    # NT
    40: 28, 41: 16, 42: 24, 43: 21, 44: 28, 45: 16, 46: 16, 47: 13,
    48: 6, 49: 6, 50: 4, 51: 4, 52: 5, 53: 3, 54: 6, 55: 4, 56: 3,
    57: 1, 58: 13, 59: 5, 60: 5, 61: 3, 62: 5, 63: 1, 64: 1, 65: 1, 66: 22,
}


def _is_valid(book_id: int, chapter: int, verse_start: int, verse_end: int) -> bool:
    if chapter < 1 or verse_start < 1 or verse_end < 1:
        return False
    if verse_end < verse_start:
        return False
    max_ch = _MAX_CHAPTERS.get(book_id, 0)
    if max_ch and chapter > max_ch:
        return False
    return True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse(text: str) -> list[dict]:
    """Parse spoken scripture references from *text*.

    Returns a list of dicts matching the DetectedScripture schema:
        {"match_type": "REGEX", "book_id": int, "book_name": str,
         "chapter": int, "verse_start": int, "verse_end": int}
    """
    if not text:
        return []

    # Pre-process: strip punctuation that breaks number tokens.
    # Whisper often outputs "John 3:16" (colon), "John 3, 16" (comma),
    # or "John 3.16" (period) — replace all with spaces so the shorthand
    # pattern (book <num> <num>) can match.
    text_lower = text.lower()
    text_lower = text_lower.replace(".", " ")
    text_lower = text_lower.replace(":", " ")
    text_lower = text_lower.replace(",", " ")
    # Collapse whitespace
    text_lower = " ".join(text_lower.split())
    # Dedup consecutive repeated words and phrases (handles stuttering).
    # Iteratively remove: single-word dup ("verse 2 verse 2" -> "verse 2"),
    # then 2-word dup ("james 3 james 3" -> "james 3"), then 3-word dup.
    for _phrase_len in (1, 2, 3):
        words = text_lower.split()
        deduped: list[str] = []
        i = 0
        while i < len(words):
            chunk = words[i : i + _phrase_len]
            remaining = words[i + _phrase_len : i + _phrase_len * 2]
            # Only dedup if the chunk contains at least one alphabetic word.
            # Pure number sequences like "1 1" (chapter:verse) should not be
            # treated as stuttering.
            has_alpha = any(re.search(r"[a-z]", w) for w in chunk)
            if has_alpha and len(chunk) == _phrase_len and chunk == remaining:
                i += _phrase_len  # skip the duplicate
            else:
                deduped.append(words[i])
                i += 1
        text_lower = " ".join(deduped)
    results: list[dict] = []
    seen_spans: list[tuple[int, int]] = []

    for pattern in _PATTERNS:
        for m in pattern.finditer(text_lower):
            span = m.span()
            # Skip if this span overlaps with an already-found match
            if any(not (span[1] <= s[0] or span[0] >= s[1]) for s in seen_spans):
                continue

            book_alias = m.group(1).strip()
            chapter_tok = m.group(2).strip()
            verse_start_tok = m.group(3).strip()

            book_info = _ALIAS_MAP.get(book_alias)
            if not book_info:
                continue

            book_id, book_name = book_info
            chapter = words_to_number(chapter_tok)
            verse_start = words_to_number(verse_start_tok)

            if chapter is None or verse_start is None:
                continue

            # verse_end: group(4) for range patterns, same as verse_start for single
            if m.lastindex >= 4:
                verse_end = words_to_number(m.group(4).strip())
                if verse_end is None:
                    verse_end = verse_start
            else:
                verse_end = verse_start

            if not _is_valid(book_id, chapter, verse_start, verse_end):
                continue

            results.append({
                "match_type": "REGEX",
                "book_id": book_id,
                "book_name": book_name,
                "chapter": chapter,
                "verse_start": verse_start,
                "verse_end": verse_end,
                "score": 1.0,
            })
            seen_spans.append(span)

    return results
