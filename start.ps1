<#
.SYNOPSIS
    Start the Smart Classroom Monitoring System (backend + frontend) locally.

.DESCRIPTION
    Runs the complete application as ONE coordinated system:

        start.ps1
            -> backend  (uvicorn, http://localhost:8000)
            -> frontend (vite,     http://localhost:5173)
            -> readiness gate: waits until BOTH actually respond
            -> opens the browser

    Startup failures are NOT hidden. Every failure mode (missing virtualenv,
    missing node_modules, backend never becoming healthy, port already in use)
    stops the script with a clear message instead of leaving a half-started
    system behind.

.PARAMETER BackendOnly
    Start only the FastAPI backend.

.PARAMETER FrontendOnly
    Start only the Vite dev server.

.PARAMETER NoBrowser
    Do not open a browser window on success.

.PARAMETER BackendPort
    Port for the backend (default 8000).

.PARAMETER FrontendPort
    Port for the frontend dev server (default 5173).
#>
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

# Resolve paths relative to this script, not the caller's CWD.
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$ErrorActionPreference = 'Stop'
$VenvPython = Join-Path $ProjectRoot 'backend\.venv\Scripts\python.exe'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$NodeModules = Join-Path $FrontendDir 'node_modules'

$BackendUrl = "http://localhost:$BackendPort"
$FrontendUrl = "http://localhost:$FrontendPort"

# Probes use the literal loopback address, NOT "localhost". On this machine
# Vite binds ::1 (IPv6) while uvicorn binds 127.0.0.1 (IPv4), so neither
# hostname is reliable for both. Probing by hostname stalled the readiness
# gate and reported a healthy backend as a failure.
# Try IPv4, then IPv6, and accept whichever actually answers.
function Get-BackendHealth {
    foreach ($c in @("http://127.0.0.1:$BackendPort", $BackendUrl)) {
        try { return Invoke-RestMethod "$c/health" -TimeoutSec 3 } catch { }
    }
    return $null
}

function Test-HttpOk {
    param([string]$Url, [int]$TimeoutSec = 2)
    foreach ($candidate in @(
        $Url,
        ($Url -replace '^http://localhost', 'http://127.0.0.1'),
        ($Url -replace '^http://localhost', 'http://[::1]')
    )) {
        try {
            $resp = Invoke-WebRequest $candidate -TimeoutSec $TimeoutSec -UseBasicParsing
            if ($resp.StatusCode -eq 200) { return $true }
        } catch { }
    }
    return $false
}

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    [ok]   $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "    [FAIL] $m" -ForegroundColor Red }
function Write-Info { param($m) Write-Host "    $m" -ForegroundColor Gray }

function Stop-WithError {
    param($Message)
    Write-Fail $Message
    Write-Host ""
    exit 1
}

function Show-LogTail {
    param($Path)
    Get-Content $Path -Tail 20 -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
}

# ---------------------------------------------------------------- preflight
Write-Step "Preflight"

if (-not $BackendOnly) {
    if (-not (Test-Path $NodeModules)) {
        Stop-WithError "frontend/node_modules is missing. Run: cd frontend; npm install"
    }
    Write-Ok "frontend dependencies present"
}

if (-not $FrontendOnly) {
    if (-not (Test-Path $VenvPython)) {
        Stop-WithError "backend virtualenv missing at backend\.venv. See README for setup."
    }
    Write-Ok "backend virtualenv present"
}

# Refuse to start a second copy on an occupied port rather than half-starting.
function Assert-PortFree {
    param([int]$Port, [string]$Label)
    $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($busy) {
        Stop-WithError "Port $Port ($Label) is already in use. Stop the other process, or pass a different port."
    }
    Write-Ok "port $Port free"
}

if (-not $FrontendOnly) { Assert-PortFree -Port $BackendPort  -Label 'backend' }
if (-not $BackendOnly)  { Assert-PortFree -Port $FrontendPort -Label 'frontend' }


# ------------------------------------------------------------------ backend
if (-not $FrontendOnly) {
    Write-Step "Starting backend on $BackendUrl"
    $backendLog = Join-Path $ProjectRoot 'backend-start.log'
    $backend = Start-Process -FilePath $VenvPython `
        -ArgumentList '-m', 'uvicorn', 'backend.main:app',
                      '--host', '127.0.0.1', '--port', $BackendPort `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError  "$backendLog.err" `
        -PassThru

    # Readiness gate: poll the real health endpoint, do not just assume.
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if ($backend.HasExited) {
            Write-Fail "backend exited early (code $($backend.ExitCode))"
            Show-LogTail $backendLog
            Show-LogTail "$backendLog.err"
            Stop-WithError "Backend failed to start. See backend-start.log"
        }
        if (Test-HttpOk -Url "$BackendUrl/health" -TimeoutSec 2) { $ready = $true; break }
    }

    if (-not $ready) {
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        Show-LogTail $backendLog
        Show-LogTail "$backendLog.err"
        Stop-WithError "Backend did not become healthy within 30s. See backend-start.log"
    }
    $h = Get-BackendHealth
    if ($h) { Write-Ok "backend healthy (phase $($h.phase), mode $($h.mode))" }
    else    { Write-Ok "backend healthy" }
}
if (-not $BackendOnly) {
    Write-Step "Starting frontend on $FrontendUrl"
    $frontendLog = Join-Path $ProjectRoot 'frontend-start.log'
    $frontend = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev', '--', '--port', $FrontendPort, '--strictPort' `
        -WorkingDirectory $FrontendDir `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError  "$frontendLog.err" `
        -PassThru

    $served = $false
    for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 500
        if ($frontend.HasExited) {
            Write-Fail "frontend exited early (code $($frontend.ExitCode))"
            Show-LogTail $frontendLog
            Show-LogTail "$frontendLog.err"
            Stop-WithError "Frontend failed to start. See frontend-start.log"
        }
        if (Test-HttpOk -Url $FrontendUrl -TimeoutSec 2) { $served = $true; break }
    }

    if (-not $served) {
        Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
        Show-LogTail $frontendLog
        Show-LogTail "$frontendLog.err"
        Stop-WithError "Frontend did not serve within 40s. See frontend-start.log"
    }
    Write-Ok "frontend serving"
}

# ------------------------------------------------------------------- report
Write-Step "System ready"
Write-Host ""
Write-Host "    Frontend : $FrontendUrl"    -ForegroundColor White
Write-Host "    Backend  : $BackendUrl"     -ForegroundColor White
Write-Host "    API docs : $BackendUrl/docs" -ForegroundColor White
Write-Host "    Logs     : backend-start.log, frontend-start.log" -ForegroundColor White
Write-Host ""

# Report the real component state rather than assuming success.
$h = Get-BackendHealth
if ($h) {
    Write-Info "Real component state reported by the backend:"
    foreach ($c in $h.components) {
        Write-Host ("      {0,-12} {1,-14} healthy={2}" -f $c.name, $c.state, $c.healthy)
    }
    Write-Host ""
    Write-Info "Arduino absent is NORMAL when no board is plugged in."
} else {
    Write-Info "Could not read component state from the backend."
}

if (-not $NoBrowser -and -not $BackendOnly) {
    Write-Step "Opening browser"
    Start-Process $FrontendUrl
}

Write-Info "Close the two console windows (or press Ctrl+C in them) to stop."
