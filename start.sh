#!/bin/bash
set -e

# ===========================================
# MicroSeem Quick Start
# ===========================================
# One-command deployment for MicroSeem

cd "$(dirname "${BASH_SOURCE[0]}")"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  __  __ _                ____                      "
echo " |  \/  (_) ___ _ __ ___/ ___|  ___  ___ _ __ ___   "
echo " | |\/| | |/ __| '__/ _ \___ \ / _ \/ _ \ '\` _ \  "
echo " | |  | | | (__| | | (_) |__) |  __/  __/ | | | | | "
echo " |_|  |_|_|\___|_|  \___/____/ \___|\___|_| |_| |_| "
echo -e "${NC}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is required but not installed.${NC}"
    echo "Install Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    echo -e "${RED}Docker Compose is required but not installed.${NC}"
    exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating configuration file...${NC}"
    cp .env.example .env

    # Generate random password
    if command -v openssl &> /dev/null; then
        RANDOM_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
        sed -i.bak "s/change_me_to_a_secure_password/${RANDOM_PASS}/" .env 2>/dev/null || \
        sed -i '' "s/change_me_to_a_secure_password/${RANDOM_PASS}/" .env
        rm -f .env.bak
    fi

    echo ""
    echo -e "${YELLOW}=================================================${NC}"
    echo -e "${YELLOW}  ACTION REQUIRED: Configure Clerk Authentication${NC}"
    echo -e "${YELLOW}=================================================${NC}"
    echo ""
    echo "1. Go to https://dashboard.clerk.com and create an app"
    echo "2. Copy your API keys"
    echo "3. Edit .env and set:"
    echo "   - CLERK_SECRET_KEY"
    echo "   - VITE_CLERK_PUBLISHABLE_KEY"
    echo ""
    echo -e "Run ${GREEN}nano .env${NC} or ${GREEN}vim .env${NC} to edit"
    echo ""
    read -p "Press Enter when you've configured Clerk keys..."
fi

# Check if Clerk keys are configured
if grep -q "sk_test_xxxx" .env 2>/dev/null; then
    echo -e "${RED}Error: Clerk keys not configured in .env${NC}"
    echo "Edit .env and add your Clerk API keys from https://dashboard.clerk.com"
    exit 1
fi

# Fix vm.max_map_count for Elasticsearch (Linux only)
if [ -f /proc/sys/vm/max_map_count ]; then
    current=$(cat /proc/sys/vm/max_map_count)
    if [ "$current" -lt 262144 ]; then
        echo -e "${YELLOW}Setting vm.max_map_count for Elasticsearch...${NC}"
        sudo sysctl -w vm.max_map_count=262144 2>/dev/null || true
    fi
fi

# Start services
echo ""
echo -e "${BLUE}Starting MicroSeem...${NC}"
echo "This may take a few minutes on first run."
echo ""

$COMPOSE up -d --build

# Wait for services
echo ""
echo -e "${BLUE}Waiting for services to be ready...${NC}"

max_wait=180
waited=0
while [ $waited -lt $max_wait ]; do
    if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
        break
    fi
    echo -ne "\r  Starting... ${waited}s"
    sleep 5
    waited=$((waited + 5))
done
echo ""

# Check if started successfully
if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}=================================================${NC}"
    echo -e "${GREEN}  MicroSeem is running!${NC}"
    echo -e "${GREEN}=================================================${NC}"
    echo ""
    echo "  Open in browser: http://localhost:3000"
    echo ""
    echo "  Other services:"
    echo "    - API:     http://localhost:8080"
    echo "    - Kibana:  http://localhost:5601"
    echo ""
    echo "  Commands:"
    echo "    - View logs:  $COMPOSE logs -f"
    echo "    - Stop:       $COMPOSE down"
    echo "    - Restart:    $COMPOSE restart"
    echo ""
else
    echo -e "${RED}Services didn't start properly. Check logs:${NC}"
    echo "  $COMPOSE logs"
fi
