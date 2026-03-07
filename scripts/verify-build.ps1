param([string]$ExePath = "src-tauri\target\release\zuberichat.exe")
Write-Host "Verifying production build: $ExePath"
$binary = [System.IO.File]::ReadAllText($ExePath, [System.Text.Encoding]::GetEncoding(28591))
$checks = @(
    @{ Name = "CSP ipc.localhost present";    Pattern = "ipc.localhost" },
    @{ Name = "CSP connect-src present";      Pattern = "connect-src" },
    @{ Name = "Ollama origin present";        Pattern = "localhost:11434" },
    @{ Name = "OpenClaw WS origin present";   Pattern = "127.0.0.1:18789" },
    @{ Name = "Tauri IPC origin present";     Pattern = "ipc:" }
)
$failed = 0
foreach ($check in $checks) {
    if ($binary -match [regex]::Escape($check.Pattern)) {
        Write-Host "  PASS $($check.Name)"
    } else {
        Write-Host "  FAIL $($check.Name) - pattern not found: $($check.Pattern)"
        $failed++
    }
}
if ($failed -gt 0) {
    Write-Host "BUILD VERIFICATION FAILED - $failed check(s) failed. Do not install."
    exit 1
} else {
    Write-Host "BUILD VERIFIED - all checks passed."
    exit 0
}
