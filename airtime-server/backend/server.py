from datetime import datetime
import subprocess
import json
import os
import threading
import time
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator, Field
from typing import Literal
import psutil

import db
import crons

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        print("[STARTUP] Syncing system crontab with database...")
        crons.sync()
    except Exception as e:
        print(f"[STARTUP] Error syncing crons: {e}")


class CronJobInput(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    command: str = Field(max_length=512)
    time: str = Field(pattern=r'^([0-1][0-9]|2[0-3]):[0-5][0-9]$')
    frequency: Literal["daily", "weekly", "monthly"]
    enabled: bool = True

    @field_validator('id')
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("ID must contain only alphanumeric characters, dash, or underscore")
        return v


class TransmitRequest(BaseModel):
    service: str
    duration: int

    @field_validator('service')
    @classmethod
    def validate_service_field(cls, v: str) -> str:
        if len(v) > 20:
            raise ValueError("Service name too long (max 20 characters)")
        return v.upper()

    @field_validator('duration')
    @classmethod
    def validate_duration_field(cls, v: int) -> int:
        if not isinstance(v, int) or v < 1 or v > 720:
            raise ValueError("Duration must be 1-720 minutes")
        return v


class RadioConfigInput(BaseModel):
    default_service: str
    default_duration_minutes: int
    default_offset: int = 0
    default_offset_enabled: bool = False

    @field_validator('default_service')
    @classmethod
    def validate_service_field(cls, v: str) -> str:
        if len(v) > 20:
            raise ValueError("Service name too long (max 20 characters)")
        return v.upper()

    @field_validator('default_duration_minutes')
    @classmethod
    def validate_duration_field(cls, v: int) -> int:
        if not isinstance(v, int) or v < 1 or v > 720:
            raise ValueError("Duration must be 1-720 minutes")
        return v

    @field_validator('default_offset')
    @classmethod
    def validate_offset_field(cls, v: int) -> int:
        if not isinstance(v, int) or v < -720 or v > 720:
            raise ValueError("Offset must be -720 to +720 minutes")
        return v


def friendly_to_cron(time_str: str, freq: str) -> str:
    """Converts '14:30' + 'daily' -> '30 14 * * *'"""
    try:
        hour, minute = time_str.split(":")
        hour_int, minute_int = int(hour), int(minute)

        if not (0 <= hour_int <= 23):
            raise HTTPException(status_code=400, detail="Hour must be 0-23")
        if not (0 <= minute_int <= 59):
            raise HTTPException(status_code=400, detail="Minute must be 0-59")

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
    """Extracts Service, Duration, and Offset from a txtempus command string."""
    details = {
        "is_txtempus": False,
        "service": "DCF77",
        "duration": "10",
        "offset": "0"
    }

    if "txtempus" in cmd:
        details["is_txtempus"] = True

        m_svc = re.search(r'-s\s+(\w+)', cmd)
        if m_svc: details['service'] = m_svc.group(1)

        m_dur = re.search(r'-r\s+(\d+)', cmd)
        if m_dur: details['duration'] = m_dur.group(1)

        m_off = re.search(r'-z\s+([+-]?\d+)', cmd)
        if m_off: details['offset'] = m_off.group(1)

    return details


def validate_service(service: str) -> str:
    available_json = db.get_setting("radio_config", "available_services", '["DCF77","WWVB","MSF","JJY40","JJY60"]')

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
    if not isinstance(duration, int) or duration < 1 or duration > 720:
        raise HTTPException(
            status_code=400,
            detail="Duration must be between 1 and 720 minutes"
        )
    return duration


def validate_offset(offset: int) -> int:
    if not isinstance(offset, int) or offset < -720 or offset > 720:
        raise HTTPException(
            status_code=400,
            detail="Offset must be between -720 and 720 minutes"
        )
    return offset


def validate_txtempus_command(command: str) -> dict:
    parsed = parse_txtempus_command(command)

    if not parsed["is_txtempus"]:
        raise HTTPException(
            status_code=400,
            detail="Command must be a valid txtempus command"
        )

    return {
        "service": validate_service(parsed["service"]),
        "duration": validate_duration(int(parsed["duration"])),
        "offset": validate_offset(int(parsed["offset"]))
    }


def update_all_cron_offsets(new_offset: int, offset_enabled: bool) -> int:
    jobs = db.get_cron_jobs()
    updated_count = 0

    for job in jobs:
        if not job.get("radio_details", {}).get("is_txtempus"):
            continue

        details = job["radio_details"]
        cmd = f'/usr/bin/txtempus -s {details["service"]} -r {details["duration"]}'

        if offset_enabled and new_offset != 0:
            cmd += f' -z {new_offset}'

        db.add_or_update_cron_job(
            job_id=job["id"],
            command=cmd,
            schedule=job["schedule"],
            enabled=job["enabled"]
        )

        updated_count += 1
        print(f"Updated cron job {job['id']}: offset={'enabled' if offset_enabled else 'disabled'}")

    return updated_count


def get_git_commit():
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        cmd = ['sudo', '-u', 'time', 'git', '-C', base_dir, 'rev-parse', '--short', 'HEAD']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1)
        if result.returncode == 0:
            return result.stdout.strip()
        return "unknown"
    except:
        return "unknown"


def get_cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            return round(float(f.read()) / 1000.0, 1)
    except:
        return 0.0


@app.get("/api/status")
async def get_status():
    is_running = bool(db.get_status_value("services", "txtempus_running", False))
    details = db.get_status_value("services", "txtempus_details", {})

    remaining_seconds = 0
    if is_running and isinstance(details, dict) and details.get("started_at") and details.get("duration"):
        try:
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


@app.get("/api/crons")
async def get_crons():
    return db.get_cron_jobs()


@app.post("/api/crons")
async def add_or_update_cron(job: CronJobInput):
    validated = validate_txtempus_command(job.command)

    safe_command = f"/usr/bin/txtempus -s {validated['service']} -r {validated['duration']}"
    if validated['offset'] != 0:
        safe_command += f" -z {validated['offset']}"

    cron_schedule = friendly_to_cron(job.time, job.frequency)

    db.add_or_update_cron_job(
        job_id=job.id,
        command=safe_command,
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
    if not db.delete_cron_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    crons.sync()
    return {"status": "deleted"}


@app.get("/api/settings/radio")
async def get_radio_config():
    config = db.get_category("radio_config")

    defaults = {
        "default_service": "DCF77",
        "default_duration_minutes": 10,
        "default_offset": 0,
        "default_offset_enabled": False,
        "available_services": ["DCF77", "WWVB", "MSF", "JJY40", "JJY60"]
    }

    for key, default_value in defaults.items():
        if key not in config:
            config[key] = default_value
        elif key == "available_services" and isinstance(config[key], str):
            config[key] = json.loads(config[key])
        elif key == "default_offset_enabled":
             if isinstance(config[key], str):
                config[key] = config[key].lower() == "true"

    if "default_duration_minutes" in config:
        config["default_duration_minutes"] = int(config["default_duration_minutes"])
    if "default_offset" in config:
        config["default_offset"] = int(config["default_offset"])

    return config


@app.post("/api/settings/radio")
async def update_radio_config(conf: RadioConfigInput):
    service = validate_service(conf.default_service)
    duration = validate_duration(conf.default_duration_minutes)
    offset = validate_offset(conf.default_offset)

    db.set_setting("radio_config", "default_service", service)
    db.set_setting("radio_config", "default_duration_minutes", str(duration))
    db.set_setting("radio_config", "default_offset", str(offset))
    db.set_setting("radio_config", "default_offset_enabled", str(conf.default_offset_enabled).lower())

    updated_count = update_all_cron_offsets(offset, conf.default_offset_enabled)

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


@app.post("/api/control/stealth")
async def toggle_stealth():
    current = bool(db.get_setting("app_config", "stealth_mode", False))
    new_value = "true" if not current else "false"
    db.set_setting("app_config", "stealth_mode", new_value)
    return {"stealth_mode": new_value == "true"}


@app.post("/api/control/transmit")
async def manual_transmit(req: TransmitRequest):
    service = validate_service(req.service)
    duration = validate_duration(req.duration)

    offset = int(db.get_setting("radio_config", "default_offset", "0"))
    offset_enabled = str(db.get_setting("radio_config", "default_offset_enabled", "true")).lower() == "true"

    subprocess.run(['sudo', 'pkill', 'txtempus'])

    cmd = ['sudo', '/usr/bin/txtempus', '-s', service, '-r', str(duration)]
    if offset != 0 and offset_enabled:
        cmd.extend(['-z', str(offset)])

    subprocess.Popen(cmd)
    return {"status": "started", "service": service, "duration": duration}


@app.post("/api/control/stop")
async def stop_transmit():
    subprocess.run(['sudo', 'pkill', 'txtempus'])
    return {"status": "stopped"}


@app.post("/api/control/restart")
async def restart_server():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')

    if not os.path.exists(script_path):
        raise HTTPException(status_code=500, detail="Restart script not found")

    subprocess.Popen(['sudo', script_path])
    return {"status": "restarting"}


@app.post("/api/control/restart-pi")
async def restart_pi():
    subprocess.Popen(['sudo', 'reboot'])
    return {"status": "rebooting"}


@app.get("/api/system/check-updates")
async def check_updates():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    try:
        fetch_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'fetch', 'origin'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10
        )

        print(f"[UPDATE CHECK] git fetch returncode: {fetch_result.returncode}")
        if fetch_result.returncode != 0:
            print(f"[UPDATE CHECK] git fetch stderr: {fetch_result.stderr}")
            print(f"[UPDATE CHECK] git fetch stdout: {fetch_result.stdout}")
        else:
            print(f"[UPDATE CHECK] git fetch successful")

        local_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'rev-parse', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=5
        )
        local_commit = local_result.stdout.strip()

        remote_result = subprocess.run(
            ['sudo', '-u', 'time', '/usr/bin/git', 'rev-parse', 'origin/master'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=5
        )
        remote_commit = remote_result.stdout.strip()

        return {
            "updates_available": local_commit != remote_commit,
            "local_commit": local_commit[:7] if local_commit else "unknown",
            "remote_commit": remote_commit[:7] if remote_commit else "unknown"
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Git operation timed out")
    except Exception as e:
        print(f"Error checking for updates: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check updates: {str(e)}")


@app.post("/api/system/apply-update")
async def apply_update():
    def run_update_sequence(base_dir, script_path):
        log_file = "/tmp/airtime-update.log"

        def log(msg):
            with open(log_file, "a") as f:
                f.write(f"[UPDATE] {msg}\n")
            print(f"[UPDATE] {msg}")

        try:
            with open(log_file, "w") as f:
                f.write(f"========================================\n")
                f.write(f"[UPDATE] Starting update at {time.ctime()}\n")

            log(f"Target Dir: {base_dir}")

            log("Running git pull...")
            cmd_env = os.environ.copy()
            cmd_env["HOME"] = "/home/time"

            result = subprocess.run(
                ['sudo', '-u', 'time', '/usr/bin/git', '-C', base_dir, 'pull'],
                capture_output=True,
                text=True,
                env=cmd_env
            )

            if result.returncode == 0:
                log("Git pull successful")
                log(result.stdout)
            else:
                log(f"ERROR: Git pull failed (code {result.returncode})")
                log(result.stderr)
                return

            log("Running restart script...")
            restart_res = subprocess.run(
                ['sudo', script_path],
                capture_output=True,
                text=True
            )

            if restart_res.returncode == 0:
                log("Restart script executed successfully")
            else:
                log(f"ERROR: Restart script failed (code {restart_res.returncode})")
                log(restart_res.stderr)

            log("Update sequence complete")

        except Exception as e:
            log(f"EXCEPTION: {str(e)}")

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')

    if not os.path.exists(script_path):
        print(f"[APPLY UPDATE] ERROR: Restart script not found at {script_path}")
        raise HTTPException(status_code=500, detail="Restart script not found")

    t = threading.Thread(target=run_update_sequence, args=(base_dir, script_path))
    t.start()

    return {
        "status": "updating",
        "message": "Update started in background. Check /tmp/airtime-update.log for details."
    }


@app.get("/api/system/metrics")
async def get_system_metrics():
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    return {
        "cpu": {
            "percent": psutil.cpu_percent(interval=None),
            "per_core": psutil.cpu_percent(interval=None, percpu=True),
            "load_avg": os.getloadavg()
        },
        "memory": {
            "total": mem.total,
            "available": mem.available,
            "percent": mem.percent,
            "swap_percent": psutil.swap_memory().percent
        },
        "disk": {
            "total": disk.total,
            "used": disk.used,
            "percent": disk.percent
        },
        "temperature": get_cpu_temp(),
        "uptime": time.time() - psutil.boot_time()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
