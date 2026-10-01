<#
.SYNOPSIS
    Downloads the YuNet face-detection model required by the Phase 6 CV engine.

.DESCRIPTION
    The model is a 227 KB ONNX file from the official OpenCV model zoo. It is
    NOT committed to the repository (see .gitignore), so every machine must
    fetch it once before face detection can run.

.EXAMPLE
    .\scripts\fetch_cv_models.ps1
#>
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$modelDir = Join-Path $projectRoot 'cv\models'
$modelPath = Join-Path $modelDir 'face_detection_yunet_2023mar.onnx'

$url = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'

New-Item -ItemType Directory -Force -Path $modelDir | Out-Null

if (Test-Path $modelPath) {
    $size = (Get-Item $modelPath).Length
    Write-Host "Model already present: $modelPath ($size bytes)"
    Write-Host 'Delete it and re-run to force a fresh download.'
    exit 0
}

Write-Host "Downloading YuNet face detection model..."
Write-Host "  source: $url"
Write-Host "  target: $modelPath"

try {
    Invoke-WebRequest -Uri $url -OutFile $modelPath -UseBasicParsing -TimeoutSec 180
} catch {
    Write-Error "Download failed: $($_.Exception.Message)"
    Write-Host ''
    Write-Host 'Alternative: download the file manually from'
    Write-Host '  https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet'
    Write-Host "and save it to: $modelPath"
    exit 1
}

$size = (Get-Item $modelPath).Length
Write-Host "Done. Downloaded $size bytes."
Write-Host ''
Write-Host 'Verify the backend can load it:'
Write-Host '  uvicorn backend.main:app --port 8000'
Write-Host '  curl -X POST http://localhost:8000/api/cv/start'
