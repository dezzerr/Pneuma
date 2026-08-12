use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// Holds the spawned Python sidecar process so it can be terminated on exit.
pub struct SidecarProcess(pub Mutex<Option<Child>>);

pub struct SidecarConfig {
    pub embeddings_path: String,
    pub lance_path: String,
    pub onnx_model_path: String,
    pub engine_mode: String,
    pub deepgram_key: String,
    pub resource_dir: Option<PathBuf>,
    pub model_tier: String,
    pub whisper_model_path: String,
    pub log_path: PathBuf,
}

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
pub fn spawn_sidecar(config: SidecarConfig) -> Option<Child> {
    let SidecarConfig {
        embeddings_path,
        lance_path,
        onnx_model_path,
        engine_mode,
        deepgram_key,
        resource_dir,
        model_tier,
        whisper_model_path,
        log_path,
    } = config;
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
    if !whisper_model_path.is_empty() {
        cmd.args(["--model-path", &whisper_model_path]);
    }

    if !cfg!(debug_assertions) {
        if let Ok(log_file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            cmd.stderr(Stdio::from(log_file));
        }
    }

    // Leave headroom for WebView2's renderer/GPU processes on Windows. Local
    // Whisper is CPU-heavy, and saturating every logical core makes the whole
    // interface feel frozen even when inference throughput is acceptable.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        let logical_cores = std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(4);
        let cpu_threads = logical_cores.saturating_sub(2).clamp(1, 6).to_string();
        cmd.args(["--cpu-threads", &cpu_threads]);
        cmd.creation_flags(BELOW_NORMAL_PRIORITY_CLASS);
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
