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

cd "$PROJECT_DIR/backend"

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

if [ ! -d "$PROJECT_DIR/database" ]; then
    echo -e "${YELLOW}Creating database directory...${NC}"
    mkdir -p "$PROJECT_DIR/database"
    echo -e "${GREEN}✓${NC} Database directory created"
else
    echo -e "${GREEN}✓${NC} Database directory exists"
fi

# Set proper permissions
chmod 755 "$PROJECT_DIR/database"
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

if [ -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Node modules already installed"
else
    echo -e "${YELLOW}Note: Frontend dependencies not installed${NC}"
    echo "You'll need to build the frontend on your dev machine and commit the built files"
    echo "See NGINX_SETUP.md for details"
fi

if [ -d "$PROJECT_DIR/frontend/dist" ]; then
    echo -e "${GREEN}✓${NC} Frontend build exists"
else
    echo -e "${YELLOW}Warning: frontend/dist not found${NC}"
    echo "Make sure to build and commit frontend on your dev machine"
fi

echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}  Installation Complete!${NC}"
echo "=========================================="
echo ""
echo "Installed:"
echo "  ✓ System packages (Python, SQLite, Nginx, Chrony)"
echo "  ✓ System Python packages (gpiozero, python-crontab)"
echo "  ✓ UV package manager"
echo "  ✓ Python virtual environment with all dependencies"
echo "  ✓ Database directory"
echo "  ✓ NTP client (chrony)"
echo ""
echo -e "${BLUE}Proceeding with service setup...${NC}"
echo ""

# Run service setup script automatically
cd "$PROJECT_DIR"
./setup-services.sh
