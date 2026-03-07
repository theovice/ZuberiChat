# update-local.ps1
# Local one-click update: test, build, verify, install.
# Launched by the app via run_local_update invoke command.
# Logs all output to logs\update.log in the repo root.

$ErrorActionPreference = 'Stop'

$repoRoot = 'C:\Users\PLUTO\github\Repo\ZuberiChat'
if (-not (Test-Path $repoRoot)) {
    Write-Error "Repo not found at $repoRoot"
    exit 1
}

Set-Location $repoRoot

# Ensure logs directory exists
$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir 'update.log'

# Helper: log a message to both console and log file
function Log {
    param([string]$Message)
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$ts] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

# Helper: run a native command, log all output, return exit code.
# Uses 'Continue' so stderr does not throw a NativeCommandError.
function Invoke-Native {
    param([string]$Label, [string]$Command, [string[]]$Arguments)
    Log "Running: $Label"
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = & $Command @Arguments 2>&1
    $ec = $LASTEXITCODE
    $ErrorActionPreference = $prevPref
    # Log all output (stdout + stderr interleaved)
    $output | Out-String | Add-Content -Path $logFile
    Log "$Label exited with code $ec"
    return $ec
}

Log '=== Zuberi Local Update Started ==='

# Step 1: Run tests
$ec = Invoke-Native -Label 'pnpm test' -Command 'pnpm' -Arguments @('test')
if ($ec -ne 0) {
    Log "ERROR: pnpm test failed (exit code $ec)"
    exit 1
}
Log 'Tests passed.'

# Step 2: Run build
$ec = Invoke-Native -Label 'pnpm tauri build' -Command 'pnpm' -Arguments @('tauri', 'build')
if ($ec -ne 0) {
    Log "ERROR: pnpm tauri build failed (exit code $ec)"
    exit 1
}
Log 'Build succeeded.'

# Step 3: Run verify-build.ps1 if it exists
$verifyScript = Join-Path $repoRoot 'scripts\verify-build.ps1'
if (Test-Path $verifyScript) {
    $ec = Invoke-Native -Label 'verify-build.ps1' -Command 'powershell' -Arguments @('-ExecutionPolicy', 'Bypass', '-File', $verifyScript)
    if ($ec -ne 0) {
        Log "ERROR: verify-build.ps1 failed (exit code $ec)"
        exit 1
    }
    Log 'Build verification passed.'
}

# Step 4: Find the newest NSIS installer
$nsisDir = Join-Path $repoRoot 'src-tauri\target\release\bundle\nsis'
if (-not (Test-Path $nsisDir)) {
    Log "ERROR: NSIS bundle directory not found at $nsisDir"
    exit 1
}

$installer = Get-ChildItem -Path $nsisDir -Filter '*setup*.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    # Try uppercase Setup
    $installer = Get-ChildItem -Path $nsisDir -Filter '*Setup*.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $installer) {
    # Fallback: any .exe in the nsis directory
    $installer = Get-ChildItem -Path $nsisDir -Filter '*.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $installer) {
    Log "ERROR: No installer found in $nsisDir"
    exit 1
}

Log "Found installer: $($installer.FullName)"

# Step 5: Launch the installer (normal mode, not silent)
Log 'Launching installer...'
Start-Process -FilePath $installer.FullName
Log '=== Zuberi Local Update Complete — installer launched ==='
