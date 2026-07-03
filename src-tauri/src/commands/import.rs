use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::db;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub verses_imported: i64,
    pub books_found: i64,
    pub translation_code: String,
}

pub const BOOK_NAMES: [&str; 66] = [
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
];

fn book_name_to_index(name: &str) -> Option<i64> {
    let normalized = name.trim().to_lowercase();
    for (i, bn) in BOOK_NAMES.iter().enumerate() {
        if bn.to_lowercase() == normalized {
            return Some((i + 1) as i64);
        }
    }
    // Try partial matches for common variants
    for (i, bn) in BOOK_NAMES.iter().enumerate() {
        let bn_lower = bn.to_lowercase();
        if bn_lower == normalized
            || bn_lower.replace(" ", "") == normalized.replace(" ", "")
            || bn_lower.starts_with(&normalized)
        {
            return Some((i + 1) as i64);
        }
    }
    None
}

fn book_number_to_index(num: i64) -> Option<i64> {
    if (1..=66).contains(&num) {
        Some(num)
    } else {
        None
    }
}

fn get_conn(app: &AppHandle) -> Result<Connection, String> {
    let db_path = db::get_db_path(app);
    Connection::open(db_path).map_err(|e| format!("DB open error: {}", e))
}

/// Parse OpenSong XML format.
/// Structure: <bible><b n="Genesis"><c n="1"><v n="1">text</v></c></b></bible>
fn parse_opensong(path: &Path) -> Result<Vec<(i64, String, i64, i64, String)>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("File read error: {}", e))?;
    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    let mut verses = Vec::new();
    let mut current_book_idx: Option<i64> = None;
    let mut current_book_name = String::new();
    let mut current_chapter: i64 = 0;
    let mut current_verse: i64 = 0;
    let mut buf = Vec::new();
    let mut text_buf = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                match e.name().as_ref() {
                    b"b" => {
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                if a.key.as_ref() == b"n" {
                                    let name = String::from_utf8_lossy(a.value.as_ref()).to_string();
                                    current_book_name = name.clone();
                                    current_book_idx = book_name_to_index(&name);
                                }
                            }
                        }
                    }
                    b"c" => {
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                if a.key.as_ref() == b"n" {
                                    current_chapter = String::from_utf8_lossy(a.value.as_ref())
                                        .parse()
                                        .unwrap_or(0);
                                }
                            }
                        }
                    }
                    b"v" => {
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                if a.key.as_ref() == b"n" {
                                    current_verse = String::from_utf8_lossy(a.value.as_ref())
                                        .parse()
                                        .unwrap_or(0);
                                }
                            }
                        }
                        text_buf.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                text_buf.push_str(&e.unescape().map_err(|e| format!("XML unescape: {}", e))?);
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"v" {
                    if let Some(book_idx) = current_book_idx {
                        let text = text_buf.trim().to_string();
                        if !text.is_empty() {
                            verses.push((
                                book_idx,
                                current_book_name.clone(),
                                current_chapter,
                                current_verse,
                                text,
                            ));
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(verses)
}

/// Parse Zefania XML format.
/// Structure: <XMLBIBLE><BIBLEBOOK bnumber="1" bname="Genesis"><CHAPTER cnumber="1"><VERS vnumber="1">text</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>
fn parse_zefania(path: &Path) -> Result<Vec<(i64, String, i64, i64, String)>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("File read error: {}", e))?;
    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    let mut verses = Vec::new();
    let mut current_book_idx: Option<i64> = None;
    let mut current_book_name = String::new();
    let mut current_chapter: i64 = 0;
    let mut current_verse: i64 = 0;
    let mut buf = Vec::new();
    let mut text_buf = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                match e.name().as_ref() {
                    b"BIBLEBOOK" => {
                        let mut bnum: Option<i64> = None;
                        let mut bname = String::new();
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                match a.key.as_ref() {
                                    b"bnumber" => {
                                        bnum = String::from_utf8_lossy(a.value.as_ref())
                                            .parse()
                                            .ok();
                                    }
                                    b"bname" => {
                                        bname = String::from_utf8_lossy(a.value.as_ref())
                                            .to_string();
                                    }
                                    _ => {}
                                }
                            }
                        }
                        current_book_idx = if let Some(n) = bnum {
                            book_number_to_index(n)
                        } else {
                            book_name_to_index(&bname)
                        };
                        current_book_name = if bname.is_empty() {
                            current_book_idx
                                .and_then(|i| BOOK_NAMES.get((i - 1) as usize).map(|s| s.to_string()))
                                .unwrap_or_default()
                        } else {
                            bname
                        };
                    }
                    b"CHAPTER" => {
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                if a.key.as_ref() == b"cnumber" {
                                    current_chapter = String::from_utf8_lossy(a.value.as_ref())
                                        .parse()
                                        .unwrap_or(0);
                                }
                            }
                        }
                    }
                    b"VERS" => {
                        for attr in e.attributes() {
                            if let Ok(a) = attr {
                                if a.key.as_ref() == b"vnumber" {
                                    current_verse = String::from_utf8_lossy(a.value.as_ref())
                                        .parse()
                                        .unwrap_or(0);
                                }
                            }
                        }
                        text_buf.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                text_buf.push_str(&e.unescape().map_err(|e| format!("XML unescape: {}", e))?);
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"VERS" {
                    if let Some(book_idx) = current_book_idx {
                        let text = text_buf.trim().to_string();
                        if !text.is_empty() {
                            verses.push((
                                book_idx,
                                current_book_name.clone(),
                                current_chapter,
                                current_verse,
                                text,
                            ));
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(verses)
}

/// Import from a SQLite database file. Heuristically finds a table with
/// book/chapter/verse/text columns and maps them.
fn parse_sqlite(path: &Path) -> Result<Vec<(i64, String, i64, i64, String)>, String> {
    let conn = Connection::open(path).map_err(|e| format!("SQLite open error: {}", e))?;

    // Find tables
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| format!("Query tables: {}", e))?
        .query_map([], |r| r.get(0))
        .map_err(|e| format!("Query: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Try each table for verse-like columns
    for table in &tables {
        let cols: Vec<String> = conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .map_err(|e| format!("Pragma: {}", e))?
            .query_map([], |r| r.get::<_, String>(1))
            .map_err(|e| format!("Query: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let _col_lower: Vec<String> = cols.iter().map(|c| c.to_lowercase()).collect();

        // Heuristic: find book, chapter, verse, text columns
        let book_col = cols.iter().position(|c| {
            let l = c.to_lowercase();
            l.contains("book") && (l.contains("name") || l.contains("index") || l == "book")
        });
        let chapter_col = cols.iter().position(|c| {
            let l = c.to_lowercase();
            l.contains("chapter") || l == "chapter"
        });
        let verse_col = cols.iter().position(|c| {
            let l = c.to_lowercase();
            l.contains("verse") && !l.contains("text")
        });
        let text_col = cols.iter().position(|c| {
            let l = c.to_lowercase();
            l.contains("text") || l == "text" || l == "content" || l == "scripture"
        });

        if let (Some(bc), Some(cc), Some(vc), Some(tc)) = (book_col, chapter_col, verse_col, text_col) {
            // Check if book column is numeric or text
            let sample: Option<String> = conn
                .query_row(
                    &format!("SELECT {} FROM {} LIMIT 1", cols[bc], table),
                    [],
                    |r| r.get(0),
                )
                .ok();

            let is_numeric_book = sample
                .as_ref()
                .map(|s| s.parse::<i64>().is_ok())
                .unwrap_or(false);

            let query = if is_numeric_book {
                format!(
                    "SELECT {}, {}, {}, {} FROM {}",
                    cols[bc], cols[cc], cols[vc], cols[tc], table
                )
            } else {
                format!(
                    "SELECT {}, {}, {}, {} FROM {}",
                    cols[bc], cols[cc], cols[vc], cols[tc], table
                )
            };

            let mut stmt = conn.prepare(&query).map_err(|e| format!("Prepare: {}", e))?;
            let rows = stmt
                .query_map([], |r| {
                    let book_val: String = r.get(0)?;
                    let chapter: i64 = r.get(1)?;
                    let verse: i64 = r.get(2)?;
                    let text: String = r.get(3)?;
                    Ok((book_val, chapter, verse, text))
                })
                .map_err(|e| format!("Query: {}", e))?;

            let mut verses = Vec::new();
            let mut books_seen = std::collections::HashSet::new();
            for row in rows.filter_map(|r| r.ok()) {
                let (book_val, chapter, verse, text) = row;
                let (book_idx, book_name) = if is_numeric_book {
                    let idx = book_val.parse::<i64>().ok().and_then(book_number_to_index);
                    let name = idx
                        .and_then(|i| BOOK_NAMES.get((i - 1) as usize).map(|s| s.to_string()))
                        .unwrap_or(book_val);
                    (idx, name)
                } else {
                    let idx = book_name_to_index(&book_val);
                    let name = book_val;
                    (idx, name)
                };

                if let Some(idx) = book_idx {
                    books_seen.insert(idx);
                    verses.push((idx, book_name, chapter, verse, text));
                }
            }

            if !verses.is_empty() {
                return Ok(verses);
            }
        }
    }

    Err("No suitable table found with book/chapter/verse/text columns".to_string())
}

#[tauri::command]
pub async fn import_bible_opensong(
    app: AppHandle,
    path: String,
    translation_code: String,
) -> Result<ImportResult, String> {
    let path = Path::new(&path);
    let verses = parse_opensong(path)?;
    let books_found = verses
        .iter()
        .map(|v| v.0)
        .collect::<std::collections::HashSet<_>>()
        .len() as i64;

    let conn = get_conn(&app)?;
    let count = db::import_bible_verses(&conn, &translation_code, &verses)
        .map_err(|e| format!("Import error: {}", e))?;

    Ok(ImportResult {
        verses_imported: count,
        books_found,
        translation_code,
    })
}

#[tauri::command]
pub async fn import_bible_zefania(
    app: AppHandle,
    path: String,
    translation_code: String,
) -> Result<ImportResult, String> {
    let path = Path::new(&path);
    let verses = parse_zefania(path)?;
    let books_found = verses
        .iter()
        .map(|v| v.0)
        .collect::<std::collections::HashSet<_>>()
        .len() as i64;

    let conn = get_conn(&app)?;
    let count = db::import_bible_verses(&conn, &translation_code, &verses)
        .map_err(|e| format!("Import error: {}", e))?;

    Ok(ImportResult {
        verses_imported: count,
        books_found,
        translation_code,
    })
}

#[tauri::command]
pub async fn import_bible_sqlite(
    app: AppHandle,
    path: String,
    translation_code: String,
) -> Result<ImportResult, String> {
    let path = Path::new(&path);
    let verses = parse_sqlite(path)?;
    let books_found = verses
        .iter()
        .map(|v| v.0)
        .collect::<std::collections::HashSet<_>>()
        .len() as i64;

    let conn = get_conn(&app)?;
    let count = db::import_bible_verses(&conn, &translation_code, &verses)
        .map_err(|e| format!("Import error: {}", e))?;

    Ok(ImportResult {
        verses_imported: count,
        books_found,
        translation_code,
    })
}
