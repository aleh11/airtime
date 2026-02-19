#!/bin/bash
# AirTime Service Reboot Script
# Restarts all services (or starts/stops them based on args)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./restart.sh [--start|--stop]"
   exit 1
fi

MODE="restart"
if [[ "$1" == "--start" ]]; then
    MODE="start"
elif [[ "$1" == "--stop" ]]; then
    MODE="stop"
fi

echo "=========================================="
echo "  AirTime Service Control: ${MODE^^}"
echo "=========================================="
echo ""

control_service() {
    local service=$1
    
    if [[ "$MODE" == "stop" ]]; then
        echo -e "${YELLOW}Stopping $service...${NC}"
        systemctl stop $service
        if ! systemctl is-active --quiet $service; then
            echo -e "${GREEN}✓${NC} $service stopped"
        else
            echo -e "${RED}✗${NC} $service failed to stop"
        fi
        return
    fi
    
    if [[ "$MODE" == "start" ]]; then
        echo -e "${YELLOW}Starting $service...${NC}"
        systemctl start $service
    elif [[ "$MODE" == "restart" ]]; then
        if systemctl is-active --quiet $service; then
            echo -e "${YELLOW}Restarting $service...${NC}"
            systemctl restart $service
        else
            echo -e "${YELLOW}Starting $service...${NC}"
            systemctl start $service
        fi
    fi

    sleep 1
    if systemctl is-active --quiet $service; then
        echo -e "${GREEN}✓${NC} $service is running"
    else
        echo -e "${RED}✗${NC} $service failed to start"
        systemctl status $service --no-pager -l
    fi
}

control_service airtime-server
echo ""
control_service airtime-status
echo ""

if systemctl list-unit-files | grep -q nginx.service; then
    control_service nginx
else
    echo -e "${YELLOW}Nginx not installed, skipping${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Configuration Complete!${NC}"
echo "=========================================="
echo ""
