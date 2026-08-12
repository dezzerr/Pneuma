use tauri::{Manager, WebviewWindowBuilder};

#[tauri::command]
pub async fn create_presentation_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if presentation window already exists
    if app.get_webview_window("presentation").is_some() {
        // Focus existing window
        if let Some(window) = app.get_webview_window("presentation") {
            window
                .set_focus()
                .map_err(|e| format!("Failed to focus presentation window: {}", e))?;
        }
        return Ok(());
    }

    // Try to find a secondary monitor
    let mut presentation_window = WebviewWindowBuilder::new(
        &app,
        "presentation",
        tauri::WebviewUrl::App("presentation.html".into()),
    )
    .title("Pneuma — Presentation")
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true);

    // Try to position on secondary monitor if available
    if let Ok(monitors) = app.available_monitors() {
        if let Some(secondary) = monitors
            .iter()
            .find(|m| m.position().x != 0 || m.position().y != 0)
        {
            let pos = secondary.position();
            let size = secondary.size();
            let scale = secondary.scale_factor();
            presentation_window = presentation_window
                .position(pos.x as f64 / scale, pos.y as f64 / scale)
                .inner_size(size.width as f64 / scale, size.height as f64 / scale);
        } else {
            // No secondary monitor — windowed mode for dev
            presentation_window = presentation_window
                .inner_size(960.0, 540.0)
                .position(100.0, 100.0);
        }
    } else {
        presentation_window = presentation_window.inner_size(960.0, 540.0);
    }

    presentation_window
        .build()
        .map_err(|e| format!("Failed to create presentation window: {}", e))?;

    // If we have a secondary monitor, make it fullscreen
    if let Ok(monitors) = app.available_monitors() {
        if monitors
            .iter()
            .any(|m| m.position().x != 0 || m.position().y != 0)
        {
            if let Some(window) = app.get_webview_window("presentation") {
                let _ = window.set_fullscreen(true);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn close_presentation_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("presentation") {
        window
            .close()
            .map_err(|e| format!("Failed to close presentation window: {}", e))?;
    }
    Ok(())
}
