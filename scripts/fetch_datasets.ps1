<#
.SYNOPSIS
    Downloads the real dataset used by the Phase 8 machine learning pipeline.

.DESCRIPTION
    UCI "Room Occupancy Estimation"
    https://archive.ics.uci.edu/dataset/864/occupancy+detection

    Measured profile of the file this script fetches:
        10,129 rows x 19 columns, 0 missing values, 0 duplicate rows
        target Room_Occupancy_Count: {0: 8228, 1: 459, 2: 748, 3: 694}

    The CSV is NOT committed (see .gitignore), so every machine must fetch it
    once before training.

.EXAMPLE
    .\scripts\fetch_datasets.ps1
    .\backend\.venv\Scripts\python.exe ml\scripts\train.py
#>
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot 'ml\datasets'
$csvPath = Join-Path $dataDir 'occupancy_detection.csv'

$url = 'https://archive.ics.uci.edu/static/public/864/data.csv'

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (Test-Path $csvPath) {
    $size = (Get-Item $csvPath).Length
    Write-Host "Dataset already present: $csvPath ($size bytes)"
    exit 0
}

Write-Host 'Downloading UCI Room Occupancy Estimation dataset...'
Write-Host "  source: $url"
Write-Host "  target: $csvPath"

try {
    Invoke-WebRequest -Uri $url -OutFile $csvPath -UseBasicParsing -TimeoutSec 300
} catch {
    Write-Error "Download failed: $($_.Exception.Message)"
    Write-Host ''
    Write-Host 'Alternative: download data.csv manually from'
    Write-Host '  https://archive.ics.uci.edu/dataset/864/occupancy+detection'
    Write-Host "and save it to: $csvPath"
    exit 1
}

$rows = (Get-Content $csvPath | Measure-Object -Line).Lines
Write-Host "Done. $((Get-Item $csvPath).Length) bytes, $rows lines."
Write-Host ''
Write-Host 'Next: train the models'
Write-Host '  .\backend\.venv\Scripts\python.exe ml\scripts\train.py'
