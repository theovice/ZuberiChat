#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

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
        .invoke_handler(tauri::generate_handler![read_gateway_token, open_url_in_browser, toggle_devtools])
        .setup(|app| {
            let handle = app.handle();

            // ── File menu ────────────────────────────────────────────
            let new_conv = MenuItemBuilder::with_id("new-conversation", "New Conversation")
                .accelerator("CmdOrCtrl+N")
                .build(handle)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(handle)?;
            let close = MenuItemBuilder::with_id("close-window", "Close")
                .accelerator("CmdOrCtrl+W")
                .build(handle)?;
            let quit = MenuItemBuilder::with_id("quit", "Exit")
                .build(handle)?;

            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&new_conv)
                .separator()
                .item(&settings)
                .separator()
                .item(&close)
                .item(&quit)
                .build()?;

            // ── Edit menu (predefined items — handled automatically) ─
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            // ── View menu ────────────────────────────────────────────
            let toggle_devtools = MenuItemBuilder::with_id("toggle-devtools", "Toggle DevTools")
                .accelerator("CmdOrCtrl+Shift+I")
                .build(handle)?;
            let zoom_in = MenuItemBuilder::with_id("zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(handle)?;
            let zoom_out = MenuItemBuilder::with_id("zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(handle)?;
            let zoom_reset = MenuItemBuilder::with_id("zoom-reset", "Reset Zoom")
                .accelerator("CmdOrCtrl+0")
                .build(handle)?;
            let fullscreen = MenuItemBuilder::with_id("toggle-fullscreen", "Toggle Fullscreen")
                .accelerator("F11")
                .build(handle)?;

            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&toggle_devtools)
                .separator()
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_reset)
                .separator()
                .item(&fullscreen)
                .build()?;

            // ── Help menu ────────────────────────────────────────────
            let docs = MenuItemBuilder::with_id("documentation", "Documentation")
                .build(handle)?;
            let about_metadata = AboutMetadataBuilder::new()
                .name(Some("Zuberi"))
                .version(Some("0.1.0"))
                .build();
            let about = PredefinedMenuItem::about(handle, Some("About Zuberi"), Some(about_metadata))?;

            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(&docs)
                .separator()
                .item(&about)
                .build()?;

            // ── Assemble full menu bar ───────────────────────────────
            let menu = MenuBuilder::new(handle)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&help_menu)
                .build()?;

            // Set menu on the main window
            if let Some(window) = app.get_webview_window("main") {
                window.set_menu(menu)?;

                #[cfg(debug_assertions)]
                window.open_devtools();
            }

            // ── Menu event handler ───────────────────────────────────
            let app_handle = handle.clone();
            app.on_menu_event(move |_app, event| {
                let Some(window) = app_handle.get_webview_window("main") else {
                    return;
                };
                match event.id().as_ref() {
                    "new-conversation" => {
                        let _ = window.emit("new-conversation", ());
                    }
                    "settings" => {
                        let _ = window.emit("open-settings", ());
                    }
                    "close-window" => {
                        let _ = window.close();
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    "toggle-devtools" => {
                        if window.is_devtools_open() {
                            window.close_devtools();
                        } else {
                            window.open_devtools();
                        }
                    }
                    "zoom-in" => {
                        let _ = window.emit("zoom", "in");
                    }
                    "zoom-out" => {
                        let _ = window.emit("zoom", "out");
                    }
                    "zoom-reset" => {
                        let _ = window.emit("zoom", "reset");
                    }
                    "toggle-fullscreen" => {
                        if let Ok(is_fullscreen) = window.is_fullscreen() {
                            let _ = window.set_fullscreen(!is_fullscreen);
                        }
                    }
                    "documentation" => {
                        let _ = tauri_plugin_opener::open_url("https://docs.openclaw.ai", None::<&str>);
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
