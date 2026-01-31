#!/bin/bash
# AirTime Service Status Script

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "  AirTime Service Status"
echo "=========================================="
echo ""

check_service() {
    local service=$1
    if systemctl is-active --quiet $service; then
        echo -e "${GREEN}● $service is running${NC}"
        systemctl status $service --no-pager -l | grep "Active:" | sed 's/^/  /'
        echo ""
    else
        echo -e "${RED}● $service is stopped${NC}"
        echo ""
    fi
}

check_service airtime-server
check_service airtime-status

if systemctl list-unit-files | grep -q nginx.service; then
    check_service nginx
fi
