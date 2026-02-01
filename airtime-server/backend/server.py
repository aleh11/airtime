from datetime import datetime
import subprocess
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re
import db
import crons

app = FastAPI()

# Add CORS middleware for React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Run cron sync on server startup"""
    try:
        print("[STARTUP] Syncing system crontab with database...")
        crons.sync()
    except Exception as e:
        print(f"[STARTUP] Error syncing crons: {e}")

# --- Pydantic Models ---
class CronJobInput(BaseModel):
    id: str
    command: str  # Frontend will construct this full string
    time: str  # "HH:MM"
    frequency: str  # "daily", "weekly"
    enabled: bool = True

class TransmitRequest(BaseModel):
    service: str
    duration: int

class RadioConfigInput(BaseModel):
    default_service: str
    default_duration_minutes: int
    default_offset: int = 0  # Offset in seconds (-60 to 60)
    default_offset_enabled: bool = False

# --- Helpers ---
def friendly_to_cron(time_str: str, freq: str) -> str:
    """Converts '14:30' + 'daily' -> '30 14 * * *'"""
    try:
        hour, minute = time_str.split(":")
        int(hour), int(minute)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")

    if freq == "daily":   return f"{minute} {hour} * * *"
    if freq == "weekly":  return f"{minute} {hour} * * 0"
    if freq == "monthly": return f"{minute} {hour} 1 * *"
    return f"{minute} {hour} * * *"


def cron_to_friendly(schedule_str: str):
    """Converts '30 14 * * *' -> {time: '14:30', freq: 'daily'}"""
    parts = schedule_str.split()
    if len(parts) != 5:
        return {"time": "00:00", "frequency": "custom"}

    minute, hour, dom, month, dow = parts
    time_str = f"{hour.zfill(2)}:{minute.zfill(2)}"

    if dom == "*" and month == "*" and dow == "*":
        freq = "daily"
    elif dom == "*" and month == "*" and dow != "*":
        freq = "weekly"
    elif dom != "*" and month == "*" and dow == "*":
        freq = "monthly"
    else:
        freq = "custom"

    return {"time": time_str, "frequency": freq}


def parse_txtempus_command(cmd: str):
    """
    Extracts Service, Duration, and Offset from the raw command string.
    Example: '/usr/bin/txtempus -s DCF77 -r 255 -o 10'
    """
    details = {
        "is_txtempus": False,
        "service": "DCF77",  # Default
        "duration": "10",
        "offset": "0"
    }

    if "txtempus" in cmd:
        details["is_txtempus"] = True

        # Regex to find flags
        # -s (Service)
        m_svc = re.search(r'-s\s+(\w+)', cmd)
        if m_svc: details['service'] = m_svc.group(1)

        # -r (Duration/Runtime)
        m_dur = re.search(r'-r\s+(\d+)', cmd)
        if m_dur: details['duration'] = m_dur.group(1)

        # -z (Offset in minutes - txtempus time zone offset)
        m_off = re.search(r'-z\s+([+-]?\d+)', cmd)
        if m_off:
            # Store in minutes (matches txtempus -z flag and API)
            details['offset'] = m_off.group(1)

    return details


# --- Input Validation Functions ---

def validate_service(service: str) -> str:
    """
    Validate and sanitize service name against available services.

    Args:
        service: Service name to validate

    Returns:
        Validated service name

    Raises:
        HTTPException: If service is not in available_services list
    """
    # Get available services from database
    available_json = db.get_setting("radio_config", "available_services", '["DCF77","WWVB","MSF","JJY40","JJY60"]')

    # Parse if it's a string, otherwise use as-is (get_category returns parsed values)
    if isinstance(available_json, str):
        available = json.loads(available_json)
    else:
        available = available_json

    if service not in available:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid service '{service}'. Must be one of: {', '.join(available)}"
        )
    return service


def validate_duration(duration: int) -> int:
    """
    Validate broadcast duration.
    
    Args:
        duration: Duration in minutes

    Returns:
        Validated duration

    Raises:
        HTTPException: If duration is out of bounds
    """
    if not isinstance(duration, int) or duration < 1 or duration > 720:
        raise HTTPException(
            status_code=400,
            detail="Duration must be between 1 and 720 minutes"
        )
    return duration


def validate_offset(offset: int) -> int:
    """
    Validate time offset parameter for broadcast synchronization.

    Args:
        offset: Time offset in minutes (matches txtempus -z flag)

    Returns:
        Validated offset in minutes

    Raises:
        HTTPException: If offset is out of reasonable bounds
    """
    # Allow up to +/- 12 hours (720 minutes)
    if not isinstance(offset, int) or offset < -720 or offset > 720:
        raise HTTPException(
            status_code=400,
            detail="Offset must be between -720 and 720 minutes"
        )
    return offset


def validate_txtempus_command(command: str) -> dict:
    """
    Validate a full txtempus command string by parsing and validating its components.

    Args:
        command: Full txtempus command string

    Returns:
        Dict with validated service, duration, and offset

    Raises:
        HTTPException: If any component is invalid
    """
    parsed = parse_txtempus_command(command)

    if not parsed["is_txtempus"]:
        raise HTTPException(
            status_code=400,
            detail="Command must be a valid txtempus command"
        )

    # Validate each extracted component
    service = validate_service(parsed["service"])
    duration = validate_duration(int(parsed["duration"]))
    offset = validate_offset(int(parsed["offset"]))

    return {
        "service": service,
        "duration": duration,
        "offset": offset
    }


def update_all_cron_offsets(new_offset: int, offset_enabled: bool) -> int:
    """
    Update all txtempus cron jobs with new offset settings.

    This function rebuilds all txtempus commands in cron jobs to either:
    - Add the new offset if enabled and non-zero
    - Remove the offset if disabled or zero

    Args:
        new_offset: New offset value in minutes
        offset_enabled: Whether offset should be applied

    Returns:
        Number of cron jobs updated
    """
    jobs = db.get_cron_jobs()
    updated_count = 0

    for job in jobs:
        # Only update txtempus commands
        if not job.get("radio_details", {}).get("is_txtempus"):
            continue

        # Parse current command
        details = job["radio_details"]
        service = details["service"]
        duration = details["duration"]

        # Rebuild command with new offset settings
        cmd = f'/usr/bin/txtempus -s {service} -r {duration}'

        # Add offset if enabled and non-zero
        if offset_enabled and new_offset != 0:
            cmd += f' -z {new_offset}'

        # Update the job in database
        db.add_or_update_cron_job(
            job_id=job["id"],
            command=cmd,
            schedule=job["schedule"],
            enabled=job["enabled"]
        )

        updated_count += 1
        print(f"Updated cron job {job['id']}: offset={'enabled' if offset_enabled else 'disabled'}")

    return updated_count


# --- Routes ---

@app.get("/api/status")
async def get_status():
    """Get current system status from database"""
    
    # Get basic running state
    is_running = bool(db.get_status_value("services", "txtempus_running", False))
    
    # Get extended details if available
    details = db.get_status_value("services", "txtempus_details", {})
    
    # Calculate remaining time if running
    remaining_seconds = 0
    if is_running and isinstance(details, dict) and details.get("started_at") and details.get("duration"):
        try:
            # Parse ps lstart format: "Mon Jan 26 17:00:00 2026"
            # Note: ps lstart does not include time zone, but is local system time
            # We assume system time is correct
            start_dt = datetime.strptime(details["started_at"], "%a %b %d %H:%M:%S %Y")
            duration_min = int(details["duration"])
            end_dt = start_dt.timestamp() + (duration_min * 60)
            remaining_seconds = max(0, int(end_dt - datetime.now().timestamp()))
        except Exception as e:
            print(f"Error calculating remaining time: {e}")

    return {
        "system_time": datetime.now().isoformat(),
        "services": {
            "txtempus_running": is_running,
            "txtempus_service": details.get("service") if isinstance(details, dict) else None,
            "txtempus_duration": details.get("duration") if isinstance(details, dict) else None,
            "txtempus_started_at": details.get("started_at") if isinstance(details, dict) else None,
            "txtempus_remaining_seconds": remaining_seconds
        },
        "ntp_status": {
            "synced": bool(db.get_status_value("ntp_status", "synced", False)),
            "score": float(db.get_status_value("ntp_status", "score", "0")),
            "last_rx_seconds": float(db.get_status_value("ntp_status", "last_rx_seconds", "0")),
            "server": db.get_status_value("ntp_status", "server", "")
        },
        "internet_status": {
            "connected": bool(db.get_status_value("internet_status", "connected", False)),
            "score": float(db.get_status_value("internet_status", "score", "0")),
            "ping_ms": float(db.get_status_value("internet_status", "ping_ms", "0"))
        },
        "app_config": {
            "stealth_mode": bool(db.get_setting("app_config", "stealth_mode", False))
        },
        "git_commit": get_git_commit()
    }

def get_git_commit():
    """Get current short git commit hash"""
    try:
        # Resolve absolute path to project root
        import os
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Use git rev-parse for speed
        # Run as user 'time' to match environment
        cmd = ['sudo', '-u', 'time', 'git', '-C', base_dir, 'rev-parse', '--short', 'HEAD']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1)
        
        if result.returncode == 0:
            return result.stdout.strip()
        return "unknown"
    except:
        return "unknown"
@app.get("/api/crons")
async def get_crons():
    """Get all cron jobs with friendly schedule and command parsing"""
    # db.get_cron_jobs() now returns jobs with friendly_time, friendly_freq, and radio_details
    return db.get_cron_jobs()


@app.post("/api/crons")
async def add_or_update_cron(job: CronJobInput):
    """
    Add or update a cron job with validation.

    Validates txtempus command parameters before saving to database.
    """
    # SECURITY: Validate the txtempus command before saving
    validate_txtempus_command(job.command)

    cron_schedule = friendly_to_cron(job.time, job.frequency)

    # Use direct database API
    db.add_or_update_cron_job(
        job_id=job.id,
        command=job.command,
        schedule=cron_schedule,
        enabled=job.enabled
    )

    try:
        crons.sync()
    except Exception as e:
        print(f"Sync Error: {e}")

    return {"status": "success"}


@app.delete("/api/crons/{job_id}")
async def delete_cron(job_id: str):
    """Delete a cron job by ID"""
    # Use direct database API
    deleted = db.delete_cron_job(job_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")

    crons.sync()
    return {"status": "deleted"}


@app.get("/api/settings/radio")
async def get_radio_config():
    """Get radio configuration settings"""
    config = db.get_category("radio_config")

    # Define defaults
    defaults = {
        "default_service": "DCF77",
        "default_duration_minutes": 10,
        "default_offset": 0,
        "default_offset_enabled": False,
        "available_services": ["DCF77", "WWVB", "MSF", "JJY40", "JJY60"]
    }

    # Merge with defaults (database values take precedence)
    for key, default_value in defaults.items():
        if key not in config:
            config[key] = default_value
        # Parse JSON string for available_services if needed
        elif key == "available_services" and isinstance(config[key], str):
            config[key] = json.loads(config[key])
        elif key == "default_offset_enabled":
            # Ensure boolean
             if isinstance(config[key], str):
                config[key] = config[key].lower() == "true"

    # Ensure numeric types
    if "default_duration_minutes" in config:
        config["default_duration_minutes"] = int(config["default_duration_minutes"])
    if "default_offset" in config:
        config["default_offset"] = int(config["default_offset"])

    return config


@app.post("/api/settings/radio")
async def update_radio_config(conf: RadioConfigInput):
    """
    Update radio configuration defaults.

    Validates service name, duration, and offset before saving.
    Automatically updates all existing cron jobs with new offset settings.
    """
    # SECURITY: Validate inputs
    service = validate_service(conf.default_service)
    duration = validate_duration(conf.default_duration_minutes)
    offset = validate_offset(conf.default_offset)

    # Use direct database API
    db.set_setting("radio_config", "default_service", service)
    db.set_setting("radio_config", "default_duration_minutes", str(duration))
    db.set_setting("radio_config", "default_offset", str(offset))
    db.set_setting("radio_config", "default_offset_enabled", str(conf.default_offset_enabled).lower())

    # Update all existing cron jobs with new offset settings
    updated_count = update_all_cron_offsets(offset, conf.default_offset_enabled)

    # Sync to system crontab if any jobs were updated
    if updated_count > 0:
        try:
            crons.sync()
            print(f"Updated {updated_count} cron job(s) with new offset settings and synced to crontab")
        except Exception as e:
            print(f"Cron sync error after offset update: {e}")

    return {
        "status": "updated",
        "cron_jobs_updated": updated_count
    }


@app.get("/api/debug/crontab")
async def debug_crontab():
    """Debug endpoint to see system crontab vs database"""
    from crontab import CronTab
    import os
    import getpass

    # Get database jobs
    db_jobs = db.get_cron_jobs()

    # Check current user
    current_user = getpass.getuser()
    current_uid = os.getuid()

    # Get system crontab - root's crontab (requires backend running as root)
    try:
        cron = CronTab(user='root')
        system_jobs = []
        for job in cron:
            system_jobs.append({
                "id": job.comment,
                "command": job.command,
                "schedule": str(job.slices),
                "enabled": job.is_enabled()
            })
    except Exception as e:
        system_jobs = {"error": str(e)}

    return {
        "process_user": current_user,
        "process_uid": current_uid,
        "database_jobs": db_jobs,
        "system_crontab": system_jobs,
        "sync_status": "Run POST /api/crons to trigger sync"
    }


@app.post("/api/control/stealth")
async def toggle_stealth():
    """Toggle LED stealth mode"""
    # Get current state (get_setting returns boolean if value is "true"/"false")
    current = bool(db.get_setting("app_config", "stealth_mode", False))

    # Toggle
    new_value = "true" if not current else "false"
    db.set_setting("app_config", "stealth_mode", new_value)

    return {"stealth_mode": new_value == "true"}


@app.post("/api/control/transmit")
async def manual_transmit(req: TransmitRequest):
    """
    Start a manual broadcast transmission.

    Validates service name and duration before executing subprocess.
    Prevents command injection by whitelisting service names.
    """
    # SECURITY: Validate inputs before subprocess call
    service = validate_service(req.service)
    duration = validate_duration(req.duration)

    # Get default offset from settings
    offset = int(db.get_setting("radio_config", "default_offset", "0"))
    offset_enabled = str(db.get_setting("radio_config", "default_offset_enabled", "true")).lower() == "true"

    # 1. Kill any existing instance
    subprocess.run(['sudo', 'pkill', 'txtempus'])

    # 2. Start new instance with validated parameters
    cmd = ['sudo', '/usr/bin/txtempus', '-s', service, '-r', str(duration)]

    # Add offset if non-zero AND enabled
    if offset != 0 and offset_enabled:
        cmd.extend(['-z', str(offset)])

    subprocess.Popen(cmd)

    return {"status": "started", "service": service, "duration": duration}


@app.post("/api/control/stop")
async def stop_transmit():
    """Stop any running broadcast"""
    subprocess.run(['sudo', 'pkill', 'txtempus'])
    return {"status": "stopped"}


@app.post("/api/control/restart")
async def restart_server():
    """Execute the restart script to reboot services"""
    import os
    
    # Resolve absolute path to restart script (two levels up from this file: backend -> airtime-server -> root)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')
    
    if not os.path.exists(script_path):
        raise HTTPException(status_code=500, detail="Restart script not found")
        
    # Run in background so we don't block
    subprocess.Popen(['sudo', script_path])
    return {"status": "restarting"}


@app.post("/api/control/restart-pi")
async def restart_pi():
    """Reboot the entire Raspberry Pi"""
    # Run in background so we don't block
    subprocess.Popen(['sudo', 'reboot'])
    return {"status": "rebooting"}


@app.get("/api/system/check-updates")
async def check_updates():
    """
    Check if there are updates available from git remote.
    Compares local HEAD with origin/master.
    """
    import os

    # Resolve absolute path to project root
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    try:
        # IMPORTANT: Run git commands as user 'time' (not root) to use correct SSH keys
        # Service runs as root, but git repo and SSH keys are owned by user 'time'

        # Fetch latest from origin (doesn't modify working directory)
        fetch_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'fetch', 'origin'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10
        )

        # Log fetch result for debugging
        print(f"[UPDATE CHECK] git fetch returncode: {fetch_result.returncode}")
        if fetch_result.returncode != 0:
            print(f"[UPDATE CHECK] git fetch stderr: {fetch_result.stderr}")
            print(f"[UPDATE CHECK] git fetch stdout: {fetch_result.stdout}")
        else:
            print(f"[UPDATE CHECK] git fetch successful")

        # Get local commit hash
        local_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'rev-parse', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=5
        )
        local_commit = local_result.stdout.strip()

        # Get remote commit hash
        remote_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'rev-parse', 'origin/master'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=5
        )
        remote_commit = remote_result.stdout.strip()

        # Get short commit hashes for display
        local_short = local_commit[:7] if local_commit else "unknown"
        remote_short = remote_commit[:7] if remote_commit else "unknown"

        updates_available = local_commit != remote_commit

        return {
            "updates_available": updates_available,
            "local_commit": local_short,
            "remote_commit": remote_short
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Git operation timed out")
    except Exception as e:
        print(f"Error checking for updates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check updates: {str(e)}")


@app.post("/api/system/apply-update")
async def apply_update():
    """
    Apply available updates by running git pull and restarting services.
    This will restart the server, causing a brief disconnect.
    """
    import os

    # Resolve absolute paths
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')

    print(f"[APPLY UPDATE] Base dir: {base_dir}")
    print(f"[APPLY UPDATE] Restart script: {script_path}")

    if not os.path.exists(script_path):
        print(f"[APPLY UPDATE] ERROR: Restart script not found at {script_path}")
        raise HTTPException(status_code=500, detail="Restart script not found")

    # Check if restart script is executable
    if not os.access(script_path, os.X_OK):
        print(f"[APPLY UPDATE] ERROR: Restart script not executable")
        raise HTTPException(status_code=500, detail="Restart script not executable")

    try:
        # Build the update command
        # IMPORTANT: Run git commands as user 'time' to use correct SSH keys
        # We explicitly set HOME to ensure git finds the user's config/keys
        # We use git -C to ensure we operate in the correct directory
        update_cmd = f"""
        echo "========================================" >> /tmp/airtime-update.log
        echo "[UPDATE] Starting update at $(date)" >> /tmp/airtime-update.log
        
        # Enable verbose exit on error
        set -e
        # Enable command printing
        set -x
        
        # Diagnostic Info
        echo "[UPDATE] Current User: $(whoami)" >> /tmp/airtime-update.log
        echo "[UPDATE] Target Dir: {base_dir}" >> /tmp/airtime-update.log
        
        # Git Diagnostics
        sudo -u time bash -c "export HOME=/home/time; /usr/bin/git -C {base_dir} remote -v" >> /tmp/airtime-update.log 2>&1
        sudo -u time bash -c "export HOME=/home/time; /usr/bin/git -C {base_dir} status" >> /tmp/airtime-update.log 2>&1

        # Git Pull
        echo "[UPDATE] Running git pull..." >> /tmp/airtime-update.log
        if sudo -u time bash -c "export HOME=/home/time; /usr/bin/git -C {base_dir} pull"; then
            echo "[UPDATE] Git pull successful" >> /tmp/airtime-update.log
        else
            echo "[UPDATE] ERROR: Git pull failed with code $?" >> /tmp/airtime-update.log
            exit 1
        fi

        echo "[UPDATE] Running restart script..." >> /tmp/airtime-update.log
        if sudo {script_path}; then
            echo "[UPDATE] Restart script executed" >> /tmp/airtime-update.log
        else
            echo "[UPDATE] ERROR: Restart script failed" >> /tmp/airtime-update.log
            exit 1
        fi
        
        echo "[UPDATE] Update sequence complete" >> /tmp/airtime-update.log 2>&1
        """

        print("[APPLY UPDATE] Starting update process in background")
        print(f"[APPLY UPDATE] Command: {update_cmd[:100]}...")

        subprocess.Popen(
            ['bash', '-c', update_cmd],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        print("[APPLY UPDATE] Update process spawned successfully")
        print("[APPLY UPDATE] Check /tmp/airtime-update.log on the Pi for progress")

        return {
            "status": "updating",
            "message": "Update applied, services restarting..."
        }

    except Exception as e:
        print(f"[APPLY UPDATE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to apply update: {str(e)}")


# --- System Metrics ---

import psutil
import os
import time

def get_cpu_temp():
    """Get CPU temperature (Raspberry Pi specific)"""
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(float(f.read()) / 1000.0, 1)
    except:
        return 0.0

@app.get("/api/system/metrics")
async def get_system_metrics():
    """Get real-time system performance metrics"""
    return {
        "cpu": {
            "percent": psutil.cpu_percent(interval=None), # Non-blocking
            "per_core": psutil.cpu_percent(interval=None, percpu=True),
            "load_avg": os.getloadavg()
        },
        "memory": {
            "total": psutil.virtual_memory().total,
            "available": psutil.virtual_memory().available,
            "percent": psutil.virtual_memory().percent,
            "swap_percent": psutil.swap_memory().percent
        },
        "disk": {
            "total": psutil.disk_usage('/').total,
            "used": psutil.disk_usage('/').used,
            "percent": psutil.disk_usage('/').percent
        },
        # "network" removed per user request
        "temperature": get_cpu_temp(),
        "uptime": time.time() - psutil.boot_time()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)