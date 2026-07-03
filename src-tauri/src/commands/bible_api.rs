use rusqlite::Connection;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::db;
use crate::commands::import::BOOK_NAMES;

const API_BASE: &str = "https://rest.api.bible/v1";

const API_BIBLE_KEY_RAW: &str = include_str!("../../api_bible_key.txt");

fn api_key() -> &'static str {
    API_BIBLE_KEY_RAW.trim()
}

async fn parse_api_bible_response<T: DeserializeOwned>(
    resp: reqwest::Response,
    label: &str,
) -> Result<T, String> {
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read {} response body: {}", label, e))?;

    if !status.is_success() {
        return Err(format!("API.Bible {} error {}: {}", label, status, body));
    }

    serde_json::from_str(&body).map_err(|e| {
        let preview: String = body.chars().take(400).collect();
        format!(
            "Failed to parse {} response: {}. Body preview: {}",
            label, e, preview
        )
    })
}

fn get_conn(app: &AppHandle) -> Result<Connection, String> {
    let db_path = db::get_db_path(app);
    Connection::open(db_path).map_err(|e| format!("DB open error: {}", e))
}

// --- API response structs ---

#[derive(Debug, Deserialize)]
struct BiblesResponse {
    data: Vec<BibleSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleSummary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub name_local: Option<String>,
    pub abbreviation: String,
    #[serde(default)]
    pub abbreviation_local: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub description_local: Option<String>,
    pub language: LanguageInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub name_local: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BooksResponse {
    data: Vec<BookInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookInfo {
    id: String,
    name: String,
    name_long: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChaptersResponse {
    data: Vec<ChapterInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChapterInfo {
    id: String,
    number: String,
    #[serde(default)]
    book_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VersesResponse {
    data: Vec<VerseInfo>,
}

#[derive(Debug, Deserialize)]
struct VerseResponse {
    data: VerseInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerseInfo {
    id: String,
    #[serde(default)]
    org_id: Option<String>,
    #[serde(default)]
    book_id: Option<String>,
    #[serde(default)]
    chapter_id: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reference: Option<String>,
    #[serde(default)]
    verse_count: Option<i64>,
}

// USFM book code → 1-based book index (66 books)
fn usfm_to_index(usfm: &str) -> Option<i64> {
    let codes = [
        "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
        "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
        "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
        "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
        "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
        "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM",
        "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
    ];
    for (i, code) in codes.iter().enumerate() {
        if *code == usfm {
            return Some((i + 1) as i64);
        }
    }
    None
}

fn strip_html(text: &str) -> String {
    // API.Bible returns verse content with USX/HTML tags — strip them
    let mut result = String::with_capacity(text.len());
    let mut in_tag = false;
    for ch in text.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            result.push(ch);
        }
    }
    // Collapse whitespace
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// List available Bibles from API.Bible.
#[tauri::command]
pub async fn list_available_bibles() -> Result<Vec<BibleSummary>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/bibles", API_BASE))
        .header("api-key", api_key())
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let bibles: BiblesResponse = parse_api_bible_response(resp, "bibles").await?;

    Ok(bibles.data)
}

/// Download a complete Bible translation and import all verses into the local DB.
/// Emits "bible:download-progress" events to the frontend.
#[tauri::command]
pub async fn download_bible(
    app: AppHandle,
    bible_id: String,
    translation_code: String,
    bible_name: Option<String>,
) -> Result<DownloadResult, String> {
    let client = reqwest::Client::new();

    // 1. Fetch books
    let books: Vec<BookInfo> = {
        let resp = client
            .get(format!("{}/bibles/{}/books", API_BASE, bible_id))
            .header("api-key", api_key())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch books: {}", e))?;
        let br: BooksResponse = parse_api_bible_response(resp, "books").await?;
        br.data
    };

    let total_books = books.len();
    let _ = app.emit("bible:download-progress", serde_json::json!({
        "phase": "books", "current": 0, "total": total_books, "message": format!("Found {} books", total_books)
    }));

    let mut all_verses: Vec<(i64, String, i64, i64, String)> = Vec::new();
    let mut books_completed = 0;

    for book in &books {
        let book_idx = match usfm_to_index(&book.id) {
            Some(i) => i,
            None => {
                // Skip books we can't map (e.g. apocrypha)
                books_completed += 1;
                continue;
            }
        };
        let book_name = BOOK_NAMES[(book_idx - 1) as usize].to_string();

        // 2. Fetch chapters for this book
        let chapters: Vec<ChapterInfo> = {
            let resp = client
                .get(format!("{}/bibles/{}/books/{}/chapters", API_BASE, bible_id, book.id))
                .header("api-key", api_key())
                .send()
                .await
                .map_err(|e| format!("Failed to fetch chapters for {}: {}", book.id, e))?;
            let cr: ChaptersResponse = parse_api_bible_response(resp, &format!("chapters for {}", book.id)).await?;
            cr.data
        };

        // 3. Fetch verses for each chapter
        for chapter in &chapters {
            let chapter_num: i64 = chapter.number.parse().unwrap_or(0);

            let resp = client
                .get(format!(
                    "{}/bibles/{}/chapters/{}/verses",
                    API_BASE, bible_id, chapter.id
                ))
                .header("api-key", api_key())
                .send()
                .await
                .map_err(|e| format!("Failed to fetch verses for {}: {}", chapter.id, e))?;

            let vr: VersesResponse = parse_api_bible_response(resp, &format!("verses for {}", chapter.id)).await?;

            for verse in &vr.data {
                // Verse org_id format is typically "JHN.3.16"
                let verse_num: i64 = verse
                    .org_id
                    .as_deref()
                    .and_then(|id| id.rsplit('.').next())
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                if verse_num <= 0 {
                    continue;
                }

                let resp = client
                    .get(format!("{}/bibles/{}/verses/{}", API_BASE, bible_id, verse.id))
                    .header("api-key", api_key())
                    .query(&[
                        ("content-type", "text"),
                        ("include-notes", "false"),
                        ("include-titles", "false"),
                        ("include-chapter-numbers", "false"),
                        ("include-verse-numbers", "false"),
                    ])
                    .send()
                    .await
                    .map_err(|e| format!("Failed to fetch verse {}: {}", verse.id, e))?;

                let detail: VerseResponse = parse_api_bible_response(resp, &format!("verse {}", verse.id)).await?;
                let Some(content) = detail.data.content.as_deref() else {
                    continue;
                };

                let clean_text = strip_html(content);
                if !clean_text.is_empty() {
                    all_verses.push((
                        book_idx,
                        book_name.clone(),
                        chapter_num,
                        verse_num,
                        clean_text,
                    ));
                }
            }
        }

        books_completed += 1;
        let _ = app.emit("bible:download-progress", serde_json::json!({
            "phase": "downloading",
            "current": books_completed,
            "total": total_books,
            "message": format!("Downloaded {} ({}/{})", book_name, books_completed, total_books)
        }));
    }

    // 4. Import into DB
    let _ = app.emit("bible:download-progress", serde_json::json!({
        "phase": "importing", "current": 0, "total": all_verses.len(), "message": "Importing verses into database..."
    }));

    if all_verses.is_empty() {
        return Err("No numbered verses were downloaded from API.Bible".to_string());
    }

    let conn = get_conn(&app)?;

    // Delete existing verses for this translation (re-download replaces)
    conn.execute(
        "DELETE FROM local_bible_repository WHERE translation_code = ?1",
        rusqlite::params![translation_code],
    )
    .map_err(|e| format!("Failed to clear old verses: {}", e))?;

    let count = db::import_bible_verses(&conn, &translation_code, &all_verses)
        .map_err(|e| format!("Import error: {}", e))?;

    // Insert or replace translation_metadata row so the translation appears
    // in db_get_translations and the ScriptureSearch dropdown.
    let display_name = bible_name.unwrap_or_else(|| translation_code.clone());
    conn.execute(
        "INSERT OR REPLACE INTO translation_metadata (code, name, is_default, imported_at) VALUES (?1, ?2, 0, datetime('now'))",
        rusqlite::params![translation_code, display_name],
    )
    .map_err(|e| format!("Failed to insert translation metadata: {}", e))?;

    let _ = app.emit("bible:download-progress", serde_json::json!({
        "phase": "done", "current": count, "total": count, "message": format!("Imported {} verses", count)
    }));

    Ok(DownloadResult {
        verses_imported: count,
        books_found: books_completed as i64,
        translation_code,
    })
}

#[derive(Debug, Serialize)]
pub struct DownloadResult {
    pub verses_imported: i64,
    pub books_found: i64,
    pub translation_code: String,
}

/// List translations already installed in the local DB, joined with metadata for full names.
#[tauri::command]
pub async fn get_installed_translations(app: AppHandle) -> Result<Vec<InstalledTranslation>, String> {
    let conn = get_conn(&app)?;
    let mut stmt = conn
        .prepare(
            "SELECT r.translation_code, COUNT(*) as verse_count, COALESCE(m.name, r.translation_code) as name
             FROM local_bible_repository r
             LEFT JOIN translation_metadata m ON r.translation_code = m.code
             GROUP BY r.translation_code
             ORDER BY r.translation_code",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(InstalledTranslation {
                translation_code: r.get(0)?,
                verse_count: r.get(1)?,
                name: r.get(2)?,
            })
        })
        .map_err(|e| format!("Query: {}", e))?;

    let mut result = Vec::new();
    for row in rows.filter_map(|r| r.ok()) {
        result.push(row);
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
pub struct InstalledTranslation {
    pub translation_code: String,
    pub verse_count: i64,
    pub name: String,
}

/// Delete a translation and its metadata from the local DB.
#[tauri::command]
pub async fn delete_translation(app: AppHandle, translation_code: String) -> Result<i64, String> {
    let conn = get_conn(&app)?;
    let deleted = conn.execute(
        "DELETE FROM local_bible_repository WHERE translation_code = ?1",
        rusqlite::params![translation_code],
    )
    .map_err(|e| format!("Failed to delete verses: {}", e))?;

    conn.execute(
        "DELETE FROM translation_metadata WHERE code = ?1",
        rusqlite::params![translation_code],
    )
    .map_err(|e| format!("Failed to delete metadata: {}", e))?;

    Ok(deleted as i64)
}
