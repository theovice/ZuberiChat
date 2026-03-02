#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

/// Locate .openclaw.local.json by walking up from the executable.
/// Dev:  exe is src-tauri/target/debug/zuberichat.exe → root is 4 levels up.
/// Prod: exe sits next to the config file (or falls back to cwd).
fn find_config() -> Result<PathBuf, String> {
    // Try 1: Walk up from executable (covers dev layout)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            if let Some(ref d) = dir {
                let candidate = d.join(".openclaw.local.json");
                if candidate.exists() {
                    return Ok(candidate);
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }

    // Try 2: Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join(".openclaw.local.json");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Could not find .openclaw.local.json".to_string())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg])
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
