use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;

/// Holds the spawned Python sidecar process so it can be terminated on exit.
pub struct SidecarProcess(pub Mutex<Option<Child>>);

impl Default for SidecarProcess {
    fn default() -> Self {
        SidecarProcess(Mutex::new(None))
    }
}

/// Absolute path to the `sidecar/` directory (sibling of `src-tauri/`).
fn sidecar_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("sidecar")
}

/// Path to the dev virtualenv Python interpreter inside `sidecar/.venv`.
fn venv_python(dir: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        dir.join(".venv").join("bin").join("python")
    }
}

/// In release builds, the PyInstaller-bundled sidecar lives alongside other
/// bundled resources. Tauri resolves `resource_dir()` at runtime.
fn bundled_sidecar_path(resource_dir: &Path) -> PathBuf {
    if cfg!(target_os = "windows") {
        resource_dir
            .join("pneuma-sidecar")
            .join("pneuma-sidecar.exe")
    } else {
        resource_dir.join("pneuma-sidecar").join("pneuma-sidecar")
    }
}

/// Spawn the Python inference sidecar.
///
/// **Debug builds** run the dev virtualenv (`sidecar/.venv`).
/// **Release builds** launch the PyInstaller-bundled binary from Tauri's
/// resource directory.
pub fn spawn_sidecar(
    embeddings_path: String,
    lance_path: String,
    onnx_model_path: String,
    engine_mode: String,
    deepgram_key: String,
    resource_dir: Option<PathBuf>,
    model_tier: String,
) -> Option<Child> {
    let model = if model_tier.is_empty() {
        "base"
    } else {
        model_tier.as_str()
    };

    let (mut cmd, is_bundled) = if cfg!(debug_assertions) {
        // --- Dev: use venv Python ---
        let dir = sidecar_dir();
        let python = venv_python(&dir);

        if !python.exists() {
            eprintln!(
                "[sidecar] Interpreter not found at {:?}. Run: \
                 python3.11 -m venv sidecar/.venv && \
                 sidecar/.venv/bin/pip install -r sidecar/requirements.txt",
                python
            );
            return None;
        }

        let mut cmd = Command::new(&python);
        cmd.args(["-m", "pneuma_sidecar", "--port", "8765", "--model", model])
            .current_dir(&dir);
        (cmd, false)
    } else {
        // --- Release: use bundled PyInstaller binary ---
        let res_dir = resource_dir.unwrap_or_else(|| {
            eprintln!("[sidecar] No resource directory available in release build.");
            PathBuf::from(".")
        });
        let sidecar_exe = bundled_sidecar_path(&res_dir);

        if !sidecar_exe.exists() {
            eprintln!("[sidecar] Bundled sidecar not found at {:?}.", sidecar_exe);
            return None;
        }

        let mut cmd = Command::new(&sidecar_exe);
        cmd.args(["--port", "8765", "--model", model]);
        (cmd, true)
    };

    // Shared argument wiring (same for dev and release).
    if !embeddings_path.is_empty() {
        cmd.args(["--embeddings-path", &embeddings_path]);
    }
    if !lance_path.is_empty() {
        cmd.args(["--lance-path", &lance_path]);
    }
    if !onnx_model_path.is_empty() {
        cmd.args(["--onnx-model-path", &onnx_model_path]);
    }
    if !engine_mode.is_empty() {
        cmd.args(["--engine", &engine_mode]);
    }
    if !deepgram_key.is_empty() {
        cmd.args(["--deepgram-key", &deepgram_key]);
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!(
                "[sidecar] Spawned {} sidecar (pid {}).",
                if is_bundled { "bundled" } else { "venv" },
                child.id()
            );
            Some(child)
        }
        Err(e) => {
            eprintln!("[sidecar] Failed to spawn sidecar: {}", e);
            None
        }
    }
}

/// Kill the sidecar process if it is running.
pub fn kill_sidecar(state: &SidecarProcess) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[sidecar] Terminated Python sidecar.");
        }
    }
}
