# Start CO-MD development environment
# Usage: .\scripts\dev-start.ps1

$ErrorActionPreference = "Continue"

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

Write-Host "`n=== Starting Docker containers ===" -ForegroundColor Cyan
docker compose --env-file .env.dev.local -f docker-compose.yml -f docker-compose.dev.yml up -d

Write-Host "`n=== Starting dev servers ===" -ForegroundColor Cyan

$root = $PSScriptRoot | Split-Path -Parent

Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "pnpm --filter backend dev" -WorkingDirectory $root
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "pnpm --filter ws-server dev" -WorkingDirectory $root
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "pnpm --filter frontend dev" -WorkingDirectory $root

Write-Host "`n=== Services ===" -ForegroundColor Green
Write-Host "  Frontend   https://localhost:5173"
Write-Host "  Backend    https://localhost:3000"
Write-Host "  WebSocket  wss://localhost:4000"
Write-Host "  Mailpit    http://localhost:8025"
