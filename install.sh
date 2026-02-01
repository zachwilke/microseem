#!/bin/bash
set -e

# ===========================================
# MicroSeem Installer
# ===========================================
# Self-hosted Microsoft 365 SIEM Platform
# https://github.com/yourusername/microseem

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${BLUE}"
    echo "  __  __ _                ____                      "
    echo " |  \/  (_) ___ _ __ ___/ ___|  ___  ___ _ __ ___   "
    echo " | |\/| | |/ __| '__/ _ \___ \ / _ \/ _ \ '_ \` _ \  "
    echo " | |  | | | (__| | | (_) |__) |  __/  __/ | | | | | "
    echo " |_|  |_|_|\___|_|  \___/____/ \___|\___|_| |_| |_| "
    echo -e "${NC}"
    echo "  Microsoft 365 SIEM Platform - Self-Hosted Edition"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_warn "Running as root. Consider using a non-root user with docker permissions."
    fi
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed."
        echo ""
        echo "Install Docker using:"
        echo "  curl -fsSL https://get.docker.com | sh"
        echo "  sudo usermod -aG docker \$USER"
        echo ""
        echo "Then log out and back in, and run this script again."
        exit 1
    fi
    log_success "Docker is installed"
}

check_docker_compose() {
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
        log_success "Docker Compose (plugin) is installed"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        log_success "Docker Compose (standalone) is installed"
    else
        log_error "Docker Compose is not installed."
        echo ""
        echo "Install Docker Compose using:"
        echo "  sudo apt install docker-compose-plugin"
        echo ""
        exit 1
    fi
}

check_system_requirements() {
    log_info "Checking system requirements..."

    # Check memory (need at least 4GB for ES + Kafka + API)
    total_mem=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$total_mem" -lt 4 ]; then
        log_warn "System has ${total_mem}GB RAM. Recommended: 4GB minimum, 8GB+ for production."
    else
        log_success "Memory: ${total_mem}GB"
    fi

    # Check disk space (need at least 20GB)
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$available_space" -lt 20 ]; then
        log_warn "Only ${available_space}GB disk space available. Recommended: 20GB+"
    else
        log_success "Disk space: ${available_space}GB available"
    fi

    # Check vm.max_map_count for Elasticsearch
    max_map_count=$(cat /proc/sys/vm/max_map_count 2>/dev/null || echo "0")
    if [ "$max_map_count" -lt 262144 ]; then
        log_warn "vm.max_map_count is $max_map_count (Elasticsearch needs 262144)"
        echo ""
        echo "Fix with:"
        echo "  sudo sysctl -w vm.max_map_count=262144"
        echo "  echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf"
        echo ""
        read -p "Apply fix now? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo sysctl -w vm.max_map_count=262144
            echo 'vm.max_map_count=262144' | sudo tee -a /etc/sysctl.conf
            log_success "vm.max_map_count updated"
        fi
    else
        log_success "vm.max_map_count: $max_map_count"
    fi
}

setup_env() {
    if [ -f .env ]; then
        log_info ".env file already exists"
        read -p "Overwrite existing .env? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Keeping existing .env file"
            return
        fi
    fi

    log_info "Setting up environment configuration..."
    cp .env.example .env

    # Generate random password for PostgreSQL
    RANDOM_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    sed -i "s/change_me_to_a_secure_password/${RANDOM_PASSWORD}/" .env

    echo ""
    echo -e "${YELLOW}==================================================${NC}"
    echo -e "${YELLOW}  IMPORTANT: Configure Clerk Authentication${NC}"
    echo -e "${YELLOW}==================================================${NC}"
    echo ""
    echo "1. Go to https://dashboard.clerk.com"
    echo "2. Create a new application (or use existing)"
    echo "3. Get your API keys from Settings > API Keys"
    echo "4. Edit .env and fill in:"
    echo "   - CLERK_SECRET_KEY"
    echo "   - VITE_CLERK_PUBLISHABLE_KEY"
    echo ""
    read -p "Press Enter to edit .env now (or Ctrl+C to edit later)..."

    if command -v nano &> /dev/null; then
        nano .env
    elif command -v vim &> /dev/null; then
        vim .env
    else
        vi .env
    fi

    log_success "Environment configured"
}

setup_geoip() {
    if [ -f GeoLite2-City.mmdb ]; then
        log_success "GeoIP database found"
        return
    fi

    log_warn "GeoIP database not found (optional - provides IP geolocation)"
    echo ""
    echo "To enable IP geolocation:"
    echo "1. Sign up at https://www.maxmind.com/en/geolite2/signup"
    echo "2. Download GeoLite2-City.mmdb"
    echo "3. Place it in: $SCRIPT_DIR/GeoLite2-City.mmdb"
    echo ""

    # Create empty file so Docker doesn't fail
    touch GeoLite2-City.mmdb
}

pull_images() {
    log_info "Pulling Docker images (this may take a few minutes)..."
    $COMPOSE_CMD pull
    log_success "Images pulled"
}

build_images() {
    log_info "Building application images..."
    $COMPOSE_CMD build
    log_success "Images built"
}

start_services() {
    log_info "Starting services..."
    $COMPOSE_CMD up -d

    echo ""
    log_info "Waiting for services to be healthy..."

    # Wait for services (timeout after 120 seconds)
    timeout=120
    elapsed=0
    while [ $elapsed -lt $timeout ]; do
        healthy_count=$($COMPOSE_CMD ps --format json 2>/dev/null | grep -c '"Health": "healthy"' || echo "0")
        total_count=$($COMPOSE_CMD ps --format json 2>/dev/null | grep -c '"Service"' || echo "0")

        # Simple fallback check
        if $COMPOSE_CMD ps | grep -q "healthy"; then
            break
        fi

        echo -ne "\r  Waiting... ${elapsed}s"
        sleep 5
        elapsed=$((elapsed + 5))
    done
    echo ""

    log_success "Services started"
}

show_status() {
    echo ""
    echo -e "${GREEN}==================================================${NC}"
    echo -e "${GREEN}  MicroSeem Installation Complete!${NC}"
    echo -e "${GREEN}==================================================${NC}"
    echo ""

    # Get ports from .env or use defaults
    FRONTEND_PORT=${FRONTEND_PORT:-3000}
    API_PORT=${API_PORT:-8080}
    KIBANA_PORT=${KIBANA_PORT:-5601}

    echo "Services:"
    $COMPOSE_CMD ps
    echo ""
    echo "Access URLs:"
    echo "  - Web UI:    http://localhost:${FRONTEND_PORT}"
    echo "  - API:       http://localhost:${API_PORT}"
    echo "  - Kibana:    http://localhost:${KIBANA_PORT}"
    echo ""
    echo "Useful commands:"
    echo "  - View logs:       $COMPOSE_CMD logs -f"
    echo "  - Stop services:   $COMPOSE_CMD down"
    echo "  - Restart:         $COMPOSE_CMD restart"
    echo "  - Update:          git pull && $COMPOSE_CMD up -d --build"
    echo ""
    echo "Next steps:"
    echo "  1. Open http://localhost:${FRONTEND_PORT}"
    echo "  2. Sign in with Clerk"
    echo "  3. Create an organization"
    echo "  4. Add your Microsoft 365 tenant credentials"
    echo ""
}

uninstall() {
    log_warn "This will remove all MicroSeem containers and data!"
    read -p "Are you sure? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping and removing containers..."
        $COMPOSE_CMD down -v
        log_success "MicroSeem uninstalled"
        echo ""
        echo "Note: The source code and .env file remain. Delete manually if needed:"
        echo "  rm -rf $SCRIPT_DIR"
    fi
}

update() {
    log_info "Updating MicroSeem..."

    # Pull latest code
    if [ -d .git ]; then
        git pull
    fi

    # Rebuild and restart
    $COMPOSE_CMD pull
    $COMPOSE_CMD up -d --build

    log_success "MicroSeem updated"
    show_status
}

show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  install     Full installation (default)"
    echo "  start       Start all services"
    echo "  stop        Stop all services"
    echo "  restart     Restart all services"
    echo "  status      Show service status"
    echo "  logs        View logs (follow mode)"
    echo "  update      Pull latest and rebuild"
    echo "  uninstall   Remove containers and data"
    echo "  help        Show this help"
    echo ""
}

# Main
print_banner

case "${1:-install}" in
    install)
        check_root
        check_docker
        check_docker_compose
        check_system_requirements
        setup_env
        setup_geoip
        pull_images
        build_images
        start_services
        show_status
        ;;
    start)
        check_docker_compose
        $COMPOSE_CMD up -d
        show_status
        ;;
    stop)
        check_docker_compose
        $COMPOSE_CMD down
        log_success "Services stopped"
        ;;
    restart)
        check_docker_compose
        $COMPOSE_CMD restart
        show_status
        ;;
    status)
        check_docker_compose
        $COMPOSE_CMD ps
        ;;
    logs)
        check_docker_compose
        $COMPOSE_CMD logs -f
        ;;
    update)
        check_docker_compose
        update
        ;;
    uninstall)
        check_docker_compose
        uninstall
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
