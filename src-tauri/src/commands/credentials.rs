use keyring::Entry;

const SERVICE_NAME: &str = "pneuma.app";

#[tauri::command]
pub async fn credential_store(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring entry creation error: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("Keyring store error: {}", e))
}

#[tauri::command]
pub async fn credential_load(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring entry creation error: {}", e))?;
    match entry.get_password() {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keyring load error: {}", e)),
    }
}

#[tauri::command]
pub async fn credential_delete(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring entry creation error: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keyring delete error: {}", e)),
    }
}

/// Synchronous helper for use in setup() before async runtime is fully available.
pub fn load_credential_sync(key: &str) -> Option<String> {
    let entry = Entry::new(SERVICE_NAME, key).ok()?;
    entry.get_password().ok()
}
