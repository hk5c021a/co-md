#!/usr/bin/env pwsh
# CO-MD Production Database Migration
#
# Usage: .\scripts\migrate-prod.ps1
#
# Why: drizzle-kit is a devDependency and is stripped by pnpm deploy --prod,
# so MIGRATE_ON_STARTUP cannot work inside the Docker container. This script
# runs drizzle-kit from the HOST against the Docker database.

param(
  [string]$EnvFile = ".env.prod.local"
)

$ErrorActionPreference = "Stop"

# Load env vars from .env.prod.local
if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile. Run: cp .env.prod.local.example $EnvFile"
  exit 1
}
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)=(.*)') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim())
  }
}

$DB_USER = $env:POSTGRES_USER
$DB_PASS = $env:POSTGRES_PASSWORD
$DB_HOST = "localhost"
$DB_PORT = $env:POSTGRES_PORT ?? "5433"
$DB_NAME = $env:POSTGRES_DB
$DB_URL = "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

Write-Host "Running DB migration against $DB_HOST`:$DB_PORT/$DB_NAME ..."
$env:DATABASE_URL = $DB_URL

Push-Location "$PSScriptRoot/../apps/backend"
try {
  npx drizzle-kit push 2>&1
  Write-Host "Migration complete."
} finally {
  Pop-Location
}
