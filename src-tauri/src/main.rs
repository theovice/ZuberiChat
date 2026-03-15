#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod crypto;

use serde::{Serialize, Deserialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

/// Version information returned by get_installed_version and read_repo_version.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    version: String,
    commit: String,
    built_at: String,
}

/// Locate .openclaw.local.json by searching multiple locations.
/// Dev:  exe is src-tauri/target/debug/zuberichat.exe — walk-up finds repo root.
/// Prod: exe is in C:\Program Files\Zuberi — falls through to USERPROFILE or LOCALAPPDATA.
fn find_config() -> Result<PathBuf, String> {
    let filename = ".openclaw.local.json";

    // Try 1: Explicit override via OPENCLAW_CONFIG env var
    if let Ok(path) = std::env::var("OPENCLAW_CONFIG") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    // Try 2: Walk up from executable (covers dev layout)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            if let Some(ref d) = dir {
                let candidate = d.join(filename);
                if candidate.exists() {
                    return Ok(candidate);
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }

    // Try 3: Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join(filename);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // Try 4: User home directory (%USERPROFILE%)
    if let Ok(home) = std::env::var("USERPROFILE") {
        let candidate = PathBuf::from(&home).join(filename);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // Try 5: Local app data (%LOCALAPPDATA%\Zuberi)
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let candidate = PathBuf::from(&local).join("Zuberi").join(filename);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not find .openclaw.local.json — searched exe walk-up, cwd, USERPROFILE, LOCALAPPDATA\\Zuberi".to_string())
}

/// Open a URL in the system default browser.
#[tauri::command]
fn open_url_in_browser(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

/// Toggle the developer tools window.
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

/// Save an uploaded file to the workspace uploads directory.
/// The frontend reads the file with FileReader and passes raw bytes here.
#[tauri::command]
fn save_upload(filename: String, contents: Vec<u8>) -> Result<String, String> {
    let upload_dir = PathBuf::from(r"C:\Users\PLUTO\openclaw_workspace\uploads");
    fs::create_dir_all(&upload_dir)
        .map_err(|e| format!("Failed to create uploads dir: {}", e))?;

    // Sanitize filename — strip path separators
    let safe_name = filename
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let dest = upload_dir.join(&safe_name);

    fs::write(&dest, &contents)
        .map_err(|e| format!("Failed to write {}: {}", dest.display(), e))?;

    let dest_str = dest.to_string_lossy().to_string();
    println!("[Zuberi] Saved upload: {} ({} bytes)", dest_str, contents.len());
    Ok(dest_str)
}

/// Sync a local file to the CEG server via scp.
/// Runs: scp <local_path> ceg@100.100.101.1:/opt/zuberi/files/
#[tauri::command]
fn sync_to_ceg(local_path: String) -> Result<String, String> {
    let remote = "ceg@100.100.101.1:/opt/zuberi/files/";

    // Ensure remote directory exists
    let mkdir_status = Command::new("ssh")
        .args(["ceg@100.100.101.1", "mkdir", "-p", "/opt/zuberi/files"])
        .status()
        .map_err(|e| format!("Failed to run ssh mkdir: {}", e))?;

    if !mkdir_status.success() {
        eprintln!("[Zuberi] Warning: ssh mkdir returned non-zero (dir may already exist)");
    }

    // scp the file
    let output = Command::new("scp")
        .args([&local_path, remote])
        .output()
        .map_err(|e| format!("Failed to run scp: {}", e))?;

    if output.status.success() {
        let msg = format!("[Zuberi] Synced to CEG: {} → {}", local_path, remote);
        println!("{}", msg);
        Ok(msg)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("scp failed: {}", stderr))
    }
}

#[tauri::command]
async fn check_ollama_live() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get("http://127.0.0.1:11434/api/tags").send().await {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn launch_ollama() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let ollama_path = r"C:\Users\PLUTO\AppData\Local\Programs\Ollama\ollama.exe";
    std::process::Command::new(ollama_path)
        .arg("serve")
        .env("OLLAMA_ORIGINS", "http://tauri.localhost")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to spawn Ollama: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn ensure_ollama() -> Result<bool, String> {
    // Already running — nothing to do
    if check_ollama_live().await.unwrap_or(false) {
        return Ok(true);
    }
    // Attempt launch
    launch_ollama().await?;
    // Poll up to 15s using tokio async sleep (never block the thread)
    for _ in 0..15 {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        if check_ollama_live().await.unwrap_or(false) {
            return Ok(true);
        }
    }
    // Health check failed — return false so frontend can show error + log path
    Ok(false)
}

#[tauri::command]
async fn check_openclaw() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let healthy = match client
        .get("http://127.0.0.1:18789")
        .send()
        .await
    {
        Ok(r) => r.status().is_success() || r.status().as_u16() == 401,
        Err(_) => false,
    };
    if healthy {
        Ok("openclaw_ok".to_string())
    } else {
        Ok("openclaw_unhealthy".to_string())
    }
}

#[tauri::command]
async fn ensure_environment() -> Result<serde_json::Value, String> {
    use serde_json::json;
    let mut results = json!({
        "ollama": "pending",
        "model": "pending",
        "openclaw": "pending"
    });
    // Step 1: Ollama — blocking. Cannot proceed without it.
    match ensure_ollama().await {
        Ok(true) => results["ollama"] = json!("ok"),
        Ok(false) => {
            results["ollama"] = json!("failed");
            return Ok(results);
        }
        Err(e) => {
            results["ollama"] = json!(format!("error: {e}"));
            return Ok(results);
        }
    }
    results["model"] = json!("skipped");
    // Step 2: OpenClaw — non-blocking. Return status, let frontend handle.
    match check_openclaw().await {
        Ok(msg) => results["openclaw"] = json!(msg),
        Err(e) => results["openclaw"] = json!(format!("error: {e}")),
    }
    Ok(results)
}

/// Return the installed app's version info (embedded at compile time).
#[tauri::command]
fn get_installed_version() -> Result<VersionInfo, String> {
    Ok(VersionInfo {
        version: env!("APP_VERSION").to_string(),
        commit: env!("BUILD_COMMIT").to_string(),
        built_at: env!("BUILD_TIMESTAMP").to_string(),
    })
}

/// Read version.json from the repo root on disk.
/// Returns repo_unavailable if the file is missing, unreadable, or invalid JSON.
#[tauri::command]
fn read_repo_version() -> Result<VersionInfo, String> {
    let repo_version_path = r"C:\Users\PLUTO\github\Repo\ZuberiChat\version.json";
    let contents = fs::read_to_string(repo_version_path)
        .map_err(|_| "repo_unavailable".to_string())?;
    // Strip UTF-8 BOM if present — PowerShell 5.1 writes BOM by default
    let contents = contents.strip_prefix('\u{FEFF}').unwrap_or(&contents);
    let info: VersionInfo = serde_json::from_str(contents)
        .map_err(|_| "repo_unavailable".to_string())?;
    Ok(info)
}

/// Spawn the local update script (test → build → install) in a visible console window.
/// Uses `cmd /c start` to ensure a visible PowerShell window appears on the desktop.
/// Direct `Command::new("powershell").creation_flags(CREATE_NEW_CONSOLE)` fails to show
/// a window when the parent process has piped stdio (e.g. `pnpm tauri dev` pipeline).
/// Returns immediately — does not wait for completion.
#[tauri::command]
fn run_local_update() -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script_path = r"C:\Users\PLUTO\github\Repo\ZuberiChat\scripts\update-local.ps1";
    if !std::path::Path::new(script_path).exists() {
        return Err(format!("Update script not found at {script_path}"));
    }
    // Use `cmd /c start` to reliably create a visible console window.
    // The intermediary cmd.exe is hidden (CREATE_NO_WINDOW), but `start` always
    // opens a new visible window for the spawned PowerShell process.
    std::process::Command::new("cmd")
        .args(["/c", "start", "Zuberi Update", "powershell",
               "-ExecutionPolicy", "Bypass", "-File", script_path])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to spawn update script: {e}"))?;
    Ok("started".to_string())
}

/// Read the gateway token from .openclaw.local.json.
#[tauri::command]
fn read_gateway_token() -> Result<String, String> {
    let path = find_config()?;

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;

    let parsed: Value = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse .openclaw.local.json: {}", e))?;

    parsed["gatewayToken"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing 'gatewayToken' in .openclaw.local.json".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                if let Ok(true) = window.is_minimized() {
                    let _ = window.unminimize();
                }
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg, check_ollama_live, launch_ollama, ensure_ollama, check_openclaw, ensure_environment, get_installed_version, read_repo_version, run_local_update, crypto::sign_challenge])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
