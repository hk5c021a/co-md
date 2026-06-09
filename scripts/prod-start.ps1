# Start CO-MD production environment (local test mode)
# Usage: .\scripts\prod-start.ps1
#
# Builds frontend + backend, starts Docker infrastructure,
# then runs backend + ws-server in production mode.
# Uses .env.dev.local for Docker and .env.prod.local values for services.

$ErrorActionPreference = "Continue"

$root = $PSScriptRoot | Split-Path -Parent

Write-Host "=== Killing stale processes ===" -ForegroundColor Cyan
$ports = @(3000, 4000, 5173, 5174)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force; Write-Host "  Killed PID $($c.OwningProcess) (port $port)" -ForegroundColor Gray }
    catch { }
  }
  if (-not $conns) { Write-Host "  Port $port free" -ForegroundColor Gray }
}

Write-Host "`n=== Building frontend ===" -ForegroundColor Cyan
Push-Location $root
try {
  pnpm --filter frontend build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  Frontend build failed!" -ForegroundColor Red
    exit 1
  }
}
finally { Pop-Location }
Write-Host "  Frontend build OK" -ForegroundColor Green

Write-Host "`n=== Starting Docker containers ===" -ForegroundColor Cyan
docker compose --env-file .env.dev.local up -d

Write-Host "`n=== Starting production services ===" -ForegroundColor Cyan

# Load production-like env values from .env.dev.local
$envFile = Join-Path $root '.env.dev.local'
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)' } | ForEach-Object {
    $k, $v = $_.Trim() -split '=', 2
    if ($k -notmatch '^(VITE_|OTEL_|DOMAIN|RESTART_POLICY|POSTGRES_|REDIS_|RUSTFS_)') {
      [Environment]::SetEnvironmentVariable($k, $v.Trim('"'), 'Process')
    }
  }
  Write-Host "  Loaded env from $envFile" -ForegroundColor Gray
} else {
  Write-Host "  WARNING: $envFile not found, using defaults" -ForegroundColor Yellow
}
$env:NODE_ENV = "production"
$env:VITE_DEV = "false"
# Override hostnames for local test mode
$env:DATABASE_URL = $env:DATABASE_URL -replace '@[^:]+:', '@localhost:'
$env:REDIS_URL = $env:REDIS_URL -replace '@[^:]+:', '@localhost:'
$env:RUSTFS_ENDPOINT = 'http://localhost:9000'
$env:BACKEND_URL = $env:BACKEND_URL -replace 'https://[^:]+:', 'https://localhost:'
$env:CORS_ORIGIN = $env:CORS_ORIGIN -replace 'https://[^/]+', 'https://localhost:3000'
$env:PASSWORD_RESET_BASE_URL = $env:CORS_ORIGIN

# Start ws-server (depends on Redis)
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "node --enable-source-maps apps/ws-server/dist/index.js" -WorkingDirectory $root

# Start backend (depends on PostgreSQL, Redis, RustFS)
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "node --enable-source-maps apps/backend/dist/index.js" -WorkingDirectory $root

Start-Sleep -Seconds 5

Write-Host "`n=== Services ===" -ForegroundColor Green
Write-Host "  Frontend   https://localhost:3000  (SPA + API + static, CSP nonce)"
Write-Host "  WebSocket  wss://localhost:4000   (collaboration)"
Write-Host "  Mailpit    http://localhost:8025  (SMTP catch-all)"
Write-Host "  PostgreSQL localhost:5433"
Write-Host "  Redis      localhost:6379"
Write-Host ""
Write-Host "Note: Frontend is served by backend (CSP nonce injection)."
Write-Host "      No separate Vite dev server or Nginx."
