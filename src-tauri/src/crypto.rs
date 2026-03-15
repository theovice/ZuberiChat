//! Ed25519 device identity for OpenClaw gateway challenge-response handshake.
//!
//! On first invocation the module generates a persistent Ed25519 keypair and
//! derives a stable device ID (SHA-256 of the public key, hex-encoded).  The
//! keypair is saved to `device_keys.json` inside Tauri's app-data directory so
//! it survives across application restarts.
//!
//! The `sign_challenge` Tauri command builds a v2 pipe-delimited payload string
//! and signs it with Ed25519.  The gateway verifies using:
//!   crypto.verify(null, Buffer.from(payload, "utf8"), key, sig)

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// ── Persisted key file format ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct StoredKeyPair {
    private_key_hex: String,
    public_key_b64url: String,
    device_id: String,
}

// ── Result returned to the JS frontend ────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignChallengeResult {
    pub device_id: String,
    pub public_key: String,
    pub signature: String,
    pub signed_at: i64,
    pub nonce: String,
}

// ── Helpers ───────────────────────────────────────────────────────────

fn get_key_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(app_data_dir.join("device_keys.json"))
}

/// Load an existing keypair from disk, or generate + persist a new one.
fn load_or_generate_keypair(
    app_handle: &tauri::AppHandle,
) -> Result<(SigningKey, String, String), String> {
    let key_file = get_key_file_path(app_handle)?;

    if key_file.exists() {
        // ── Load existing keypair ────────────────────────────────────
        let contents = fs::read_to_string(&key_file)
            .map_err(|e| format!("Failed to read key file: {}", e))?;
        let stored: StoredKeyPair = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse key file: {}", e))?;

        let private_bytes = hex::decode(&stored.private_key_hex)
            .map_err(|e| format!("Failed to decode private key hex: {}", e))?;
        let private_array: [u8; 32] = private_bytes
            .try_into()
            .map_err(|_| "Invalid private key length (expected 32 bytes)".to_string())?;
        let signing_key = SigningKey::from_bytes(&private_array);

        Ok((signing_key, stored.public_key_b64url, stored.device_id))
    } else {
        // ── Generate new keypair ─────────────────────────────────────
        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        let public_key_b64url = URL_SAFE_NO_PAD.encode(verifying_key.as_bytes());

        // Device ID = hex(SHA-256(public_key_bytes))
        let mut hasher = Sha256::new();
        hasher.update(verifying_key.as_bytes());
        let device_id = hex::encode(hasher.finalize());

        // Persist to disk
        let stored = StoredKeyPair {
            private_key_hex: hex::encode(signing_key.to_bytes()),
            public_key_b64url: public_key_b64url.clone(),
            device_id: device_id.clone(),
        };
        let json = serde_json::to_string_pretty(&stored)
            .map_err(|e| format!("Failed to serialize key pair: {}", e))?;
        fs::write(&key_file, &json)
            .map_err(|e| format!("Failed to write key file: {}", e))?;

        println!(
            "[Zuberi] Generated new device keypair — id={}",
            &device_id[..16]
        );

        Ok((signing_key, public_key_b64url, device_id))
    }
}

// ── Tauri command ─────────────────────────────────────────────────────

/// Sign a gateway connect challenge using the v2 pipe-delimited payload format.
///
/// The payload string is:
///   v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes}|{signedAtMs}|{token}|{nonce}
///
/// The signature covers the UTF-8 bytes of this string, matching:
///   crypto.verify(null, Buffer.from(payload, "utf8"), key, sig)
#[tauri::command]
pub fn sign_challenge(
    app_handle: tauri::AppHandle,
    nonce: String,
    token: String,
    client_id: String,
    client_mode: String,
    role: String,
    scopes: String,
    _platform: String,
) -> Result<SignChallengeResult, String> {
    let (signing_key, public_key, device_id) = load_or_generate_keypair(&app_handle)?;

    // Current time in milliseconds
    let signed_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as i64;

    // Build the v2 pipe-delimited payload string
    let payload = format!(
        "v2|{}|{}|{}|{}|{}|{}|{}|{}",
        device_id, client_id, client_mode, role, scopes, signed_at_ms, token, nonce
    );

    // Sign the UTF-8 bytes of the payload string
    let signature = signing_key.sign(payload.as_bytes());
    let signature_b64url = URL_SAFE_NO_PAD.encode(signature.to_bytes());

    println!(
        "[Zuberi] Signed v2 payload — device={} nonce={}",
        &device_id[..16],
        &nonce[..8.min(nonce.len())]
    );

    Ok(SignChallengeResult {
        device_id,
        public_key,
        signature: signature_b64url,
        signed_at: signed_at_ms,
        nonce,
    })
}
