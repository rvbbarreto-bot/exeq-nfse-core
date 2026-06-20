# S1-04 — Configura webhook Evolution → n8n (instância nfse-piloto)
# Uso: npm run channel:configure-webhook
# Pré-requisito: channel stack up (npm run channel:up)

param(
  [string]$Instance = "exeq-nfse-core",
  [string]$WebhookUrl = "http://n8n:5678/webhook/exeq-nfse-whatsapp",
  [string]$EvolutionBase = "http://127.0.0.1:8082"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envChannel = Join-Path $root ".env.channel"
$apiKey = $null

if (Test-Path $envChannel) {
  Get-Content $envChannel | ForEach-Object {
    if ($_ -match '^EVOLUTION_API_KEY=(.+)$') { $apiKey = $matches[1].Trim() }
    if ($_ -match '^EVOLUTION_INSTANCE=(.+)$' -and -not $PSBoundParameters.ContainsKey('Instance')) {
      $Instance = $matches[1].Trim()
    }
  }
}

if (-not $apiKey) { throw "EVOLUTION_API_KEY ausente em .env.channel" }

$body = @{
  webhook = @{
    enabled         = $true
    url             = $WebhookUrl
    webhookByEvents = $false
    webhookBase64   = $false
    events          = @("MESSAGES_UPSERT")
  }
} | ConvertTo-Json -Depth 5 -Compress

$headers = @{ apikey = $apiKey; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "$EvolutionBase/webhook/set/$Instance" -Method POST -Headers $headers -Body $body | Out-Null
$find = Invoke-RestMethod -Uri "$EvolutionBase/webhook/find/$Instance" -Method GET -Headers @{ apikey = $apiKey }

Write-Host "OK - Evolution webhook $Instance" -ForegroundColor Green
$find | ConvertTo-Json -Depth 5
