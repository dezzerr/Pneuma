pub mod schema;
pub mod seed;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Connection);

pub fn get_db_path(app: &AppHandle) -> std::path::PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    if !app_dir.exists() {
        let _ = std::fs::create_dir_all(&app_dir);
    }

    app_dir.join("pneuma.db")
}

pub fn init_database(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_db_path(app);
    let conn = Connection::open(db_path)?;

    // Create tables
    schema::create_tables(&conn)?;

    // Migration: add closed_by_crash column to existing cloud_usage_sessions tables
    let has_crash_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('cloud_usage_sessions') WHERE name='closed_by_crash'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if has_crash_col == 0 {
        let _ = conn.execute(
            "ALTER TABLE cloud_usage_sessions ADD COLUMN closed_by_crash INTEGER DEFAULT 0",
            [],
        );
    }

    // Crash-safe cleanup: close any sessions left open by a previous crash
    let now_ms = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE cloud_usage_sessions
         SET ended_at_ms = started_at_ms,
             closed_by_crash = 1
         WHERE ended_at_ms IS NULL",
        [],
    )?;
    let stale_count = conn.changes();
    if stale_count > 0 {
        eprintln!(
            "[saas] Closed {} stale cloud session(s) from previous crash.",
            stale_count
        );
        conn.execute(
            "INSERT INTO audit_log (event_type, detail) VALUES (?1, ?2)",
            rusqlite::params![
                "cloud_session_crash_closed",
                format!(
                    "Closed {} stale session(s) at startup (now_ms={})",
                    stale_count, now_ms
                )
            ],
        )?;
    }

    // Check if we need to seed
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM local_bible_repository", [], |row| {
            row.get(0)
        })
        .unwrap_or(0);

    if count == 0 {
        // Prefer the full bundled KJV seed; fall back to dummy verses if missing.
        match seed::seed_bible_from_file(&conn, app) {
            Ok(true) => {}
            Ok(false) => seed::seed_dummy_data(&conn)?,
            Err(e) => {
                eprintln!("Full KJV seed failed ({}); using dummy data.", e);
                seed::seed_dummy_data(&conn)?;
            }
        }
    }

    // Store connection in app state
    app.manage(Mutex::new(DbState(conn)));

    Ok(())
}

/// Batch-insert verses into local_bible_repository for a given translation.
pub fn import_bible_verses(
    conn: &Connection,
    translation_code: &str,
    verses: &[(i64, String, i64, i64, String)],
) -> Result<i64, rusqlite::Error> {
    let tx = conn.unchecked_transaction()?;
    let mut count: i64 = 0;
    for (book_index, book_name, chapter, verse, text) in verses {
        tx.execute(
            "INSERT INTO local_bible_repository
             (translation_code, book_index, book_name, chapter_number, verse_number, verse_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                translation_code,
                book_index,
                book_name,
                chapter,
                verse,
                text
            ],
        )?;
        count += 1;
    }
    tx.commit()?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        schema::create_tables(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_tables_succeeds() {
        let conn = Connection::open_in_memory().unwrap();
        schema::create_tables(&conn).unwrap();
        // Verify key tables exist
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='local_bible_repository'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_import_bible_verses() {
        let conn = setup_db();
        let verses = vec![
            (
                1,
                "Genesis".to_string(),
                1,
                1,
                "In the beginning God created the heaven and the earth.".to_string(),
            ),
            (
                1,
                "Genesis".to_string(),
                1,
                2,
                "And the earth was without form, and void.".to_string(),
            ),
        ];
        let count = import_bible_verses(&conn, "KJV", &verses).unwrap();
        assert_eq!(count, 2);

        let db_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM local_bible_repository WHERE translation_code='KJV'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(db_count, 2);
    }

    #[test]
    fn test_import_bible_verses_multiple_translations() {
        let conn = setup_db();
        let verses_kjv = vec![(
            43,
            "John".to_string(),
            3,
            16,
            "For God so loved the world.".to_string(),
        )];
        let verses_niv = vec![(
            43,
            "John".to_string(),
            3,
            16,
            "For God so loved the world that he gave his one and only Son.".to_string(),
        )];
        import_bible_verses(&conn, "KJV", &verses_kjv).unwrap();
        import_bible_verses(&conn, "NIV", &verses_niv).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM local_bible_repository", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_import_bible_verses_empty() {
        let conn = setup_db();
        let count = import_bible_verses(&conn, "KJV", &[]).unwrap();
        assert_eq!(count, 0);
    }
}
