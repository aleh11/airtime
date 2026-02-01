#!/bin/bash
# AirTime Installation Script
# Sets up a fresh Raspberry Pi with all dependencies

set -e  # Exit on any error

# Colors
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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   echo "Usage: sudo ./install.sh"
   exit 1
fi

# Detect project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

echo -e "${BLUE}Installing AirTime at:${NC} $PROJECT_DIR"
echo ""

# Update package lists
echo -e "${YELLOW}Updating package lists...${NC}"
apt-get update -qq
echo -e "${GREEN}✓${NC} Package lists updated"
echo ""

# Install system dependencies
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
    "chrony"           # NTP client
    "git"
    "python3-psutil"   # System monitoring
    "cmake"            # For building txtempus
    "build-essential"  # For building txtempus
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

# Install txtempus (Radio Transmitter)
echo "=========================================="
echo "  txtempus Installation"
echo "=========================================="
echo ""

if [ -f "/usr/bin/txtempus" ] || [ -f "/usr/local/bin/txtempus" ]; then
    echo -e "${GREEN}✓${NC} txtempus already installed"
else
    echo -e "${YELLOW}Installing txtempus (this may take a while)...${NC}"
    
    # Create temp dir
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
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    echo -e "${GREEN}✓${NC} txtempus installed successfully"
fi

echo ""

# Install system-level Python packages (for systemStatus.py running with sudo python)
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

# Install UV package manager
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

    # UV can install to either .local/bin or .cargo/bin depending on installer version
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

# Set up Python virtual environment
echo "=========================================="
echo "  Python Virtual Environment"
echo "=========================================="
echo ""

# Point to airtime-server/backend
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

# Set up database directory
echo "=========================================="
echo "  Database Setup"
echo "=========================================="
echo ""

# Point to airtime-server/database
if [ ! -d "$PROJECT_DIR/airtime-server/database" ]; then
    echo -e "${YELLOW}Creating database directory...${NC}"
    mkdir -p "$PROJECT_DIR/airtime-server/database"
    echo -e "${GREEN}✓${NC} Database directory created"
else
    echo -e "${GREEN}✓${NC} Database directory exists"
fi

# Set proper permissions
chmod 755 "$PROJECT_DIR/airtime-server/database"
echo -e "${GREEN}✓${NC} Database permissions set"

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

# Configure NTP (chrony)
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

# Build frontend
echo "=========================================="
echo "  Frontend Build"
echo "=========================================="
echo ""

# Point to airtime-server/frontend
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

# ==========================================
# Service Setup (Merged from setup-services.sh)
# ==========================================

echo "=========================================="
echo "  AirTime Service Setup"
echo "=========================================="
echo ""

# Verify Python venv exists
if [ ! -f "$PROJECT_DIR/airtime-server/backend/.venv/bin/python" ]; then
    echo -e "${RED}Error: Python virtual environment not found at airtime-server/backend/.venv${NC}"
    echo "Please run 'cd airtime-server/backend && uv sync' first to create the virtual environment"
    exit 1
fi

echo -e "${GREEN}✓${NC} Python venv found"
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
WorkingDirectory=$PROJECT_DIR/airtime-server
ExecStart=$PROJECT_DIR/airtime-server/backend/.venv/bin/python $PROJECT_DIR/airtime-server/backend/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create GPIO cleanup script in airtime-server/
echo -e "${YELLOW}Creating GPIO cleanup script...${NC}"
cat > $PROJECT_DIR/airtime-server/gpio-cleanup.sh << 'CLEANUPEOF'
#!/bin/bash
# GPIO Cleanup Script - Releases GPIO pins before systemStatus.py starts

for pin in 9 11 5 19; do
    echo $pin > /sys/class/gpio/unexport 2>/dev/null || true
done

pkill -f "systemStatus.py" 2>/dev/null || true
sleep 0.5
exit 0
CLEANUPEOF

chmod +x $PROJECT_DIR/airtime-server/gpio-cleanup.sh
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

# Check if nginx.conf exists in project
if [ ! -f "$PROJECT_DIR/airtime-server/nginx.conf" ]; then
    echo -e "${RED}Warning: nginx.conf not found in airtime-server directory${NC}"
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

    # Configure and install nginx config
    echo -e "${YELLOW}Installing nginx config...${NC}"
    # Read config and replace root path with actual project path
    sed "s|root /home/time/airtime/frontend/dist;|root $PROJECT_DIR/airtime-server/frontend/dist;|g" "$PROJECT_DIR/airtime-server/nginx.conf" > /etc/nginx/sites-available/airtime

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
    chmod o+rx "$PROJECT_DIR/airtime-server"
    chmod o+rx "$PROJECT_DIR/airtime-server/frontend"
    chmod o+rx "$PROJECT_DIR/airtime-server/frontend/dist"

    # Make all frontend build files readable by nginx
    chmod -R o+r "$PROJECT_DIR/airtime-server/frontend/dist"

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
