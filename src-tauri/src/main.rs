#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

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

/// Check if Ollama is reachable at http://127.0.0.1:11434/api/tags.
/// Returns Ok(true) if 200, Ok(false) for any error.
#[tauri::command]
async fn check_ollama_live() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    match client.get("http://127.0.0.1:11434/api/tags").send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Launch Ollama serve with OLLAMA_ORIGINS set for the Tauri production origin.
#[tauri::command]
fn launch_ollama() -> Result<(), String> {
    Command::new("ollama")
        .arg("serve")
        .env("OLLAMA_ORIGINS", "http://tauri.localhost")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn ollama serve: {}", e))?;

    println!("[Zuberi] Spawned ollama serve");
    Ok(())
}

/// Ensure Ollama is running: check first, launch if needed, poll until ready.
/// Returns Ok(true) if Ollama is live, Ok(false) if it never came up.
#[tauri::command]
async fn ensure_ollama() -> Result<bool, String> {
    // Already running?
    if check_ollama_live().await.unwrap_or(false) {
        println!("[Zuberi] Ollama already running");
        return Ok(true);
    }

    // Try to launch
    if let Err(e) = launch_ollama() {
        println!("[Zuberi] Failed to launch Ollama: {}", e);
        return Ok(false);
    }

    // Poll up to 10 times, 700ms apart
    for i in 1..=10 {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        if check_ollama_live().await.unwrap_or(false) {
            println!("[Zuberi] Ollama came up after {} polls", i);
            return Ok(true);
        }
    }

    println!("[Zuberi] Ollama did not come up after 10 polls");
    Ok(false)
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
        .invoke_handler(tauri::generate_handler![read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg, check_ollama_live, launch_ollama, ensure_ollama])
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
