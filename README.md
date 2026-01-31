# Airtime : Local Time-signal Transmitter

> Raspberry Pi-based radio time signal broadcaster with web dashboard

**AirTime** transmits precise time signals over radio frequencies (DCF77, WWVB, MSF, JJY40, JJY60) using the [txtempus](https://github.com/hzeller/txtempus) transmitter. Features a modern React dashboard for monitoring, scheduling broadcasts, and controlling hardware.

---

## 🚀 Quick Start (Fresh Raspberry Pi)

Clone and run **one command** to set up everything:

```bash
git clone https://github.com/aleh11/airtime.git
cd airtime && sudo ./install.sh
```

That's it! The script will:
- Install all system dependencies (Python, SQLite, Nginx, Chrony)
- Set up Python virtual environment with UV
- Create database structure
- Configure NTP for accurate time
- Optionally run service setup

After installation, your dashboard will be available at `http://<pi-ip-address>/`

---

## 📁 Project Structure

```
airtime-server/
├── backend/              # Python FastAPI backend + hardware control
│   ├── server.py        # REST API server (localhost:8000)
│   ├── systemStatus.py  # Hardware monitor (GPIO/LEDs/buttons)
│   ├── db.py            # SQLite database layer
│   ├── crons.py         # Cron job management
│   └── .venv/           # Python virtual environment
├── frontend/            # React + TypeScript dashboard
│   ├── components/      # ClockWidget, ControlWidget, ScheduleWidget
│   ├── dist/            # Production build (served by nginx)
│   └── App.tsx          # Main application
├── database/            # SQLite database
│   └── airtime.db       # Settings, status, cron jobs
├── install.sh          # 🔧 Fresh Pi setup (one command)
├── setup-services.sh   # 🔧 Install systemd services
└── reboot              # 🔧 Quick restart all services
```

---

## 🛠️ Deployment Scripts

### 1. `install.sh` - Fresh Pi Setup

**One-command installation for a brand new Raspberry Pi**

```bash
sudo ./install.sh
```

**What it does:**
- ✅ Installs system packages: `python3`, `sqlite3`, `nginx`, `chrony` (NTP), `git`
- ✅ Installs system Python packages: `gpiozero`, `python-crontab` (for GPIO control)
- ✅ Installs UV package manager
- ✅ Creates virtual environment in `backend/.venv/`
- ✅ Sets up database directory with proper permissions
- ✅ Configures and starts Chrony NTP client
- ✅ Checks frontend build (warns if missing)
- ✅ Optionally continues to service setup

**Requirements:** Fresh Raspberry Pi OS with internet connection

---

### 2. `setup-services.sh` - Service Installation

**Creates and installs systemd services**

```bash
sudo ./setup-services.sh
```

**What it does:**
- ✅ Checks for existing services and unmasks them if needed
- ✅ Stops running services before overwriting
- ✅ Creates `airtime-server.service` (FastAPI backend)
- ✅ Creates `airtime-status.service` (Hardware monitor)
- ✅ Configures nginx to serve frontend and proxy API
- ✅ Shows service file contents for review
- ✅ Enables services to start on boot
- ✅ Optionally starts services immediately

**Services created:**

| Service | Description | Port |
|---------|-------------|------|
| `airtime-server` | FastAPI REST API | 8000 |
| `airtime-status` | GPIO/LED/Button control | - |
| `nginx` | Frontend + API proxy | 80 |

---

### 3. `restart` - Quick Service Restart

**Restart all services after code updates**

```bash
sudo ./restart
```

**What it does:**
- ✅ Restarts `airtime-server` (or starts if stopped)
- ✅ Restarts `airtime-status` (or starts if stopped)
- ✅ Restarts `nginx` (if installed)
- ✅ Shows service status after restart

**Use case:** After `git pull` to deploy new code changes

---

## 🔄 Typical Workflows

### Fresh Pi Setup (First Time)
```bash
# 1. Clone repo
git clone https://github.com/aleh11/airtime.git
cd airtime

# 2. Run install script (installs everything)
sudo ./install.sh
# Answer 'y' to continue with service setup

# 3. Done! Visit http://<pi-ip>/
```

### Deploying Code Updates
```bash
# On development machine (Mac):
cd frontend && npm run build
cd ..
git add frontend/dist/
git commit -m "Update frontend"
git push

# On Raspberry Pi:
cd airtime
git pull
sudo ./restart
```

### Manual Service Management
```bash
# Check status
sudo systemctl status airtime-server
sudo systemctl status airtime-status
sudo systemctl status nginx

# View logs
sudo journalctl -u airtime-server -f
sudo journalctl -u airtime-status -f
sudo tail -f /var/log/nginx/airtime-access.log

# Stop/start individual services
sudo systemctl stop airtime-server
sudo systemctl start airtime-server
sudo systemctl restart airtime-status
```

---

## 🏗️ Architecture

### Three-Tier System

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│              (Vite build → nginx static)                 │
│           http://pi-ip/ → frontend/dist/                 │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │ /api/* requests (nginx proxy)
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                        │
│              (backend/server.py on :8000)                │
│          REST API: Status, Settings, Cron Jobs           │
└─────────────────────────────────────────────────────────┘
           │                                    │
           │ writes                             │ reads/writes
           ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│  SQLite Database │◄─────────────│  Hardware Monitor    │
│   (airtime.db)   │ reads/writes │  (systemStatus.py)   │
│  - Settings      │              │  - GPIO Control      │
│  - Status        │              │  - LED Monitoring    │
│  - Cron Jobs     │              │  - Button Handling   │
└──────────────────┘              └──────────────────────┘
```

### Communication

- **Frontend ↔ Backend**: HTTP REST API calls via nginx proxy
- **Backend ↔ Database**: SQLite (WAL mode for concurrent access)
- **Hardware Monitor ↔ Database**: SQLite (WAL mode)
- **Services ↔ txtempus**: Subprocess calls to `/usr/bin/txtempus`

---

## 💻 Development

### Prerequisites
- **Mac/Linux**: Backend development + frontend development
- **Raspberry Pi**: Required for hardware monitor (GPIO)

### Backend Development
```bash
cd backend

# Activate virtual environment
source .venv/bin/activate

# Run development server
python server.py
# Server runs on http://localhost:8000
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Run dev server with hot reload
npm run dev
# Dev server runs on http://localhost:3000
# Automatically proxies /api to localhost:8000
```

### Building Frontend
```bash
cd frontend

# Production build
npm run build
# Output: frontend/dist/

# Preview build
npm run preview
```

### Database Operations
```bash
# Open database
sqlite3 database/airtime.db

# View tables
.tables

# Query settings
SELECT * FROM settings;

# Query status
SELECT * FROM status;

# Query cron jobs
SELECT * FROM cron_jobs;
```

---

## 🔧 Configuration

### Radio Defaults
Configure via dashboard or API:

```bash
# Get current config
curl http://localhost:8000/api/settings/radio

# Update defaults
curl -X POST http://localhost:8000/api/settings/radio \
  -H "Content-Type: application/json" \
  -d '{
    "default_service": "DCF77",
    "default_duration_minutes": 10,
    "default_offset": 0
  }'
```

### Available Services
- **DCF77** - Germany (77.5 kHz)
- **WWVB** - USA (60 kHz)
- **MSF** - UK (60 kHz)
- **JJY40** - Japan (40 kHz)
- **JJY60** - Japan (60 kHz)

### GPIO Pin Configuration

Hardware monitor uses these pins:

| Component | GPIO Pin | Function |
|-----------|----------|----------|
| LED 1 | 9 | Internet status |
| LED 2 | 11 | NTP sync status |
| LED 3 | 5 | Broadcast status |
| Button | 19 | Trigger/stealth toggle |

**Button Actions:**
- Short press (<3s): Start broadcast with default settings
- Long hold (3s): Toggle stealth mode (LEDs off)

---

## 📡 API Endpoints

### Status
- `GET /api/status` - System status (NTP, internet, services)

### Cron Jobs (Scheduled Broadcasts)
- `GET /api/crons` - List all scheduled jobs
- `POST /api/crons` - Create or update schedule
- `DELETE /api/crons/{job_id}` - Remove schedule

### Settings
- `GET /api/settings/radio` - Get radio defaults
- `POST /api/settings/radio` - Update radio defaults

### Control
- `POST /api/control/transmit` - Start manual broadcast
- `POST /api/control/stealth` - Toggle stealth mode

### Debug
- `GET /api/debug/crontab` - View system crontab vs database

---

## 🐛 Troubleshooting

### Service won't start
```bash
# Check if service is masked
sudo systemctl status airtime-server

# If masked, unmask it
sudo systemctl unmask airtime-server
sudo systemctl start airtime-server
```

### Database locked errors
Database uses WAL mode for concurrent access. If locked:
```bash
# Check running processes
ps aux | grep python

# Restart services
sudo ./restart
```

### Frontend not showing
```bash
# Check if nginx is running
sudo systemctl status nginx

# Check nginx config
sudo nginx -t

# View nginx logs
sudo tail -f /var/log/nginx/airtime-error.log
```

### Nginx 500 Error (Permission Denied)
If nginx shows "Permission denied" for frontend files:
```bash
# Fix frontend file permissions (nginx needs read access)
sudo chmod o+rx /home/time
sudo chmod o+rx /home/time/airtime
sudo chmod o+rx /home/time/airtime/frontend
sudo chmod o+rx /home/time/airtime/frontend/dist
sudo chmod -R o+r /home/time/airtime/frontend/dist

# Restart nginx
sudo systemctl restart nginx
```

**Note:** The setup script should handle this automatically, but if you moved the project or changed permissions, you may need to run this manually.

### GPIO Busy Error
If hardware monitor crashes with "GPIO busy" error:
```bash
# Check if conflicting service is running
sudo systemctl status statusled

# If statusled is running, stop and disable it
sudo systemctl stop statusled
sudo systemctl disable statusled

# The setup script creates a cleanup script that runs automatically
# If you need to manually release GPIO pins:
sudo /home/time/airtime/gpio-cleanup.sh

# Or manually kill processes holding GPIO
sudo pkill -f systemStatus.py

# Restart the service
sudo systemctl restart airtime-status
```

**Note:** The `statusled.service` conflicts with AirTime's GPIO usage. The install script automatically disables it.

### Hardware monitor not working
```bash
# Must run as root for GPIO access
sudo systemctl status airtime-status

# Check system Python has gpiozero
python3 -c "import gpiozero; print('OK')"

# If missing, reinstall
pip3 install --break-system-packages gpiozero
```

### Cron jobs not running
```bash
# Check database cron jobs
sqlite3 database/airtime.db "SELECT * FROM cron_jobs;"

# Check system crontab
sudo crontab -l

# Manually sync
cd backend
python crons.py
```

---

## 📦 Dependencies

### System Packages
- Python 3.9+
- SQLite 3
- Nginx (for production)
- Chrony (NTP client)
- Git

### Python Packages (System)
- `gpiozero` - GPIO control (Raspberry Pi only)
- `python-crontab` - Cron management

### Python Packages (Venv)
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `pydantic` - Data validation

### Frontend Packages
- React 19
- TypeScript
- Vite
- lucide-react (icons)

---

## 📝 Notes

- **txtempus binary required**: Install from [hzeller/txtempus](https://github.com/hzeller/txtempus)
- **Runs as root**: Required for GPIO control and txtempus
- **No authentication**: API is open on localhost (not exposed externally by default)
- **Git-based deployment**: Commit built frontend and pull on Pi
- **WAL mode**: Database uses Write-Ahead Logging for concurrent access

---

## 🔗 Links

- **Website**: [https://airtime-five.vercel.app/](https://airtime-five.vercel.app/)
- **txtempus**: [https://github.com/hzeller/txtempus](https://github.com/hzeller/txtempus)
- **Repository**: [https://github.com/aleh11/airtime](https://github.com/aleh11/airtime)

---

## 📄 License

MIT License - See repository for details
