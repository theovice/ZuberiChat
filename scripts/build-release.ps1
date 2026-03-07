# build-release.ps1 — Build Zuberi with updater signing
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1

param(
    [string]$KeyPath = "$env:USERPROFILE\.tauri\zuberi.key",
    [string]$KeyPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== Zuberi Release Build ===" -ForegroundColor Cyan

# Verify key exists
if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: Signing key not found at $KeyPath" -ForegroundColor Red
    exit 1
}

# Set env vars for Tauri signing
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $KeyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KeyPassword

Write-Host "Signing key loaded from $KeyPath" -ForegroundColor Green
Write-Host "Key length: $($env:TAURI_SIGNING_PRIVATE_KEY.Length) chars"

# Build
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "`nBuilding..." -ForegroundColor Yellow
pnpm tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBuild failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Show output
Write-Host "`n=== Build artifacts ===" -ForegroundColor Cyan
$bundleDir = "src-tauri\target\release\bundle"
Get-ChildItem "$bundleDir\nsis\*", "$bundleDir\msi\*" | ForEach-Object {
    $size = "{0:N1} MB" -f ($_.Length / 1MB)
    Write-Host "  $($_.Name)  ($size)" -ForegroundColor Green
}

Write-Host "`nDone!" -ForegroundColor Cyan
