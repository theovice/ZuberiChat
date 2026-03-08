use std::process::Command;

fn main() {
    // Embed app version from tauri.conf.json at compile time
    // (Cargo.toml version differs — tauri.conf.json is source of truth)
    let tauri_conf = std::fs::read_to_string("tauri.conf.json")
        .expect("Failed to read tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(&tauri_conf)
        .expect("Failed to parse tauri.conf.json");
    let app_version = conf["version"]
        .as_str()
        .expect("Missing 'version' in tauri.conf.json")
        .to_string();
    println!("cargo:rustc-env=APP_VERSION={}", app_version);

    // Embed git commit hash at compile time
    let commit = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=BUILD_COMMIT={}", commit);

    // Force Cargo to re-run build script when HEAD moves (new commit or branch switch).
    // Without this, Cargo caches the old BUILD_COMMIT when only non-Rust files change.
    let git_head = std::path::Path::new("../.git/HEAD");
    if git_head.exists() {
        println!("cargo:rerun-if-changed=../.git/HEAD");
        // HEAD contains "ref: refs/heads/<branch>" — watch that ref file too
        if let Ok(head_content) = std::fs::read_to_string(git_head) {
            let head_content = head_content.trim();
            if let Some(ref_path) = head_content.strip_prefix("ref: ") {
                let ref_file = format!("../.git/{}", ref_path);
                if std::path::Path::new(&ref_file).exists() {
                    println!("cargo:rerun-if-changed={}", ref_file);
                }
            }
        }
    }

    // Embed UTC build timestamp at compile time
    let timestamp = chrono_free_utc_now();
    println!("cargo:rustc-env=BUILD_TIMESTAMP={}", timestamp);

    tauri_build::build()
}

/// Get current UTC time in ISO 8601 without external crates.
/// Uses std::time::SystemTime.
fn chrono_free_utc_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();

    // Convert epoch seconds to date-time components
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since 1970-01-01 to Y-M-D (simplified Gregorian)
    let (year, month, day) = days_to_ymd(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm: count years, then months
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let month_days: [u64; 12] = if is_leap(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for md in month_days.iter() {
        if days < *md {
            break;
        }
        days -= *md;
        month += 1;
    }
    (year, month, days + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}
