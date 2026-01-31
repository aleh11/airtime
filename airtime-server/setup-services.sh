#!/bin/bash
# AirTime Service Setup Script
# Creates and installs systemd service files for the AirTime radio transmitter

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  AirTime Service Setup"
echo "=========================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./setup-services.sh"
   exit 1
fi

# Detect project directory (where this script is located)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

echo -e "${GREEN}Project directory:${NC} $PROJECT_DIR"
echo ""

# Verify Python venv exists
if [ ! -f "$PROJECT_DIR/backend/.venv/bin/python" ]; then
    echo -e "${RED}Error: Python virtual environment not found at backend/.venv${NC}"
    echo "Please run 'cd backend && uv sync' first to create the virtual environment"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python venv found"
echo ""

# Disable conflicting GPIO services
echo "=========================================="
echo "  Disabling Conflicting Services"
echo "=========================================="
echo ""

# Check for statusled.service (conflicts with our GPIO usage)
if systemctl list-unit-files | grep -q "statusled.service"; then
    echo -e "${YELLOW}Found statusled.service (conflicts with GPIO pins)${NC}"

    # Stop if running
    if systemctl is-active --quiet statusled; then
        echo -e "${YELLOW}Stopping statusled service...${NC}"
        systemctl stop statusled
        echo -e "${GREEN}✓${NC} statusled stopped"
    fi

    # Disable to prevent restart on boot
    if systemctl is-enabled --quiet statusled 2>/dev/null; then
        echo -e "${YELLOW}Disabling statusled service...${NC}"
        systemctl disable statusled
        echo -e "${GREEN}✓${NC} statusled disabled"
    fi

    echo -e "${GREEN}✓${NC} Conflicting GPIO service disabled"
else
    echo -e "${GREEN}✓${NC} No conflicting GPIO services found"
fi

echo ""

# Check for existing services and unmask if needed
echo "=========================================="
echo "  Checking Existing Services"
echo "=========================================="
echo ""

for service in airtime-server airtime-status; do
    # Check if service file exists
    if [ -f "/etc/systemd/system/$service.service" ]; then
        echo -e "${YELLOW}Found existing $service.service${NC}"

        # Check if masked
        if systemctl is-enabled $service 2>&1 | grep -q "masked"; then
            echo -e "${YELLOW}Service is masked, unmasking...${NC}"
            systemctl unmask $service
            echo -e "${GREEN}✓${NC} $service unmasked"
        fi

        # Stop if running
        if systemctl is-active --quiet $service; then
            echo -e "${YELLOW}Stopping $service...${NC}"
            systemctl stop $service
            echo -e "${GREEN}✓${NC} $service stopped"
        fi
    else
        echo -e "${GREEN}✓${NC} No existing $service.service"
    fi
done

echo ""

# Create airtime-server.service (FastAPI backend)
echo -e "${YELLOW}Creating airtime-server.service...${NC}"
cat > /tmp/airtime-server.service << EOF
[Unit]
Description=AirTime FastAPI Backend Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/backend/.venv/bin/python $PROJECT_DIR/backend/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create GPIO cleanup script
echo -e "${YELLOW}Creating GPIO cleanup script...${NC}"
cat > $PROJECT_DIR/gpio-cleanup.sh << 'CLEANUPEOF'
#!/bin/bash
# GPIO Cleanup Script - Releases GPIO pins before systemStatus.py starts

for pin in 9 11 5 19; do
    echo $pin > /sys/class/gpio/unexport 2>/dev/null || true
done

pkill -f "systemStatus.py" 2>/dev/null || true
sleep 0.5
exit 0
CLEANUPEOF

chmod +x $PROJECT_DIR/gpio-cleanup.sh
echo -e "${GREEN}✓${NC} GPIO cleanup script created"

# Create airtime-status.service (Hardware Monitor)
echo -e "${YELLOW}Creating airtime-status.service...${NC}"
cat > /tmp/airtime-status.service << EOF
[Unit]
Description=AirTime Hardware Status Monitor (GPIO/LEDs)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
ExecStartPre=$PROJECT_DIR/gpio-cleanup.sh
ExecStart=python $PROJECT_DIR/backend/systemStatus.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓${NC} Service files created in /tmp"
echo ""

# Check if nginx.conf exists in project
if [ ! -f "$PROJECT_DIR/nginx.conf" ]; then
    echo -e "${RED}Warning: nginx.conf not found in project directory${NC}"
    echo "Nginx setup will be skipped. See NGINX_SETUP.md for manual setup."
    SKIP_NGINX=true
else
    SKIP_NGINX=false
fi

# Copy service files to systemd directory
echo ""
echo -e "${YELLOW}Installing service files...${NC}"
cp /tmp/airtime-server.service /etc/systemd/system/
cp /tmp/airtime-status.service /etc/systemd/system/
rm /tmp/airtime-server.service /tmp/airtime-status.service

echo -e "${GREEN}✓${NC} Service files installed to /etc/systemd/system/"

# Reload systemd daemon
echo -e "${YELLOW}Reloading systemd daemon...${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

# Enable services (start on boot)
echo -e "${YELLOW}Enabling services to start on boot...${NC}"
systemctl enable airtime-server
systemctl enable airtime-status
echo -e "${GREEN}✓${NC} Services enabled"

# Setup Nginx
if [ "$SKIP_NGINX" = false ]; then
    echo ""
    echo "=========================================="
    echo "  Nginx Setup"
    echo "=========================================="
    echo ""

    # Check if nginx is installed
    if ! command -v nginx &> /dev/null; then
        echo -e "${YELLOW}Nginx not found. Installing...${NC}"
        apt-get update
        apt-get install -y nginx
        echo -e "${GREEN}✓${NC} Nginx installed"
    else
        echo -e "${GREEN}✓${NC} Nginx already installed"
    fi

    # Copy nginx config
    echo -e "${YELLOW}Installing nginx config...${NC}"
    cp "$PROJECT_DIR/nginx.conf" /etc/nginx/sites-available/airtime

    # Create symlink to enable site
    if [ -f /etc/nginx/sites-enabled/airtime ]; then
        echo -e "${GREEN}✓${NC} Nginx site already enabled"
    else
        ln -s /etc/nginx/sites-available/airtime /etc/nginx/sites-enabled/airtime
        echo -e "${GREEN}✓${NC} Nginx site enabled"
    fi

    # Remove default nginx site (prevents port 80 conflicts)
    if [ -f /etc/nginx/sites-enabled/default ]; then
        echo -e "${YELLOW}Removing default nginx site...${NC}"
        rm /etc/nginx/sites-enabled/default
        echo -e "${GREEN}✓${NC} Default site removed"
    fi

    # Fix permissions for nginx to access frontend files
    echo -e "${YELLOW}Setting frontend file permissions for nginx...${NC}"

    # Get the project directory owner (the user who owns the directory)
    PROJECT_OWNER=$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || stat -f '%Su' "$PROJECT_DIR")
    PROJECT_HOME=$(dirname "$PROJECT_DIR")

    # Make home directory and project directories traversable by nginx
    chmod o+rx "$PROJECT_HOME" 2>/dev/null || true
    chmod o+rx "$PROJECT_DIR"
    chmod o+rx "$PROJECT_DIR/frontend"
    chmod o+rx "$PROJECT_DIR/frontend/dist"

    # Make all frontend build files readable by nginx
    chmod -R o+r "$PROJECT_DIR/frontend/dist"

    echo -e "${GREEN}✓${NC} Frontend permissions set (nginx can read files)"

    # Test nginx config
    echo -e "${YELLOW}Testing nginx configuration...${NC}"
    if nginx -t; then
        echo -e "${GREEN}✓${NC} Nginx config is valid"
    else
        echo -e "${RED}✗${NC} Nginx config has errors!"
        echo "Please check /etc/nginx/sites-available/airtime"
    fi

    # Create nginx systemd override to wait for backend
    echo -e "${YELLOW}Configuring nginx to wait for backend...${NC}"
    mkdir -p /etc/systemd/system/nginx.service.d
    cat > /etc/systemd/system/nginx.service.d/airtime.conf << 'NGINXEOF'
[Unit]
# Wait for AirTime backend to be ready before starting nginx
After=airtime-server.service
Wants=airtime-server.service
NGINXEOF
    echo -e "${GREEN}✓${NC} Nginx configured to wait for backend"

    # Reload systemd to pick up override
    systemctl daemon-reload

    # Enable nginx to start on boot
    systemctl enable nginx
    echo -e "${GREEN}✓${NC} Nginx enabled to start on boot"
fi

# Start services
echo ""
echo -e "${YELLOW}Starting airtime-server...${NC}"
systemctl start airtime-server
sleep 1
systemctl status airtime-server --no-pager -l

echo ""
echo -e "${YELLOW}Starting airtime-status...${NC}"
systemctl start airtime-status
sleep 1
systemctl status airtime-status --no-pager -l

if [ "$SKIP_NGINX" = false ]; then
    echo ""
    echo -e "${YELLOW}Restarting nginx...${NC}"
    systemctl restart nginx
    sleep 1
    systemctl status nginx --no-pager -l
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Service Management Commands:"
echo "  Status:  sudo systemctl status airtime-server"
echo "           sudo systemctl status airtime-status"
if [ "$SKIP_NGINX" = false ]; then
echo "           sudo systemctl status nginx"
fi
echo ""
echo "  Start:   sudo systemctl start airtime-server"
echo "           sudo systemctl start airtime-status"
if [ "$SKIP_NGINX" = false ]; then
echo "           sudo systemctl start nginx"
fi
echo ""
echo "  Stop:    sudo systemctl stop airtime-server"
echo "           sudo systemctl stop airtime-status"
if [ "$SKIP_NGINX" = false ]; then
echo "           sudo systemctl stop nginx"
fi
echo ""
echo "  Restart: sudo systemctl restart airtime-server"
echo "           sudo systemctl restart airtime-status"
if [ "$SKIP_NGINX" = false ]; then
echo "           sudo systemctl restart nginx"
fi
echo ""
echo "  Logs:    sudo journalctl -u airtime-server -f"
echo "           sudo journalctl -u airtime-status -f"
if [ "$SKIP_NGINX" = false ]; then
echo "           sudo tail -f /var/log/nginx/airtime-access.log"
echo "           sudo tail -f /var/log/nginx/airtime-error.log"
fi
echo ""
if [ "$SKIP_NGINX" = false ]; then
echo "Dashboard URL: http://$(hostname -I | awk '{print $1}')/"
echo ""
fi
