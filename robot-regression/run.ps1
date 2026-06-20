# Execução regressão Robot — Exeq Admin
param(
    [string]$Target = "tests",
    [switch]$Headless,
    [switch]$Trace,
    [string]$Include = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv\Scripts\activate.ps1")) {
    Write-Host "Criando venv..."
    python -m venv .venv
    .\.venv\Scripts\activate
    pip install -r requirements.txt
    rfbrowser init
} else {
    .\.venv\Scripts\activate
}

$args = @("-d", "./results", $Target)
if ($Headless) { $args = @("--variable", "HEADLESS:True") + $args }
if ($Trace) { $args = @("--loglevel", "TRACE") + $args }
if ($Include) { $args = @("-i", $Include) + $args }

robot @args
exit $LASTEXITCODE
