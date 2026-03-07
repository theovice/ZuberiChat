# publish-release.ps1 — Build, sign, and publish a Zuberi release to GitHub
# Usage: powershell -ExecutionPolicy Bypass -File scripts\publish-release.ps1 -Version "0.2.0"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [string]$KeyPath = "$env:USERPROFILE\.tauri\zuberi.key",
    [string]$KeyPassword = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

Write-Host "=== Zuberi Release v$Version ===" -ForegroundColor Cyan

# 1. Bump version in tauri.conf.json and package.json
Write-Host "`n[1/5] Bumping version to $Version..." -ForegroundColor Yellow
$tauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$tauriConf.version = $Version
$tauriConf | ConvertTo-Json -Depth 10 | Set-Content "src-tauri\tauri.conf.json" -Encoding UTF8

$pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$pkgJson.version = $Version
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8

# Also bump Cargo.toml version
(Get-Content "src-tauri\Cargo.toml" -Raw) -replace 'version = "[\d.]+"', "version = `"$Version`"" |
    Set-Content "src-tauri\Cargo.toml" -Encoding UTF8

# 2. Build with signing
Write-Host "`n[2/5] Building..." -ForegroundColor Yellow
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $KeyPath -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KeyPassword
pnpm tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# 3. Locate artifacts
Write-Host "`n[3/5] Collecting artifacts..." -ForegroundColor Yellow
$bundleDir = "src-tauri\target\release\bundle"
$nsisExe = Get-ChildItem "$bundleDir\nsis\*.exe" | Select-Object -First 1
$nsisSig = Get-ChildItem "$bundleDir\nsis\*.exe.sig" | Select-Object -First 1

if (-not $nsisExe) { Write-Host "No NSIS installer found!" -ForegroundColor Red; exit 1 }

$artifacts = @($nsisExe.FullName)
if ($nsisSig) { $artifacts += $nsisSig.FullName }

# 4. Generate latest.json for the updater
Write-Host "`n[4/5] Generating latest.json..." -ForegroundColor Yellow
$sig = if ($nsisSig) { (Get-Content $nsisSig.FullName -Raw).Trim() } else { "" }
$latestJson = @{
    version = $Version
    notes = "Zuberi v$Version"
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $sig
            url = "https://github.com/theovice/ZuberiChat/releases/download/v$Version/$($nsisExe.Name)"
        }
    }
} | ConvertTo-Json -Depth 5

$latestPath = Join-Path $bundleDir "latest.json"
$latestJson | Set-Content $latestPath -Encoding UTF8
Write-Host "  Created: $latestPath"
$artifacts += $latestPath

Write-Host "`nArtifacts:"
$artifacts | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }

# 5. Create GitHub release
Write-Host "`n[5/5] Creating GitHub release v$Version..." -ForegroundColor Yellow
$ghArgs = @("release", "create", "v$Version", "--title", "Zuberi v$Version", "--notes", "Auto-update release for Zuberi v$Version") + $artifacts
& gh @ghArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nRelease published: https://github.com/theovice/ZuberiChat/releases/tag/v$Version" -ForegroundColor Cyan
} else {
    Write-Host "`nFailed to create GitHub release!" -ForegroundColor Red
    exit 1
}
