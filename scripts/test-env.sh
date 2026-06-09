#!/bin/bash
# Test Environment Management Script
# Usage:
#   ./scripts/test-env.sh start    - Start test infrastructure
#   ./scripts/test-env.sh stop     - Stop and remove test infrastructure
#   ./scripts/test-env.sh status    - Check status of test infrastructure

set -e

COMPOSE_FILE="docker-compose.test.yml"
PROJECT_NAME="collab-test"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
}

start() {
    log_info "Pulling test images..."
    docker compose -f "$COMPOSE_FILE" pull

    log_info "Starting test infrastructure..."
    docker compose -f "$COMPOSE_FILE" up -d

    log_info "Waiting for services to be healthy..."
    sleep 5

    # Check service status
    if docker compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
        log_info "Test infrastructure is ready!"
        echo ""
        echo "Test environment endpoints:"
        echo "  PostgreSQL: localhost:5434"
        echo "  Redis: localhost:6380"
        echo "  RustFS: localhost:9001"
        echo ""
        echo "Environment variables for tests:"
        echo "  DATABASE_URL=postgresql://test_user:test_password@localhost:5434/collab_test_db"
        echo "  REDIS_URL=redis://localhost:6380"
        echo "  RUSTFS_URL=http://localhost:9001"
    else
        log_warn "Some services may not be fully ready yet"
        docker compose -f "$COMPOSE_FILE" ps
    fi
}

stop() {
    log_info "Stopping test infrastructure..."
    docker compose -f "$COMPOSE_FILE" down -v --rmi local

    log_info "Test infrastructure cleaned up!"
}

status() {
    echo "=== Test Infrastructure Status ==="
    docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "No test infrastructure running"
}

cleanup() {
    log_info "Stopping and removing test containers..."
    docker compose -f "$COMPOSE_FILE" down -v --rmi local

    log_info "Removing test images..."
    docker rmi postgres:16-alpine 2>/dev/null || true
    docker rmi redis:7-alpine 2>/dev/null || true
    docker rmi rustfs/rustfs:latest 2>/dev/null || true

    log_info "Cleanup complete!"
}

case "$1" in
    start)
        check_docker
        start
        ;;
    stop)
        check_docker
        stop
        ;;
    status)
        check_docker
        status
        ;;
    cleanup)
        check_docker
        cleanup
        ;;
    *)
        echo "Usage: $0 {start|stop|status|cleanup}"
        echo ""
        echo "Commands:"
        echo "  start   - Pull images and start test infrastructure"
        echo "  stop    - Stop and remove test containers"
        echo "  status  - Show status of test infrastructure"
        echo "  cleanup - Stop containers, remove volumes and images"
        exit 1
        ;;
esac
