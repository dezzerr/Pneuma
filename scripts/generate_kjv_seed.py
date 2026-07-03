#!/usr/bin/env python3
"""
KJV Bible Seed Data Generator for Pneuma

Fetches the King James Version Bible from an open-source public domain source
and generates a SQL dump file compatible with Pneuma's database schema.

Usage:
    python3 scripts/generate_kjv_seed.py [--output resources/seed_kjv.sql]

Sources:
    - https://github.com/thiagobodruk/bible (JSON format, public domain KJV)
    - Fallback: bible-api.com (web API)
"""

import json
import os
import re
import sys
import urllib.request

# 66 books in KJV canonical order
BOOK_NAMES = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
    "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
    "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
    "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
    "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
    "Zephaniah", "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts",
    "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
    "1 Timothy", "2 Timothy", "Titus", "Philemon",
    "Hebrews", "James", "1 Peter", "2 Peter",
    "1 John", "2 John", "3 John", "Jude", "Revelation",
]


def clean_text(text: str) -> str:
    """Strip punctuation and lowercase for search token matching."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(cleaned.split())


def escape_sql(text: str) -> str:
    """Escape single quotes for SQL string literals."""
    return text.replace("'", "''")


def fetch_kjv_json() -> list:
    """Fetch KJV Bible in JSON format from thiagobodruk/bible raw GitHub.

    JSON structure: [{"abbrev": "gen", "book": "Genesis", "chapters": [["v1", "v2", ...], ...]}, ...]
    Verses are string arrays indexed by position (0 = verse 1).
    """
    url = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json"
    print(f"Fetching KJV JSON from {url}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Pneuma/0.1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8-sig"))
        print(f"Downloaded {len(data)} books.")
        return data
    except Exception as e:
        print(f"Error fetching from GitHub: {e}")
        print("Falling back to bible-api.com (sample verses only)...")
        return fetch_kjv_fallback()


def fetch_kjv_fallback() -> list:
    """Fallback: fetch a few sample verses from bible-api.com."""
    sample_refs = [
        "John 3:16", "Romans 8:28", "Psalms 23:1", "Psalms 23:2",
        "Psalms 23:3", "Psalms 23:4", "Psalms 23:5", "Psalms 23:6",
        "Genesis 1:1", "Genesis 1:2", "Genesis 1:3",
        "Philippians 4:13", "Ephesians 2:8", "Ephesians 2:9",
        "1 Corinthians 13:4", "1 Corinthians 13:5", "1 Corinthians 13:6",
        "1 Corinthians 13:7", "1 Corinthians 13:8",
        "Hebrews 11:1", "Hebrews 11:6",
        "Proverbs 3:5", "Proverbs 3:6",
        "James 1:2", "James 1:3", "James 1:4",
        "1 Peter 5:7", "1 John 4:16",
        "John 3:17", "John 3:18",
        "Acts 16:31",
        "Romans 8:29", "Romans 8:30",
        "Ecclesiastes 3:1",
    ]

    books_map = {}
    for ref in sample_refs:
        url = f"https://bible-api.com/{urllib.parse.quote(ref)}?translation=kjv"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Pneuma/0.1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Warning: Could not fetch {ref}: {e}")
            continue

        book_name = data["verses"][0]["book_name"]
        chapter = data["verses"][0]["chapter"]
        verse = data["verses"][0]["verse"]
        text = data["verses"][0]["text"].strip()

        if book_name not in books_map:
            books_map[book_name] = {"chapters": {}}
        if chapter not in books_map[book_name]["chapters"]:
            books_map[book_name]["chapters"][chapter] = []
        books_map[book_name]["chapters"][chapter].append({
            "verse": verse,
            "text": text,
        })

    # Convert to the same format as the GitHub source (normalized)
    result = []
    for book_name in BOOK_NAMES:
        if book_name in books_map:
            chapters = []
            for ch_num in sorted(books_map[book_name]["chapters"].keys(), key=int):
                verses = books_map[book_name]["chapters"][ch_num]
                chapters.append({
                    "chapter": int(ch_num),
                    "verses": [{"verse": v["verse"], "text": v["text"]} for v in verses],
                })
            result.append({"name": book_name, "chapters": chapters})

    return result


def normalize_github_data(data: list) -> list:
    """Normalize thiagobodruk/bible JSON format to our standard format.

    Input:  [{"abbrev": "gen", "book": "Genesis", "chapters": [["v1", "v2", ...], ...]}, ...]
    Output: [{"name": "Genesis", "chapters": [{"chapter": 1, "verses": [{"verse": 1, "text": "v1"}, ...]}, ...]}, ...]
    """
    result = []
    for book in data:
        book_name = book.get("book", "Unknown")
        chapters = []
        for ch_idx, verses in enumerate(book.get("chapters", [])):
            chapter_verses = []
            for v_idx, verse_text in enumerate(verses):
                chapter_verses.append({
                    "verse": v_idx + 1,
                    "text": verse_text.strip(),
                })
            chapters.append({
                "chapter": ch_idx + 1,
                "verses": chapter_verses,
            })
        result.append({"name": book_name, "chapters": chapters})
    return result


def generate_sql(bible_data: list) -> str:
    """Generate SQL INSERT statements from the Bible JSON data."""
    lines = []
    lines.append("-- Pneuma KJV Bible Seed Data")
    lines.append("-- Generated by scripts/generate_kjv_seed.py")
    lines.append("-- Public Domain King James Version")
    lines.append("")
    lines.append("BEGIN TRANSACTION;")
    lines.append("")
    lines.append("-- Insert translation metadata")
    lines.append(
        "INSERT OR IGNORE INTO translation_metadata (code, name, is_default, imported_at) "
        "VALUES ('KJV', 'King James Version', 1, datetime('now'));"
    )
    lines.append("")
    lines.append("-- Insert verses")

    for book_idx, book in enumerate(bible_data):
        book_name = book.get("name", BOOK_NAMES[book_idx] if book_idx < len(BOOK_NAMES) else "Unknown")
        book_index = book_idx + 1  # 1-indexed per PRD schema

        for chapter in book.get("chapters", []):
            chapter_num = chapter["chapter"]
            for verse in chapter.get("verses", []):
                verse_num = verse["verse"]
                verse_text = verse["text"].strip()
                clean_tokens = clean_text(verse_text)

                lines.append(
                    f"INSERT INTO local_bible_repository "
                    f"(translation_code, book_index, book_name, chapter_number, verse_number, verse_text, clean_search_tokens) "
                    f"VALUES ('KJV', {book_index}, '{escape_sql(book_name)}', {chapter_num}, {verse_num}, "
                    f"'{escape_sql(verse_text)}', '{escape_sql(clean_tokens)}');"
                )

    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    return "\n".join(lines)


def main():
    output_path = sys.argv[sys.argv.index("--output") + 1] if "--output" in sys.argv else "resources/seed_kjv.sql"

    bible_data = fetch_kjv_json()

    if not bible_data:
        print("ERROR: Could not fetch Bible data.")
        sys.exit(1)

    # Normalize if data came from GitHub (string array format)
    first_chapters = bible_data[0].get("chapters", [])
    if first_chapters and isinstance(first_chapters[0], list) and first_chapters[0] and isinstance(first_chapters[0][0], str):
        bible_data = normalize_github_data(bible_data)

    total_verses = sum(
        len(v.get("verses", []))
        for b in bible_data
        for v in b.get("chapters", [])
    )
    print(f"Total verses to insert: {total_verses}")

    sql = generate_sql(bible_data)

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(sql)

    file_size = os.path.getsize(output_path)
    print(f"Generated SQL file: {output_path} ({file_size:,} bytes)")


if __name__ == "__main__":
    import urllib.parse
    main()
