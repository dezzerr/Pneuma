use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::db;

#[derive(Debug, Serialize, Deserialize)]
pub struct VerseResult {
    pub id: i64,
    pub translation_code: String,
    pub book_index: i64,
    pub book_name: String,
    pub chapter_number: i64,
    pub verse_number: i64,
    pub verse_text: String,
    pub clean_search_tokens: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationInfo {
    pub code: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub async fn db_init(app: AppHandle) -> Result<String, String> {
    db::init_database(&app).map_err(|e| e.to_string())?;
    Ok("Database initialized".to_string())
}

#[tauri::command]
pub async fn db_seed_bible(app: AppHandle) -> Result<String, String> {
    crate::db::seed::seed_bible(&app).map_err(|e| e.to_string())?;
    Ok("Bible seed data loaded".to_string())
}

#[tauri::command]
pub async fn db_query_verses(
    app: AppHandle,
    translation_code: String,
    book_index: i64,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Vec<VerseResult>, String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.0
        .prepare(
            "SELECT id, translation_code, book_index, book_name, chapter_number, verse_number, verse_text, clean_search_tokens
             FROM local_bible_repository
             WHERE translation_code = ?1 AND book_index = ?2 AND chapter_number = ?3 AND verse_number >= ?4 AND verse_number <= ?5
             ORDER BY verse_number ASC",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let verses = stmt
        .query_map(
            rusqlite::params![translation_code, book_index, chapter, verse_start, verse_end],
            |row| {
                Ok(VerseResult {
                    id: row.get(0)?,
                    translation_code: row.get(1)?,
                    book_index: row.get(2)?,
                    book_name: row.get(3)?,
                    chapter_number: row.get(4)?,
                    verse_number: row.get(5)?,
                    verse_text: row.get(6)?,
                    clean_search_tokens: row.get(7)?,
                })
            },
        )
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row mapping error: {}", e))?;

    Ok(verses)
}

#[tauri::command]
pub async fn db_get_translations(app: AppHandle) -> Result<Vec<TranslationInfo>, String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.0
        .prepare("SELECT code, name, is_default FROM translation_metadata ORDER BY is_default DESC")
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let translations = stmt
        .query_map([], |row| {
            Ok(TranslationInfo {
                code: row.get(0)?,
                name: row.get(1)?,
                is_default: row.get(2)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row mapping error: {}", e))?;

    Ok(translations)
}

#[tauri::command]
pub async fn db_save_settings(app: AppHandle, settings: String) -> Result<(), String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    conn.0.execute(
        "INSERT OR REPLACE INTO app_settings (id, settings_json) VALUES (1, ?1)",
        rusqlite::params![settings],
    )
    .map_err(|e| format!("Save settings error: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_load_settings(app: AppHandle) -> Result<Option<String>, String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let result: Result<Option<String>, rusqlite::Error> = conn.0
        .query_row(
            "SELECT settings_json FROM app_settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        });

    result.map_err(|e| format!("Load settings error: {}", e))
}

#[tauri::command]
pub async fn db_search_by_reference(
    app: AppHandle,
    translation_code: String,
    book_name: String,
    chapter: i64,
    verse_start: i64,
    verse_end: i64,
) -> Result<Vec<VerseResult>, String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    // Resolve book_name to book_index (case-insensitive, partial match)
    let book_index: i64 = conn.0
        .query_row(
            "SELECT book_index FROM local_bible_repository
             WHERE translation_code = ?1 AND book_name LIKE ?2
             LIMIT 1",
            rusqlite::params![translation_code, format!("{}%", book_name)],
            |row| row.get(0),
        )
        .map_err(|e| format!("Book '{}' not found: {}", book_name, e))?;

    let mut stmt = conn.0
        .prepare(
            "SELECT id, translation_code, book_index, book_name, chapter_number, verse_number, verse_text, clean_search_tokens
             FROM local_bible_repository
             WHERE translation_code = ?1 AND book_index = ?2 AND chapter_number = ?3 AND verse_number >= ?4 AND verse_number <= ?5
             ORDER BY verse_number ASC",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let verses = stmt
        .query_map(
            rusqlite::params![translation_code, book_index, chapter, verse_start, verse_end],
            |row| {
                Ok(VerseResult {
                    id: row.get(0)?,
                    translation_code: row.get(1)?,
                    book_index: row.get(2)?,
                    book_name: row.get(3)?,
                    chapter_number: row.get(4)?,
                    verse_number: row.get(5)?,
                    verse_text: row.get(6)?,
                    clean_search_tokens: row.get(7)?,
                })
            },
        )
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row mapping error: {}", e))?;

    Ok(verses)
}

#[tauri::command]
pub async fn db_search_text(
    app: AppHandle,
    translation_code: String,
    query: String,
    limit: i64,
) -> Result<Vec<VerseResult>, String> {
    let conn_state = app.try_state::<Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let conn = conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.0
        .prepare(
            "SELECT id, translation_code, book_index, book_name, chapter_number, verse_number, verse_text, clean_search_tokens
             FROM local_bible_repository
             WHERE translation_code = ?1 AND verse_text LIKE ?2
             ORDER BY book_index, chapter_number, verse_number
             LIMIT ?3",
        )
        .map_err(|e| format!("Query prepare error: {}", e))?;

    let pattern = format!("%{}%", query);
    let verses = stmt
        .query_map(
            rusqlite::params![translation_code, pattern, limit],
            |row| {
                Ok(VerseResult {
                    id: row.get(0)?,
                    translation_code: row.get(1)?,
                    book_index: row.get(2)?,
                    book_name: row.get(3)?,
                    chapter_number: row.get(4)?,
                    verse_number: row.get(5)?,
                    verse_text: row.get(6)?,
                    clean_search_tokens: row.get(7)?,
                })
            },
        )
        .map_err(|e| format!("Query error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row mapping error: {}", e))?;

    Ok(verses)
}
