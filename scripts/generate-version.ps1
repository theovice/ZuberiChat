# generate-version.ps1
# Reads version from tauri.conf.json, gets git commit + timestamp,
# writes version.json to repo root.

$ErrorActionPreference = 'Stop'

# Script lives at <repo>/scripts/generate-version.ps1
# $PSScriptRoot = <repo>/scripts, so one Split-Path gives repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $repoRoot) {
    $repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$tauriConf = Join-Path $repoRoot 'src-tauri\tauri.conf.json'
if (-not (Test-Path $tauriConf)) {
    Write-Error "tauri.conf.json not found at $tauriConf"
    exit 1
}

# Read version from tauri.conf.json
$conf = Get-Content $tauriConf -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) {
    Write-Error 'Could not read version from tauri.conf.json'
    exit 1
}

# Get short git commit hash
$commit = (git -C $repoRoot rev-parse --short HEAD 2>$null)
if (-not $commit) {
    Write-Error 'Could not get git commit hash'
    exit 1
}
$commit = $commit.Trim()

# Get current UTC timestamp in ISO 8601
$builtAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Build the object and write as JSON
$versionObj = @{
    version = $version
    commit  = $commit
    builtAt = $builtAt
}

$outPath = Join-Path $repoRoot 'version.json'
# Use WriteAllText to avoid UTF-8 BOM — PS 5.1 Set-Content -Encoding UTF8 always writes BOM
$json = $versionObj | ConvertTo-Json -Depth 2
[System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host "Generated $outPath"
Write-Host "  version: $version"
Write-Host "  commit:  $commit"
Write-Host "  builtAt: $builtAt"
