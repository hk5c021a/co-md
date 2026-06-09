# Test Environment Management Script
# Usage:
#   .\scripts\test-env.ps1 start    - Start test infrastructure
#   .\scripts\test-env.ps1 stop    - Stop and remove test infrastructure
#   .\scripts\test-env.ps1 status   - Check status of test infrastructure
#   .\scripts\test-env.ps1 cleanup  - Stop and remove everything including images

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "status", "cleanup")]
    [string]$Action
)

$COMPOSE_FILE = "docker-compose.test.yml"

function Log-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Log-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Log-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Log-Error "Docker is not installed"
        exit 1
    }
}

switch ($Action) {
    "start" {
        Test-Docker
        Log-Info "Pulling test images..."
        docker compose -f $COMPOSE_FILE pull

        Log-Info "Starting test infrastructure..."
        docker compose -f $COMPOSE_FILE up -d

        Log-Info "Waiting for services to be healthy..."
        Start-Sleep -Seconds 5

        Log-Info "Test infrastructure is ready!"
        Write-Host ""
        Write-Host "Test environment endpoints:"
        Write-Host "  PostgreSQL: localhost:5434"
        Write-Host "  Redis: localhost:6380"
        Write-Host "  RustFS: localhost:9001"
        Write-Host ""
        Write-Host "Environment variables for tests:"
        Write-Host "  DATABASE_URL=postgresql://test_user:test_password@localhost:5434/collab_test_db"
        Write-Host "  REDIS_URL=redis://localhost:6380"
        Write-Host "  RUSTFS_URL=http://localhost:9001"
    }

    "stop" {
        Test-Docker
        Log-Info "Stopping test infrastructure..."
        docker compose -f $COMPOSE_FILE down -v --rmi local
        Log-Info "Test infrastructure stopped!"
    }

    "status" {
        Test-Docker
        Write-Host "=== Test Infrastructure Status ==="
        docker compose -f $COMPOSE_FILE ps
    }

    "cleanup" {
        Test-Docker
        Log-Info "Stopping and removing test containers..."
        docker compose -f $COMPOSE_FILE down -v --rmi local

        Log-Info "Removing test images..."
        docker rmi postgres:16-alpine -Force 2>$null
        docker rmi redis:7-alpine -Force 2>$null
        docker rmi rustfs/rustfs:latest -Force 2>$null

        Log-Info "Cleanup complete!"
    }

    default {
        Write-Host "Usage: .\scripts\test-env.ps1 {start|stop|status|cleanup}"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  start   - Pull images and start test infrastructure"
        Write-Host "  stop    - Stop and remove test containers"
        Write-Host "  status  - Show status of test infrastructure"
        Write-Host "  cleanup - Stop containers, remove volumes and images"
    }
}
