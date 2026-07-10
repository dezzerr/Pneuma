mod commands;
mod db;

use commands::ndi::NdiState;
use commands::sidecar::SidecarProcess;
use rusqlite::Connection;
use serde::Deserialize;
use tauri::Manager;

#[derive(Debug, Deserialize, Default)]
struct SavedSettings {
    model_tier: Option<String>,
}

/// Read model_tier from the app_settings table synchronously.
/// Falls back to defaults if the DB or settings row doesn't exist yet.
fn read_saved_settings(db_path: &std::path::Path) -> String {
    let default_model = "base".to_string();
    if !db_path.exists() {
        return default_model;
    }
    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return default_model,
    };
    let row: Result<String, _> = conn.query_row(
        "SELECT settings_json FROM app_settings WHERE id = 1",
        [],
        |row| row.get(0),
    );
    match row {
        Ok(json) => {
            let parsed: SavedSettings = serde_json::from_str(&json).unwrap_or_default();
            parsed.model_tier.unwrap_or_else(|| "base".to_string())
        }
        Err(_) => default_model,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarProcess::default())
        .manage(NdiState::default())
        .setup(|app| {
            // Initialize database on startup (async — don't block webview creation).
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_database(&app_handle) {
                    eprintln!("Database initialization error: {}", e);
                }
            });

            // Spawn the Python AI sidecar (WebSocket inference server).
            // Resolve paths for semantic search (Layer 2).
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let lance_path = app_data_dir.join("lancedb");
            let lance = lance_path.to_string_lossy().to_string();

            // Dev: resources are in the repo's resources/ dir; release: bundled.
            let (emb, onnx, resource_dir) = if cfg!(debug_assertions) {
                let repo_resources = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("resources");
                let embeddings_path = repo_resources.join("bible_embeddings.parquet");
                let onnx_model_path = repo_resources.join("models").join("all-MiniLM-L6-v2");

                let emb = if embeddings_path.exists() {
                    embeddings_path.to_string_lossy().to_string()
                } else {
                    String::new()
                };
                let onnx = if onnx_model_path.exists() {
                    onnx_model_path.to_string_lossy().to_string()
                } else {
                    String::new()
                };
                (emb, onnx, None)
            } else {
                // Release: resolve from Tauri's resource directory.
                let res_dir = app
                    .path()
                    .resource_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                let embeddings_path = res_dir.join("bible_embeddings.parquet");
                let onnx_model_path = res_dir.join("models").join("all-MiniLM-L6-v2");

                let emb = if embeddings_path.exists() {
                    embeddings_path.to_string_lossy().to_string()
                } else {
                    String::new()
                };
                let onnx = if onnx_model_path.exists() {
                    onnx_model_path.to_string_lossy().to_string()
                } else {
                    String::new()
                };
                (emb, onnx, Some(res_dir))
            };

            // Engine mode (env override; SaaS backend later)
            let engine_mode =
                std::env::var("PNEUMA_ENGINE").unwrap_or_else(|_| "local".to_string());

            // Read model_tier from saved settings (DB may not be initialized yet
            // via the async path, so we open a temporary connection here).
            let db_path = db::get_db_path(app.handle());
            let model_tier = read_saved_settings(&db_path);
            // Deepgram key: use env var at startup; frontend pushes keychain key
            // to sidecar at runtime via WebSocket (avoids blocking main thread
            // with synchronous Keychain access during setup).
            let deepgram_key = std::env::var("DEEPGRAM_API_KEY").unwrap_or_default();

            if let Some(child) = commands::sidecar::spawn_sidecar(
                emb,
                lance,
                onnx,
                engine_mode,
                deepgram_key,
                resource_dir,
                model_tier,
            ) {
                let state = app.state::<SidecarProcess>();
                *state.0.lock().unwrap() = Some(child);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::create_presentation_window,
            commands::window::close_presentation_window,
            commands::db::db_init,
            commands::db::db_seed_bible,
            commands::db::db_query_verses,
            commands::db::db_get_translations,
            commands::db::db_save_settings,
            commands::db::db_load_settings,
            commands::db::db_search_by_reference,
            commands::db::db_search_text,
            commands::import::import_bible_opensong,
            commands::import::import_bible_zefania,
            commands::import::import_bible_sqlite,
            commands::ndi::ndi_start_broadcast,
            commands::ndi::ndi_stop_broadcast,
            commands::ndi::ndi_get_status,
            commands::bible_api::list_available_bibles,
            commands::bible_api::download_bible,
            commands::bible_api::get_installed_translations,
            commands::bible_api::delete_translation,
            commands::saas::saas_get_state,
            commands::saas::saas_save_account,
            commands::saas::saas_start_cloud_session,
            commands::saas::saas_pause_cloud_session,
            commands::saas::saas_stop_cloud_session,
            commands::saas::saas_open_checkout,
            commands::saas::saas_open_billing_portal,
            commands::saas::saas_is_dev_mode,
            commands::saas::saas_get_audit_log,
            commands::saas::saas_refresh_entitlements,
            commands::credentials::credential_store,
            commands::credentials::credential_load,
            commands::credentials::credential_delete,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pneuma application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                commands::sidecar::kill_sidecar(&app_handle.state::<SidecarProcess>());
                // Stop NDI broadcast if running
                app_handle.state::<NdiState>().stop();
            }
        });
}
