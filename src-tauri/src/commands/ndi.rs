use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

#[cfg(feature = "ndi")]
use std::thread;

#[cfg(feature = "ndi")]
use std::time::{Duration, Instant};

#[cfg(feature = "ndi")]
use tauri::{Emitter, Manager};

/// Holds the NDI broadcast thread state.
pub struct NdiState {
    running: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl Default for NdiState {
    fn default() -> Self {
        NdiState {
            running: Arc::new(AtomicBool::new(false)),
            handle: Mutex::new(None),
        }
    }
}

impl NdiState {
    /// Signal the broadcast thread to stop and join it.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut guard) = self.handle.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }
}

/// NDI source name visible on the network (OBS / vMix NDI source list).
#[cfg(feature = "ndi")]
const NDI_SOURCE_NAME: &str = "Pneuma Presentation";

/// Window title to search for via xcap.
#[cfg(feature = "ndi")]
const PRESENTATION_WINDOW_TITLE: &str = "Pneuma — Presentation";

/// Target frame rate for the capture loop.
#[cfg(feature = "ndi")]
const TARGET_FPS: u32 = 30;

// ── Stub implementations (NDI feature not compiled in) ──────────────────────

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_start_broadcast() -> Result<(), String> {
    Err("NDI support is not compiled in. Build with: cargo build --features ndi".to_string())
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_stop_broadcast(_state: tauri::State<'_, NdiState>) -> Result<(), String> {
    Ok(())
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_get_status() -> Result<NdiStatus, String> {
    Ok(NdiStatus {
        active: false,
        error: Some("NDI not compiled in".to_string()),
    })
}

// ── Real implementation (NDI feature enabled) ───────────────────────────────

#[cfg(feature = "ndi")]
#[derive(serde::Serialize)]
pub struct NdiStatus {
    active: bool,
    error: Option<String>,
}

#[cfg(not(feature = "ndi"))]
#[derive(serde::Serialize)]
pub struct NdiStatus {
    active: bool,
    error: Option<String>,
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_get_status(state: tauri::State<'_, NdiState>) -> Result<NdiStatus, String> {
    Ok(NdiStatus {
        active: state.running.load(Ordering::SeqCst),
        error: None,
    })
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_start_broadcast(
    app: tauri::AppHandle,
    state: tauri::State<'_, NdiState>,
) -> Result<(), String> {
    // Prevent double-start
    if state.running.load(Ordering::SeqCst) {
        return Err("NDI broadcast is already running".to_string());
    }

    // Ensure presentation window exists
    if app.get_webview_window("presentation").is_none() {
        return Err("Presentation window is not open. Launch it first.".to_string());
    }

    // Set up stop flag
    let running = state.running.clone();
    running.store(true, Ordering::SeqCst);

    let app_handle = app.clone();

    // Spawn capture thread
    let handle = thread::spawn(move || {
        if let Err(e) = ndi_capture_loop(running.clone(), app_handle) {
            eprintln!("[ndi] Broadcast error: {}", e);
        }
    });

    *state.handle.lock().unwrap() = Some(handle);
    Ok(())
}

#[cfg(not(feature = "ndi"))]
#[cfg(test)]
mod tests {
    use super::*;
    use tauri::async_runtime::block_on;

    #[test]
    fn test_ndi_start_broadcast_stub_returns_error() {
        let result = block_on(ndi_start_broadcast());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not compiled in"));
    }

    #[test]
    fn test_ndi_get_status_stub() {
        let result = block_on(ndi_get_status());
        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(!status.active);
        assert!(status.error.is_some());
    }
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_stop_broadcast(state: tauri::State<'_, NdiState>) -> Result<(), String> {
    state.running.store(false, Ordering::SeqCst);

    if let Ok(mut guard) = state.handle.lock() {
        if let Some(handle) = guard.take() {
            let _ = handle.join();
        }
    }
    eprintln!("[ndi] Broadcast stopped.");
    Ok(())
}

#[cfg(feature = "ndi")]
fn ndi_capture_loop(running: Arc<AtomicBool>, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Initialize NDI runtime
    let ndi =
        grafton_ndi::NDI::new().map_err(|e| format!("Failed to initialize NDI runtime: {}", e))?;

    let version =
        grafton_ndi::NDI::version().map_err(|e| format!("Failed to get NDI version: {}", e))?;
    eprintln!("[ndi] NDI runtime version: {}", version);

    // Create NDI sender
    let send_options = grafton_ndi::SenderOptions::builder(NDI_SOURCE_NAME)
        .clock_video(true)
        .clock_audio(false)
        .build();
    let sender = grafton_ndi::Sender::new(&ndi, &send_options)
        .map_err(|e| format!("Failed to create NDI sender: {}", e))?;

    eprintln!("[ndi] Sender created: \"{}\"", NDI_SOURCE_NAME);

    // Emit started event
    let _ = app_handle.emit(
        "ndi:status",
        NdiStatus {
            active: true,
            error: None,
        },
    );

    let frame_duration = Duration::from_millis(1000 / TARGET_FPS as u64);
    let mut last_size: (u32, u32) = (0, 0);
    let mut frame: Option<grafton_ndi::VideoFrame> = None;
    let mut consecutive_errors = 0u32;
    const MAX_CONSECUTIVE_ERRORS: u32 = 30;

    while running.load(Ordering::SeqCst) {
        let frame_start = Instant::now();

        // Find the presentation window by title
        let windows = match xcap::Window::all() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[ndi] Failed to enumerate windows: {}", e);
                consecutive_errors += 1;
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    let _ = app_handle.emit(
                        "ndi:status",
                        NdiStatus {
                            active: false,
                            error: Some(format!("Window enumeration failed: {}", e)),
                        },
                    );
                    running.store(false, Ordering::SeqCst);
                    break;
                }
                thread::sleep(frame_duration);
                continue;
            }
        };

        let window = windows.iter().find(|w| {
            w.title()
                .map(|t| t == PRESENTATION_WINDOW_TITLE)
                .unwrap_or(false)
        });

        let window = match window {
            Some(w) => w,
            None => {
                eprintln!("[ndi] Presentation window not found — stopping broadcast.");
                let _ = app_handle.emit(
                    "ndi:status",
                    NdiStatus {
                        active: false,
                        error: Some("Presentation window was closed".to_string()),
                    },
                );
                running.store(false, Ordering::SeqCst);
                break;
            }
        };

        // Capture window pixels
        let image = match window.capture_image() {
            Ok(img) => img,
            Err(e) => {
                eprintln!("[ndi] Capture failed: {}", e);
                consecutive_errors += 1;
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    let _ = app_handle.emit(
                        "ndi:status",
                        NdiStatus {
                            active: false,
                            error: Some(format!("Window capture failed: {}", e)),
                        },
                    );
                    running.store(false, Ordering::SeqCst);
                    break;
                }
                thread::sleep(frame_duration);
                continue;
            }
        };
        consecutive_errors = 0;

        let (width, height) = (image.width(), image.height());

        // Rebuild the NDI video frame if dimensions changed
        if (width, height) != last_size || frame.is_none() {
            frame = Some(
                grafton_ndi::VideoFrame::builder()
                    .resolution(width, height)
                    .pixel_format(grafton_ndi::PixelFormat::RGBA)
                    .frame_rate(TARGET_FPS, 1)
                    .build()
                    .map_err(|e| format!("Failed to build NDI video frame: {}", e))?,
            );
            last_size = (width, height);
            eprintln!("[ndi] Frame size: {}x{}", width, height);
        }

        // Copy captured RGBA pixels into the NDI frame buffer and send
        if let Some(ref mut f) = frame {
            let src = image.as_raw();
            let dst = f.data_mut();
            if dst.len() >= src.len() {
                dst[..src.len()].copy_from_slice(src);
            }
            sender.send_video(f);
        }

        // Pace to target frame rate
        let elapsed = frame_start.elapsed();
        if elapsed < frame_duration {
            thread::sleep(frame_duration - elapsed);
        }
    }

    // Emit stopped event
    let _ = app_handle.emit(
        "ndi:status",
        NdiStatus {
            active: false,
            error: None,
        },
    );

    Ok(())
}
