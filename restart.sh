#!/bin/bash
# AirTime Service Reboot Script
# Restarts all services (or starts them if not running)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./restart"
   exit 1
fi

echo "=========================================="
echo "  AirTime Service Reboot"
echo "=========================================="
echo ""

restart_service() {
    local service=$1

    if systemctl is-active --quiet $service; then
        echo -e "${YELLOW}Restarting $service...${NC}"
        systemctl restart $service
    else
        echo -e "${YELLOW}Starting $service...${NC}"
        systemctl start $service
    fi

    sleep 1
    if systemctl is-active --quiet $service; then
        echo -e "${GREEN}✓${NC} $service is running"
    else
        echo -e "${RED}✗${NC} $service failed to start"
        systemctl status $service --no-pager -l
    fi
}

restart_service airtime-server

echo ""

restart_service airtime-status

echo ""

if systemctl list-unit-files | grep -q nginx.service; then
    restart_service nginx
else
    echo -e "${YELLOW}Nginx not installed, skipping${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Reboot Complete!${NC}"
echo "=========================================="
echo ""
echo "Service Status:"
systemctl status airtime-server --no-pager -l | head -3
systemctl status airtime-status --no-pager -l | head -3
if systemctl list-unit-files | grep -q nginx.service; then
    systemctl status nginx --no-pager -l | head -3
fi
echo ""
