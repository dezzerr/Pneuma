use rusqlite::Connection;

pub fn create_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Main Bible repository table (per PRD schema)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS local_bible_repository (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            translation_code TEXT NOT NULL,
            book_index INTEGER NOT NULL,
            book_name TEXT NOT NULL,
            chapter_number INTEGER NOT NULL,
            verse_number INTEGER NOT NULL,
            verse_text TEXT NOT NULL,
            clean_search_tokens TEXT
        )",
        [],
    )?;

    // Index for fast verse lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_bible_lookup ON local_bible_repository (translation_code, book_index, chapter_number, verse_number)",
        [],
    )?;

    // Translation metadata table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS translation_metadata (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT
        )",
        [],
    )?;

    // App settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            settings_json TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS saas_account_state (
            id INTEGER PRIMARY KEY DEFAULT 1,
            state_json TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS cloud_usage_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at_ms INTEGER NOT NULL,
            ended_at_ms INTEGER,
            timezone TEXT NOT NULL,
            week_start_local TEXT NOT NULL,
            week_end_local TEXT NOT NULL,
            plan_snapshot TEXT NOT NULL,
            closed_by_crash INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cloud_usage_bucket ON cloud_usage_sessions (week_start_local, week_end_local, ended_at_ms)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            detail TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(())
}
