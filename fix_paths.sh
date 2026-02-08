#!/bin/bash
# Fix AirTime Paths Script
# Updates Nginx and systemd services to point to the current directory

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Assuming script is run from project root or finding it relative to script
# If run from airtime-server/backend/ or similar, we need to find the root.
# Let's assume the user runs it from the repo root /Users/ale/repo/Airtime/airtime

# Get absolute path of the current directory (project root)
PROJECT_DIR=$(pwd)

echo "=========================================="
echo "  AirTime Path Fixer"
echo "=========================================="
echo ""
echo -e "${BLUE}Setting project path to:${NC} $PROJECT_DIR"
echo ""

# 1. Fix Nginx Configuration
echo -e "${YELLOW}Updating Nginx configuration...${NC}"
if [ -f "$PROJECT_DIR/airtime-server/nginx.conf" ]; then
    # Create the new config content
    sed "s|/home/time/airtime|$PROJECT_DIR|g" "$PROJECT_DIR/airtime-server/nginx.conf" > /tmp/airtime_nginx.conf
    
    # Check if we need sudo (likely yes for /etc)
    sudo cp /tmp/airtime_nginx.conf /etc/nginx/sites-available/airtime
    rm /tmp/airtime_nginx.conf
    
    echo -e "${GREEN}✓${NC} Nginx config updated in /etc/nginx/sites-available/airtime"
else
    echo -e "${RED}Error: airtime-server/nginx.conf not found in current directory${NC}"
fi

# 2. Fix Systemd Services
echo ""
echo -e "${YELLOW}Updating Systemd services...${NC}"

# correct airtime-server.service
# We need to read the template/install logic effectively or just write the file fresh with correct path
# install.sh lines 297-314
echo -e "${YELLOW}Updating airtime-server.service...${NC}"
cat > /tmp/airtime-server.service << EOF
[Unit]
Description=AirTime FastAPI Backend Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/airtime-server
ExecStart=$PROJECT_DIR/airtime-server/backend/.venv/bin/python $PROJECT_DIR/airtime-server/backend/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo cp /tmp/airtime-server.service /etc/systemd/system/
rm /tmp/airtime-server.service
echo -e "${GREEN}✓${NC} airtime-server.service updated"


# correct airtime-status.service
# install.sh lines 332-350
echo -e "${YELLOW}Updating airtime-status.service...${NC}"
cat > /tmp/airtime-status.service << EOF
[Unit]
Description=AirTime Hardware Status Monitor (GPIO/LEDs)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/airtime-server
ExecStartPre=$PROJECT_DIR/airtime-server/gpio-cleanup.sh
ExecStart=python $PROJECT_DIR/airtime-server/backend/systemStatus.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo cp /tmp/airtime-status.service /etc/systemd/system/
rm /tmp/airtime-status.service
echo -e "${GREEN}✓${NC} airtime-status.service updated"


# 3. Reload and Restart
echo ""
echo -e "${YELLOW}Reloading systemd and Nginx...${NC}"
sudo systemctl daemon-reload
sudo systemctl restart airtime-server
sudo systemctl restart airtime-status
sudo systemctl restart nginx
echo -e "${GREEN}✓${NC} Services restarted with new configuration"


echo ""
echo "=========================================="
echo -e "${GREEN}  Paths Fixed!${NC}"
echo "=========================================="
