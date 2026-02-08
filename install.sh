#!/bin/bash
# AirTime Installation Script
# Sets up a fresh Raspberry Pi with all dependencies

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "  AirTime Installation"
echo "=========================================="
echo ""
echo "This script will perform the following actions:"
echo "  • Install system packages (Python, SQLite, Nginx, Chrony, Git)"
echo "  • Install Python packages (gpiozero, python-crontab)"
echo "  • Configure system services (systemd units)"
echo "  • Modify system configuration files"
echo "  • Create and configure database directories"
echo ""
read -p "Do you wish to proceed with the installation? (y/n) " -n 1 -r </dev/tty
echo ""
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./install.sh"
   exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

echo -e "${BLUE}Installing AirTime at:${NC} $PROJECT_DIR"
echo ""

echo -e "${YELLOW}Updating package lists...${NC}"
apt-get update -qq
echo -e "${GREEN}✓${NC} Package lists updated"
echo ""

echo "=========================================="
echo "  System Dependencies"
echo "=========================================="
echo ""

PACKAGES=(
    "python3"
    "python3-pip"
    "python3-venv"
    "sqlite3"
    "nginx"
    "chrony"
    "git"
    "python3-psutil"
    "cmake"
    "build-essential"
)

for package in "${PACKAGES[@]}"; do
    if dpkg -l | grep -q "^ii  $package "; then
        echo -e "${GREEN}✓${NC} $package already installed"
    else
        echo -e "${YELLOW}Installing $package...${NC}"
        apt-get install -y $package > /dev/null 2>&1
        echo -e "${GREEN}✓${NC} $package installed"
    fi
done

echo ""

echo "=========================================="
echo "  txtempus Installation"
echo "=========================================="
echo ""

if [ -f "/usr/bin/txtempus" ] || [ -f "/usr/local/bin/txtempus" ]; then
    echo -e "${GREEN}✓${NC} txtempus already installed"
else
    echo -e "${YELLOW}Installing txtempus (this may take a while)...${NC}"

    TEMP_DIR=$(mktemp -d)

    echo -e "${YELLOW}Cloning repository...${NC}"
    git clone https://github.com/hzeller/txtempus.git "$TEMP_DIR/txtempus"

    echo -e "${YELLOW}Building...${NC}"
    pushd "$TEMP_DIR/txtempus" > /dev/null
    mkdir -p build && cd build
    cmake .. -DPLATFORM=rpi
    make

    echo -e "${YELLOW}Installing binary...${NC}"
    make install

    popd > /dev/null
    rm -rf "$TEMP_DIR"

    echo -e "${GREEN}✓${NC} txtempus installed successfully"
fi

echo ""

echo "=========================================="
echo "  System Python Packages"
echo "=========================================="
echo ""
echo -e "${YELLOW}Installing gpiozero (GPIO control)...${NC}"
pip3 install --break-system-packages gpiozero > /dev/null 2>&1
echo -e "${GREEN}✓${NC} gpiozero installed"

echo -e "${YELLOW}Installing python-crontab (cron management)...${NC}"
pip3 install --break-system-packages python-crontab > /dev/null 2>&1
echo -e "${GREEN}✓${NC} python-crontab installed"

echo ""

echo "=========================================="
echo "  UV Package Manager"
echo "=========================================="
echo ""

if command -v uv &> /dev/null; then
    echo -e "${GREEN}✓${NC} UV already installed"
    UV_BIN="uv"
else
    echo -e "${YELLOW}Installing UV package manager...${NC}"
    curl -LsSf https://astral.sh/uv/install.sh | sh

    if [ -f "$HOME/.local/bin/uv" ]; then
        UV_BIN="$HOME/.local/bin/uv"
    elif [ -f "$HOME/.cargo/bin/uv" ]; then
        UV_BIN="$HOME/.cargo/bin/uv"
    else
        echo -e "${RED}Error: UV installed but binary not found${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓${NC} UV installed to $(dirname $UV_BIN)"
fi

echo ""

echo "=========================================="
echo "  Python Virtual Environment"
echo "=========================================="
echo ""

cd "$PROJECT_DIR/airtime-server/backend"

if [ -d ".venv" ]; then
    echo -e "${YELLOW}Removing existing venv...${NC}"
    rm -rf .venv
fi

echo -e "${YELLOW}Creating virtual environment with UV...${NC}"
$UV_BIN sync
echo -e "${GREEN}✓${NC} Virtual environment created"
echo -e "${GREEN}✓${NC} Dependencies installed from pyproject.toml"

cd "$PROJECT_DIR"
echo ""

echo "=========================================="
echo "  Database Setup"
echo "=========================================="
echo ""

if [ ! -d "$PROJECT_DIR/airtime-server/database" ]; then
    echo -e "${YELLOW}Creating database directory...${NC}"
    mkdir -p "$PROJECT_DIR/airtime-server/database"
    echo -e "${GREEN}✓${NC} Database directory created"
else
    echo -e "${GREEN}✓${NC} Database directory exists"
fi

chmod 755 "$PROJECT_DIR/airtime-server/database"
echo -e "${GREEN}✓${NC} Database permissions set"

echo ""

echo "=========================================="
echo "  Disabling Conflicting Services"
echo "=========================================="
echo ""

if systemctl list-unit-files | grep -q "statusled.service"; then
    echo -e "${YELLOW}Found statusled.service (conflicts with GPIO pins)${NC}"

    if systemctl is-active --quiet statusled; then
        echo -e "${YELLOW}Stopping statusled service...${NC}"
        systemctl stop statusled
        echo -e "${GREEN}✓${NC} statusled stopped"
    fi

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

echo "=========================================="
echo "  NTP Configuration"
echo "=========================================="
echo ""

if systemctl is-active --quiet chronyd; then
    echo -e "${GREEN}✓${NC} Chrony is running"
else
    echo -e "${YELLOW}Starting chrony...${NC}"
    systemctl start chronyd
    systemctl enable chronyd
    echo -e "${GREEN}✓${NC} Chrony started and enabled"
fi

echo ""

echo "=========================================="
echo "  Frontend Build"
echo "=========================================="
echo ""

if [ -d "$PROJECT_DIR/airtime-server/frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Node modules already installed"
else
    echo -e "${YELLOW}Note: Frontend dependencies not installed${NC}"
    echo "You'll need to build the frontend on your dev machine and commit the built files"
    echo "See NGINX_SETUP.md for details"
fi

if [ -d "$PROJECT_DIR/airtime-server/frontend/dist" ]; then
    echo -e "${GREEN}✓${NC} Frontend build exists"
else
    echo -e "${YELLOW}Warning: frontend/dist not found${NC}"
    echo "Make sure to build and commit frontend on your dev machine"
fi

echo ""

echo "=========================================="
echo "  AirTime Service Setup"
echo "=========================================="
echo ""

if [ ! -f "$PROJECT_DIR/airtime-server/backend/.venv/bin/python" ]; then
    echo -e "${RED}Error: Python virtual environment not found at airtime-server/backend/.venv${NC}"
    echo "Please run 'cd airtime-server/backend && uv sync' first to create the virtual environment"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python venv found"
echo ""

echo "=========================================="
echo "  Checking Existing Services"
echo "=========================================="
echo ""

for service in airtime-server airtime-status; do
    if [ -f "/etc/systemd/system/$service.service" ]; then
        echo -e "${YELLOW}Found existing $service.service${NC}"

        if systemctl is-enabled $service 2>&1 | grep -q "masked"; then
            echo -e "${YELLOW}Service is masked, unmasking...${NC}"
            systemctl unmask $service
            echo -e "${GREEN}✓${NC} $service unmasked"
        fi

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

echo -e "${YELLOW}Creating airtime-server.service...${NC}"
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

echo -e "${YELLOW}Creating GPIO cleanup script...${NC}"
cat > $PROJECT_DIR/airtime-server/gpio-cleanup.sh << 'CLEANUPEOF'
#!/bin/bash
for pin in 9 11 5 19; do
    echo $pin > /sys/class/gpio/unexport 2>/dev/null || true
done

pkill -f "systemStatus.py" 2>/dev/null || true
sleep 0.5
exit 0
CLEANUPEOF

chmod +x $PROJECT_DIR/airtime-server/gpio-cleanup.sh
echo -e "${GREEN}✓${NC} GPIO cleanup script created"

echo -e "${YELLOW}Creating airtime-status.service...${NC}"
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

echo -e "${GREEN}✓${NC} Service files created in /tmp"
echo ""

if [ ! -f "$PROJECT_DIR/airtime-server/nginx.conf" ]; then
    echo -e "${RED}Warning: nginx.conf not found in airtime-server directory${NC}"
    echo "Nginx setup will be skipped. See NGINX_SETUP.md for manual setup."
    SKIP_NGINX=true
else
    SKIP_NGINX=false
fi

echo ""
echo -e "${YELLOW}Installing service files...${NC}"
cp /tmp/airtime-server.service /etc/systemd/system/
cp /tmp/airtime-status.service /etc/systemd/system/
rm /tmp/airtime-server.service /tmp/airtime-status.service

echo -e "${GREEN}✓${NC} Service files installed to /etc/systemd/system/"

echo -e "${YELLOW}Reloading systemd daemon...${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo -e "${YELLOW}Enabling services to start on boot...${NC}"
systemctl enable airtime-server
systemctl enable airtime-status
echo -e "${GREEN}✓${NC} Services enabled"

if [ "$SKIP_NGINX" = false ]; then
    echo ""
    echo "=========================================="
    echo "  Nginx Setup"
    echo "=========================================="
    echo ""

    if ! command -v nginx &> /dev/null; then
        echo -e "${YELLOW}Nginx not found. Installing...${NC}"
        apt-get update
        apt-get install -y nginx
        echo -e "${GREEN}✓${NC} Nginx installed"
    else
        echo -e "${GREEN}✓${NC} Nginx already installed"
    fi

    echo -e "${YELLOW}Installing nginx config...${NC}"
    sed "s|root /home/time/airtime/frontend/dist;|root $PROJECT_DIR/airtime-server/frontend/dist;|g" "$PROJECT_DIR/airtime-server/nginx.conf" > /etc/nginx/sites-available/airtime

    if [ -f /etc/nginx/sites-enabled/airtime ]; then
        echo -e "${GREEN}✓${NC} Nginx site already enabled"
    else
        ln -s /etc/nginx/sites-available/airtime /etc/nginx/sites-enabled/airtime
        echo -e "${GREEN}✓${NC} Nginx site enabled"
    fi

    if [ -f /etc/nginx/sites-enabled/default ]; then
        echo -e "${YELLOW}Removing default nginx site...${NC}"
        rm /etc/nginx/sites-enabled/default
        echo -e "${GREEN}✓${NC} Default site removed"
    fi

    echo -e "${YELLOW}Setting frontend file permissions for nginx...${NC}"

    PROJECT_OWNER=$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || stat -f '%Su' "$PROJECT_DIR")
    PROJECT_HOME=$(dirname "$PROJECT_DIR")

    chmod o+rx "$PROJECT_HOME" 2>/dev/null || true
    chmod o+rx "$PROJECT_DIR"
    chmod o+rx "$PROJECT_DIR/airtime-server"
    chmod o+rx "$PROJECT_DIR/airtime-server/frontend"
    chmod o+rx "$PROJECT_DIR/airtime-server/frontend/dist"
    chmod -R o+r "$PROJECT_DIR/airtime-server/frontend/dist"

    echo -e "${GREEN}✓${NC} Frontend permissions set (nginx can read files)"

    echo -e "${YELLOW}Testing nginx configuration...${NC}"
    if nginx -t; then
        echo -e "${GREEN}✓${NC} Nginx config is valid"
    else
        echo -e "${RED}✗${NC} Nginx config has errors!"
        echo "Please check /etc/nginx/sites-available/airtime"
    fi

    echo -e "${YELLOW}Configuring nginx to wait for backend...${NC}"
    mkdir -p /etc/systemd/system/nginx.service.d
    cat > /etc/systemd/system/nginx.service.d/airtime.conf << 'NGINXEOF'
[Unit]
After=airtime-server.service
Wants=airtime-server.service
NGINXEOF
    echo -e "${GREEN}✓${NC} Nginx configured to wait for backend"

    systemctl daemon-reload

    systemctl enable nginx
    echo -e "${GREEN}✓${NC} Nginx enabled to start on boot"
fi

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
echo -e "${GREEN}  Installation Complete!${NC}"
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
echo "  Restart: sudo ./restart.sh"
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
