#Requires -Version 5.1
<#
.SYNOPSIS
  Bootstrap local do exeq-nfse-core (infra, deps, DB, testes de emissão).

.DESCRIPTION
  Automatiza o setup para retomar desenvolvimento/testes em máquina nova:
    1. Valida Node >= 22, npm e Docker
    2. Cria .env a partir de .env.example (ajusta portas em conflito)
    3. Sobe Postgres (55432) + Redis (6380) via Docker Compose
    4. npm install + build @exeq/shared + db:setup
    5. (opcional) Roda testes de emissão Fase 4/5

.EXAMPLE
  .\setup-local.ps1

.EXAMPLE
  .\setup-local.ps1 -RunTests

.EXAMPLE
  .\setup-local.ps1 -ResetDb -RunTests
#>
[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$ResetDb,
    [switch]$RunTests,
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
Set-Location $Root

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    !!  $Message" -ForegroundColor Yellow
}

function Test-PortInUse([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

function Test-CommandExists([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NodeMajorVersion {
    $raw = (node -v) -replace '^v', ''
    return [int]($raw.Split('.')[0])
}

function Wait-DockerHealthy {
    param(
        [string]$ServiceName,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 2
    )
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        $status = docker compose ps --format json 2>$null | ConvertFrom-Json |
            Where-Object { $_.Service -eq $ServiceName }
        if ($status -and $status.Health -eq "healthy") {
            return $true
        }
        if ($status -and $status.State -eq "running" -and [string]::IsNullOrEmpty($status.Health)) {
            return $true
        }
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

function Invoke-Npm {
    param([Parameter(Mandatory = $true)][string[]]$NpmArgs)
    & npm @NpmArgs
    if ($LASTEXITCODE -ne 0) {
        throw "npm $($NpmArgs -join ' ') falhou (exit $LASTEXITCODE)"
    }
}

function Set-EnvLine([string]$Path, [string]$Key, [string]$Value) {
    $pattern = "^\s*$([regex]::Escape($Key))\s*="
    $line = "$Key=$Value"
    $content = Get-Content -Path $Path -Raw
    if ($content -match "(?m)$pattern") {
        $newContent = [regex]::Replace($content, "(?m)$pattern.*", $line)
        Set-Content -Path $Path -Value $newContent.TrimEnd() -NoNewline
        Add-Content -Path $Path -Value "`n"
    } else {
        Add-Content -Path $Path -Value $line
    }
}

Write-Host ""
Write-Host " exeq-nfse-core - setup local" -ForegroundColor White
Write-Host " $Root" -ForegroundColor DarkGray

# --- Pré-requisitos ---
Write-Step "Verificando pré-requisitos"

if (-not (Test-CommandExists "node")) {
    throw "Node.js não encontrado. Instale Node >= 22: https://nodejs.org/"
}
$nodeMajor = Get-NodeMajorVersion
if ($nodeMajor -lt 22) {
    throw "Node.js $nodeMajor detectado; exige >= 22."
}
Write-Ok "Node $(node -v)"

if (-not (Test-CommandExists "npm")) {
    throw "npm não encontrado."
}
Write-Ok "npm $(npm -v)"

if (-not $SkipDocker) {
    if (-not (Test-CommandExists "docker")) {
        throw "Docker não encontrado. Instale Docker Desktop e tente novamente."
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker instalado mas não está rodando. Inicie o Docker Desktop."
    }
    Write-Ok "Docker $(docker -v)"
}

# --- .env ---
Write-Step "Configurando .env"

$envPath = Join-Path $Root ".env"
$envExample = Join-Path $Root ".env.example"

if (-not (Test-Path $envPath)) {
    if (-not (Test-Path $envExample)) {
        throw ".env.example não encontrado em $Root"
    }
    Copy-Item $envExample $envPath
    Write-Ok ".env criado a partir de .env.example"

    # Ajustes para dev/testes locais e conflitos comuns de porta
    Set-EnvLine $envPath "NF_SYNC_PROCESSING" "true"
    Set-EnvLine $envPath "WEBHOOK_SYNC_PROCESSING" "true"
    Set-EnvLine $envPath "GATEWAY_SYNC_PROCESSING" "true"

    if (Test-PortInUse 3000) {
        Set-EnvLine $envPath "PORT" "3002"
        Write-Warn "Porta 3000 ocupada - PORT=3002"
    }

    # Redis do compose expõe 6380; 6379 costuma conflitar com outros projetos
    if (Test-PortInUse 6379) {
        Set-EnvLine $envPath "REDIS_URL" "redis://localhost:6380"
        Write-Warn "Porta 6379 ocupada - REDIS_URL=redis://localhost:6380"
    } else {
        Set-EnvLine $envPath "REDIS_URL" "redis://localhost:6380"
        Write-Ok "REDIS_URL=redis://localhost:6380 (porta do docker-compose)"
    }
} else {
    Write-Ok ".env já existe (não alterado)"
}

# --- Docker ---
if (-not $SkipDocker) {
    Write-Step "Infra Docker (Postgres :55432, Redis :6380)"

    if ($ResetDb) {
        Write-Warn "ResetDb: removendo volumes..."
        docker compose down -v
        if ($LASTEXITCODE -ne 0) { throw "docker compose down -v falhou" }
    }

    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up -d falhou" }

    Write-Host "    Aguardando Postgres..."
    if (-not (Wait-DockerHealthy -ServiceName "postgres")) {
        throw "Postgres não ficou healthy a tempo. Verifique: docker compose logs postgres"
    }
    Write-Ok "Postgres healthy"

    Write-Host "    Aguardando Redis..."
    if (-not (Wait-DockerHealthy -ServiceName "redis")) {
        throw "Redis não ficou healthy a tempo. Verifique: docker compose logs redis"
    }
    Write-Ok "Redis healthy"

    docker compose ps
}

# --- Dependências ---
if (-not $SkipInstall) {
    Write-Step "npm install"
    Invoke-Npm -NpmArgs @("install")
    Write-Ok "Dependências instaladas"
} else {
    Write-Warn "SkipInstall - pulando npm install"
}

# --- Build shared (obrigatório antes do seed) ---
Write-Step "Build @exeq/shared"
Invoke-Npm -NpmArgs @("run", "build", "-w", "@exeq/shared")
Write-Ok "@exeq/shared compilado"

# --- Banco ---
Write-Step "Migrations + seed (db:setup)"
Invoke-Npm -NpmArgs @("run", "db:setup")
Write-Ok "Banco pronto (tenant piloto-sp)"

# --- Testes opcionais ---
if ($RunTests) {
    Write-Step "Testes de emissão (Fase 4 + 5)"
    Invoke-Npm -NpmArgs @(
        "run", "test", "-w", "@exeq/api", "--",
        "tests/phase4.functional.test.ts",
        "tests/phase5.functional.test.ts"
    )
    Write-Ok "Testes de emissão PASS"
}

# --- Resumo ---
Write-Host ""
Write-Host " Setup concluído." -ForegroundColor Green
Write-Host ""
Write-Host " Próximos passos:" -ForegroundColor White
Write-Host "   docker compose ps          # status infra"
Write-Host "   npm run dev                # API (porta no .env, ex.: 3002)"
Write-Host "   npm run dev:admin          # Admin http://localhost:5173"
Write-Host "   npm run homolog            # infra + API + admin"
Write-Host ""
Write-Host " Login dev:" -ForegroundColor White
Write-Host "   email:    admin@piloto.local"
Write-Host "   password: changeme"
Write-Host ""
Write-Host " Testes:" -ForegroundColor White
Write-Host "   npm run test -w @exeq/api -- tests/phase4.functional.test.ts"
Write-Host "   npm run test:phase9"
Write-Host "   npm test                   # suíte completa (~8 min)"
Write-Host ""
