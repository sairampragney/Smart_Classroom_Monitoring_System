<#
.SYNOPSIS
    Start (or stop) the Smart Classroom Monitoring System locally.

.DESCRIPTION
    College-demo launcher for the Dell Latitude 5490.

        start.ps1  -> preflight checks (verify, never auto-install)
                    -> backend  (uvicorn, http://localhost:8000)
                    -> frontend (vite,     http://localhost:5173)
                    -> readiness gate: polls until BOTH actually respond
                    -> prints the REAL runtime states
                    -> opens the browser

    Design rules:
      * Verification over installation. C: has little free space, so a missing
        dependency is REPORTED with the exact manual fix, never auto-installed.
      * Hardware is optional. A missing Arduino or camera is a valid startup
        state and never causes a failure.
      * Nothing is faked. If no Arduino is connected, the output says so.
      * Startup failures are never hidden; the script stops with a clear
        message instead of leaving a half-started system behind.
      * Only processes THIS script started are ever stopped. Unrelated
        python.exe / node.exe processes are never terminated.

.PARAMETER BackendOnly
    Start only the FastAPI backend.

.PARAMETER FrontendOnly
    Start only the Vite dev server.

.PARAMETER NoBrowser
    Do not open a browser window on success.

.PARAMETER Stop
    Stop the backend/frontend processes recorded by the last start.ps1 run
    and exit. Only tracked PIDs are touched.

.PARAMETER BackendPort
    Port for the backend (default 8000).

.PARAMETER FrontendPort
    Port for the frontend dev server (default 5173).

.EXAMPLE
    .\start.ps1

.EXAMPLE
    .\start.ps1 -NoBrowser

.EXAMPLE
    .\start.ps1 -Stop
#>
[CmdletBinding()]
param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser,
    [switch]$Stop,
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

# Where this run records the PIDs it started, so -Stop can clean up precisely.
$StateFile = Join-Path $ProjectRoot '.start-state.json'

# ------------------------------------------------------------------ output
function Write-Line  { Write-Host ('=' * 56) -ForegroundColor DarkCyan }
function Write-Banner {
    Write-Line
    Write-Host ' SMART CLASSROOM MONITORING SYSTEM' -ForegroundColor Cyan
    Write-Line
}
function Write-Check { param($m) Write-Host "[ok] $m"    -ForegroundColor Green }
function Write-Doing { param($m) Write-Host "[>] $m"    -ForegroundColor Cyan }
function Write-Warn { param($m) Write-Host "[!] $m"     -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "[X] $m"     -ForegroundColor Red }
function Write-Info { param($m) Write-Host "    $m"      -ForegroundColor Gray }
function Write-Plain { param($m) Write-Host $m }

# A missing dependency is reported with the exact manual fix and the script
# stops. Nothing is ever installed automatically (C: has little free space).
function Stop-MissingDependency {
    param([string]$What, [string]$Fix)
    Write-Host ''
    Write-Fail 'MISSING DEPENDENCY'
    Write-Plain "  Missing : $What"
    Write-Plain "  Fix     : $Fix"
    Write-Host ''
    exit 1
}

# ------------------------------------------------------------ process state
$script:StartedPids = @()

function Save-State {
    # MERGE rather than overwrite. A failed run on alternate ports must not
    # destroy the record of a healthy instance that is already running.
    $all = @()
    if (Test-Path $StateFile) {
        try {
            $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
            if ($saved.pids) { $all = @($saved.pids) }
        } catch { }
    }
    foreach ($p in $script:StartedPids) {
        if ($all -notcontains $p) { $all += $p }
    }
    try {
        @{ pids = $all; at = (Get-Date).ToString('o') } |
            ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
    } catch { }
}

function Clear-State {
    # Removes ONLY the PIDs this run started, so an unrelated healthy
    # instance recorded earlier keeps its shutdown entry.
    $remaining = @()
    if (Test-Path $StateFile) {
        try {
            $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
            if ($saved.pids) { $remaining = @($saved.pids) | Where-Object { $script:StartedPids -notcontains $_ } }
        } catch { }
    }
    if ($remaining.Count -gt 0) {
        try {
            @{ pids = @($remaining); at = (Get-Date).ToString('o') } |
                ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
            return
        } catch { }
    }
    Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
}

function Get-ProcessTreeIds {
    # Returns the given PID plus all of its descendants. The processes this
    # script starts spawn children (uvicorn -> python, npm -> node -> vite),
    # so stopping only the recorded PID would leave real orphans behind.
    param([int]$RootId)
    $all = @()
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue($RootId)
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $all += $current
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$current" -ErrorAction SilentlyContinue
        foreach ($c in $children) { $queue.Enqueue([int]$c.ProcessId) }
    }
    return $all
}

function Stop-TrackedProcesses {
    param([switch]$OnlyThisRun)
    $ids = $script:StartedPids
    if (-not $OnlyThisRun -and -not $ids -and (Test-Path $StateFile)) {
        try {
            $saved = Get-Content $StateFile -Raw | ConvertFrom-Json
            if ($saved.pids) { $ids = @($saved.pids) }
        } catch { }
    }
    if (-not $ids) {
        if (-not $OnlyThisRun) { Write-Info 'No recorded processes to stop.' }
        return
    }
    foreach ($id in $ids) {
        # Walk the tree BEFORE killing, otherwise the parent dies first and the
        # child list can no longer be resolved.
        $tree = Get-ProcessTreeIds -RootId ([int]$id)
        # Deepest first so a parent exit does not orphan its children.
        [array]::Reverse($tree)
        foreach ($pidToStop in $tree) {
            $p = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
            if ($p) {
                # Only ever kill PIDs reachable from the ones we started.
                Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
                Write-Check "Stopped PID $pidToStop ($($p.ProcessName))"
            }
        }
    }
    # Rollback paths pass -OnlyThisRun so a pre-existing healthy instance on
    # the standard ports keeps its record and stays reachable via -Stop.
    if ($OnlyThisRun) {
        # Drop only this run's PIDs; keep anything else already recorded.
        Clear-State
    } else {
        Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
    }
}

# Ctrl+C in the launching console tears down what we started, so a demo never
# leaves orphan backend/frontend processes behind.
# [Console]::CancelKeyPress is null when the host has no console (e.g. launched
# hidden for automated testing), so the registration is guarded.
try {
    $cancelHandler = [Console]::CancelKeyPress
    if ($null -ne $cancelHandler) {
        $null = Register-ObjectEvent -InputObject $cancelHandler -SourceIdentifier 'SCMS_Shutdown' -Action {
            Write-Host ''
            Write-Warn 'Interrupt received - stopping processes started by this script...'
            foreach ($id in $script:StartedPids) {
                $tree = Get-ProcessTreeIds -RootId ([int]$id)
                [array]::Reverse($tree)
                foreach ($pidToStop in $tree) {
                    Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
                }
            }
            Remove-Item $StateFile -Force -ErrorAction SilentlyContinue
            Write-Check 'Shutdown complete.'
        }
    }
} catch {
    # Non-interactive host: -Stop is still available for clean shutdown.
}

function Register-Pid {
    param([int]$Id)
    $script:StartedPids += $Id
    Save-State
}

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

# ------------------------------------------------------------------- -Stop
if ($Stop) {
    Write-Banner
    Write-Doing 'Stopping processes recorded by the previous start.ps1 run...'
    Write-Host ''
    Stop-TrackedProcesses
    Write-Host ''
    Write-Check 'Stop complete.'
    Write-Info "State file: $StateFile"
    exit 0
}

# ---------------------------------------------------------------- preflight
Write-Banner

# -- 1. project root ------------------------------------------------------
if (-not (Test-Path (Join-Path $ProjectRoot 'backend\main.py'))) {
    Stop-WithError "Project root is wrong. backend\main.py not found under $ProjectRoot"
}
Write-Check 'Project root verified'

# -- 2. PowerShell --------------------------------------------------------
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Stop-MissingDependency "PowerShell $((Get-Host).Version)" `
        'Install PowerShell 5.1 or newer (this script needs Get-NetTCPConnection).'
}
Write-Check "PowerShell $($PSVersionTable.PSVersion)"

# -- 3. Python / virtualenv ---------------------------------------------
if (-not $FrontendOnly) {
    if (-not (Test-Path $VenvPython)) {
        Stop-MissingDependency 'backend\.venv\Scripts\python.exe' (
            "py -3.11 -m venv backend\.venv  ;  " +
            'backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt')
    }
    $pyVer = & $VenvPython -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if (-not $pyVer) {
        Stop-MissingDependency 'a working Python inside backend\.venv' (
            'Recreate it: py -3.11 -m venv backend\.venv')
    }
    Write-Check "Python detected (venv $pyVer)"

    # -- 4. backend dependencies: verify, never install --------------------
    # These are the real runtime imports, checked WITHOUT importing heavy
    # modules (importlib.util.find_spec), so this costs milliseconds and
    # consumes no disk. Optional/heavy packages are reported, not enforced.
    $probe = & $VenvPython -c @"
import importlib.util as u
req = ['fastapi','uvicorn','pydantic','pydantic_settings','serial','cv2',
       'numpy','sklearn','pandas','joblib','websockets','httpx']
opt = ['pytest','pytest_asyncio']
rm = [m for m in req if u.find_spec(m) is None]
om = [m for m in opt if u.find_spec(m) is None]
print('REQ:' + ','.join(rm))
print('OPT:' + ','.join(om))
"@ 2>$null

    $reqMissing = @()
    $optMissing = @()
    foreach ($line in $probe) {
        if ($line -like 'REQ:*') { $m = $line.Substring(4); if ($m) { $reqMissing = $m.Split(',') } }
        if ($line -like 'OPT:*') { $m = $line.Substring(4); if ($m) { $optMissing = $m.Split(',') } }
    }

    if ($reqMissing.Count -gt 0) {
        Stop-MissingDependency "Python packages: $($reqMissing -join ', ')" (
            'backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt')
    }
    if ($optMissing.Count -gt 0) {
        Write-Warn "Test-only packages missing: $($optMissing -join ', ') (runtime is fine)"
    }
    Write-Check 'Backend dependencies present'

    # -- 5. runtime artifacts (regenerable, never auto-downloaded) ---------
    $cvModel = Join-Path $ProjectRoot 'cv\models\face_detection_yunet_2023mar.onnx'
    $mlModel = Join-Path $ProjectRoot 'ml\artifacts\occupancy_model.joblib'
    if (-not (Test-Path $cvModel)) {
        # Not fatal: CV degrades to STOPPED and the app still starts.
        Write-Warn 'YuNet face-detection model is missing - CV will report unavailable.'
        Write-Info 'Restore with: powershell -ExecutionPolicy Bypass -File scripts\fetch_cv_models.ps1'
    }
    if (-not (Test-Path $mlModel)) {
        Write-Warn 'Trained ML model is missing - ML will report NOT_LOADED.'
        Write-Info 'Restore with: python ml\scripts\train_model.py'
    }
}

# -- 6. Node / npm / frontend deps ---------------------------------------
if (-not $BackendOnly) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Stop-MissingDependency 'Node.js on PATH' `
            'Install Node.js LTS from https://nodejs.org and reopen the terminal.'
    }
    $nodeVer = (& node --version) 2>$null
    Write-Check "Node.js detected ($nodeVer)"

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Stop-MissingDependency 'npm on PATH' `
            'Reinstall Node.js LTS (npm ships with it) and reopen the terminal.'
    }
    $npmVer = (& npm --version) 2>$null
    Write-Check "npm detected ($npmVer)"

    if (-not (Test-Path $NodeModules)) {
        Stop-MissingDependency 'frontend\node_modules' 'cd frontend ; npm install'
    }
    # A present-but-broken node_modules (no vite binary) must be caught too.
    if (-not (Test-Path (Join-Path $NodeModules '.bin\vite.cmd'))) {
        Stop-MissingDependency 'frontend\node_modules\.bin\vite.cmd' 'cd frontend ; npm install'
    }
    Write-Check 'Frontend dependencies present'
}

# -- 7. configuration ----------------------------------------------------
if (-not (Test-Path (Join-Path $ProjectRoot '.env.example'))) {
    Write-Warn '.env.example is missing - using built-in defaults (fine for a local demo).'
}

# -- 8. ports ------------------------------------------------------------
function Get-PortOwner {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if (-not $conn) { return $null }
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if (-not $proc) { return @{ Pid = $conn.OwningProcess; Name = '<unknown>' } }
    return @{ Pid = $proc.Id; Name = $proc.ProcessName }
}

function Assert-PortFree {
    param([int]$Port, [string]$Label, [string]$PortSwitch)
    $owner = Get-PortOwner -Port $Port
    if ($owner) {
        # Report the conflict and the owning process, but never kill it:
        # an occupied port may legitimately belong to an unrelated program.
        Write-Host ''
        Write-Fail "PORT CONFLICT: $Port is already in use ($Label)"
        Write-Plain "  Listening process : $($owner.Name) (PID $($owner.Pid))"
        Write-Plain ''
        Write-Plain '  Choose one - this script will NOT kill that process for you:'
        Write-Plain "    1. Close that program if it is an old copy of this app, then rerun."
        Write-Plain "    2. If a previous start.ps1 started it, run:  .\start.ps1 -Stop"
        Write-Plain "    3. Or start on another port, e.g. $PortSwitch $(([int]$Port) + 1)"
        Write-Plain ''
        Write-Plain "  Inspect it yourself:"
        Write-Plain "    Get-NetTCPConnection -LocalPort $Port -State Listen"
        Write-Plain "    Get-Process -Id $($owner.Pid)"
        Write-Host ''
        exit 1
    }
    Write-Check "Port $Port available"
}

if (-not $FrontendOnly) { Assert-PortFree -Port $BackendPort  -Label 'backend'  -PortSwitch '-BackendPort' }
if (-not $BackendOnly)  { Assert-PortFree -Port $FrontendPort -Label 'frontend' -PortSwitch '-FrontendPort' }

Write-Host ''


# ------------------------------------------------------------------ backend
if (-not $FrontendOnly) {
    Write-Doing 'Starting backend...'
    $backendLog = Join-Path $ProjectRoot 'backend-start.log'
    $backend = Start-Process -FilePath $VenvPython `
        -ArgumentList '-m', 'uvicorn', 'backend.main:app',
                      '--host', '127.0.0.1', '--port', $BackendPort `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $backendLog `
        -RedirectStandardError  "$backendLog.err" `
        -PassThru
    Register-Pid -Id $backend.Id
    Write-Info "backend PID $($backend.Id) - log: backend-start.log"

    # Readiness gate: poll the real health endpoint, do not just sleep and assume.
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if ($backend.HasExited) {
            Write-Fail "backend exited early (code $($backend.ExitCode))"
            Show-LogTail $backendLog
            Show-LogTail "$backendLog.err"
            Stop-TrackedProcesses -OnlyThisRun
            Write-Host ''
            Write-Plain "  Inspect: backend-start.log  (and backend-start.log.err)"
            exit 1
        }
        if (Test-HttpOk -Url "$BackendUrl/health" -TimeoutSec 2) { $ready = $true; break }
    }

    if (-not $ready) {
        Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
        Show-LogTail $backendLog
        Show-LogTail "$backendLog.err"
        Clear-State
        Write-Host ''
        Write-Plain "  Inspect: backend-start.log  (and backend-start.log.err)"
        exit 1
    }
    Write-Check "Backend ready: $BackendUrl"
}

# ----------------------------------------------------------------- frontend
if (-not $BackendOnly) {
    Write-Doing 'Starting frontend...'
    $frontendLog = Join-Path $ProjectRoot 'frontend-start.log'
    $frontend = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev', '--', '--port', $FrontendPort, '--strictPort' `
        -WorkingDirectory $FrontendDir `
        -RedirectStandardOutput $frontendLog `
        -RedirectStandardError  "$frontendLog.err" `
        -PassThru
    Register-Pid -Id $frontend.Id
    Write-Info "frontend PID $($frontend.Id) - log: frontend-start.log"

    $served = $false
    for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 500
        if ($frontend.HasExited) {
            Write-Fail "frontend exited early (code $($frontend.ExitCode))"
            Show-LogTail $frontendLog
            Show-LogTail "$frontendLog.err"
            # Roll back this run's backend too, so no half-started system is
            # left behind. -OnlyThisRun keeps any healthy instance already
            # running on the standard ports recorded and reachable.
            Stop-TrackedProcesses -OnlyThisRun
            Write-Host ''
            Write-Plain "  Inspect: frontend-start.log  (and frontend-start.log.err)"
            exit 1
        }
        if (Test-HttpOk -Url $FrontendUrl -TimeoutSec 2) { $served = $true; break }
    }

    if (-not $served) {
        Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
        Show-LogTail $frontendLog
        Show-LogTail "$frontendLog.err"
        # Roll back this run's backend as well: never leave a half-started system.
        Stop-TrackedProcesses -OnlyThisRun
        Write-Host ''
        Write-Plain "  Inspect: frontend-start.log  (and frontend-start.log.err)"
        exit 1
    }
    Write-Check "Frontend ready: $FrontendUrl"
}

# ------------------------------------------------------------------- report
# Every state below is read back from the running backend. Nothing is assumed:
# with no Arduino attached this prints DISCONNECTED, and that is correct.
$h = Get-BackendHealth

Write-Host ''
Write-Line
Write-Host ' SYSTEM READY' -ForegroundColor Green
Write-Line
Write-Host ''
Write-Plain "Frontend : $FrontendUrl"
Write-Plain "Backend  : $BackendUrl"
Write-Host ''

if ($h -and $h.services) {
    $svc = $h.services
    Write-Plain "Arduino  : $($svc.arduino)"
    # CV is deliberately NOT auto-started: the operator starts it from the UI.
    # While CV is stopped the camera is genuinely not open, so report that
    # plainly instead of claiming a camera is "available".
    $cameraLine = $svc.camera
    if ($svc.cv -eq 'STOPPED' -and $svc.camera -ne 'CONNECTED') {
        $cameraLine = 'NOT IN USE (CV not started)'
    }
    Write-Plain "Camera   : $cameraLine"
    Write-Plain "CV       : $($svc.cv)"
    $mlLine = $svc.ml
    if ($svc.ml -eq 'LOADED' -and $svc.ml_model) { $mlLine = "$($svc.ml) ($($svc.ml_model))" }
    Write-Plain "ML       : $mlLine"
    Write-Plain "Database : $($svc.database.status) ($($svc.database.rows) records)"
    Write-Host ''

    if ($svc.arduino -ne 'CONNECTED') {
        Write-Info 'No Arduino detected. That is a valid state - connect one,'
        Write-Info 'then press RUN PROGRAM in the UI. See README Troubleshooting.'
    }
    if ($svc.cv -eq 'STOPPED') {
        Write-Info 'CV is stopped on purpose. Start it from the Computer Vision page.'
    }
} else {
    Write-Warn 'Could not read component state from the backend.'
}

Write-Host ''
Write-Plain 'Open the frontend to begin. Demo flow:'
Write-Plain '  1. Connect the Arduino          6. Open Computer Vision -> Start'
Write-Plain '  2. Check Arduino status         7. Verify head count in the frame'
Write-Plain '  3. Press RUN PROGRAM            8. Review ML / History / System'
Write-Plain '  4. Watch Live Monitoring'
Write-Plain '  5. (optional) inspect ML'
Write-Host ''
Write-Info "Stop everything with:  .\start.ps1 -Stop"
Write-Info "Logs: backend-start.log, frontend-start.log"

if (-not $NoBrowser -and -not $BackendOnly) {
    Write-Host ''
    Write-Info 'Opening browser...'
    Start-Process $FrontendUrl
}
