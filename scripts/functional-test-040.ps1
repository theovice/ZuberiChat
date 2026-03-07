# RTL-040 Functional test: self-healing startup
Write-Host '=== RTL-040 Functional Test ==='

# Step 1: Kill Ollama + Zuberi
Write-Host '[1] Killing Ollama and Zuberi...'
Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name 'zuberichat*' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Verify Ollama is dead
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 -ErrorAction Stop
    Write-Host '    WARNING: Ollama still responding after kill!'
} catch {
    Write-Host '    Confirmed: Ollama is down'
}

# Step 2: Launch Zuberi
Write-Host '[2] Launching Zuberi...'
$zuberiPath = 'C:\Program Files\Zuberi\zuberichat.exe'
if (-not (Test-Path $zuberiPath)) {
    Write-Host '    ERROR: Zuberi not found'
    exit 1
}
Start-Process -FilePath $zuberiPath
Write-Host '    Zuberi launched'

# Step 3: Wait for self-healing (30s)
Write-Host '[3] Waiting up to 30 seconds for Ollama auto-launch...'
$ollamaUp = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    if ($i % 5 -eq 0) {
        try {
            $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 1 -ErrorAction Stop
            Write-Host ('    Ollama responded at ' + $i + 's')
            $ollamaUp = $true
            break
        } catch {
            Write-Host ('    ' + $i + 's - still waiting...')
        }
    }
}

# Step 4: Check Ollama /api/tags
Write-Host '[4] Checking Ollama /api/tags...'
if (-not $ollamaUp) {
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5 -ErrorAction Stop
        $ollamaUp = $true
    } catch {
        Write-Host '    FAIL: Ollama did not come back up after 30s'
        exit 1
    }
}

$response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
$modelNames = @()
foreach ($m in $response.models) {
    $modelNames += $m.name
}
$count = $modelNames.Count
Write-Host ('    Ollama is alive. Models found: ' + $count)
foreach ($m in $modelNames) {
    Write-Host ('      - ' + $m)
}

$hasCustom = $modelNames | Where-Object { $_ -like 'qwen3:14b-fast*' }
if ($hasCustom) {
    Write-Host '    PASS: qwen3:14b-fast is present'
} else {
    Write-Host '    INFO: qwen3:14b-fast not in model list (may need Modelfile rebuild)'
}

Write-Host ''
Write-Host '=== RTL-040 Functional Test PASSED ==='
Write-Host ('  Models available: ' + $count)
