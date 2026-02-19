from datetime import datetime
import subprocess
import json
import os
import threading
import time
import re

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator, Field
from typing import Literal
import psutil
import logging
import logging.handlers

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

    # Setup audit logging
    setup_audit_logging()


def setup_audit_logging():
    """Configure syslog handler for audit logs"""
    global audit_logger
    audit_logger = logging.getLogger("airtime.audit")
    audit_logger.setLevel(logging.INFO)

    # Syslog handler (goes to journalctl)
    try:
        syslog_handler = logging.handlers.SysLogHandler(address='/dev/log')
        syslog_format = logging.Formatter('airtime-audit: %(message)s')
        syslog_handler.setFormatter(syslog_format)
        audit_logger.addHandler(syslog_handler)
    except:
        # If syslog not available (e.g., macOS dev environment), skip it
        pass

    # Also log to console for debugging
    console_handler = logging.StreamHandler()
    console_format = logging.Formatter('[AUDIT] %(message)s')
    console_handler.setFormatter(console_format)
    audit_logger.addHandler(console_handler)

    print("[STARTUP] Audit logging initialized")


def get_client_ip(request: Request) -> str:
    """Extract real client IP from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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



class TimeTesterRequest(BaseModel):
    enabled: bool
    service: str = "DCF77"
    duration_hours: int = 12

    @field_validator('service')
    @classmethod
    def validate_service_field(cls, v: str) -> str:
        if len(v) > 20:
            raise ValueError("Service name too long")
        return v.upper()

    @field_validator('duration_hours')
    @classmethod
    def validate_duration_field(cls, v: int) -> int:
        if v not in [12, 24]:
            raise ValueError("Duration must be 12 or 24 hours")
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


def get_git_branch():
    return "experimental"


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
        "git_commit": get_git_commit(),
        "git_branch": get_git_branch()
    }


@app.get("/api/crons")
async def get_crons():
    return db.get_cron_jobs()


@app.post("/api/crons")
async def add_or_update_cron(job: CronJobInput, request: Request):
    validated = validate_txtempus_command(job.command)

    # Always use the current global offset from DB, not whatever the frontend sent.
    # This prevents stale-offset bugs when the user updates the offset and immediately adds a new job.
    global_offset = int(db.get_setting("radio_config", "default_offset", "0"))
    global_offset_enabled = str(db.get_setting("radio_config", "default_offset_enabled", "false")).lower() == "true"

    safe_command = f"/usr/bin/txtempus -s {validated['service']} -r {validated['duration']}"
    if global_offset_enabled and global_offset != 0:
        safe_command += f" -z {global_offset}"

    cron_schedule = friendly_to_cron(job.time, job.frequency)

    # Check if this is an update or create
    existing_job = db.get_cron_jobs()
    is_update = any(j.get('id') == job.id for j in existing_job)

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

    # Audit log
    client_ip = get_client_ip(request)
    action = "updated" if is_update else "created"
    audit_logger.info(f"Cron job {action}: id={job.id}, time={job.time}, freq={job.frequency}, service={validated['service']}, duration={validated['duration']}min, enabled={job.enabled}, ip={client_ip}")

    return {"status": "success"}


@app.delete("/api/crons/{job_id}")
async def delete_cron(job_id: str, request: Request):
    if not db.delete_cron_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    crons.sync()

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Cron job deleted: id={job_id}, ip={client_ip}")

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
async def update_radio_config(conf: RadioConfigInput, request: Request):
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

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Radio config updated: service={service}, duration={duration}min, offset={offset}min, offset_enabled={conf.default_offset_enabled}, cron_jobs_updated={updated_count}, ip={client_ip}")

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
async def manual_transmit(req: TransmitRequest, request: Request):
    service = validate_service(req.service)
    duration = validate_duration(req.duration)

    offset = int(db.get_setting("radio_config", "default_offset", "0"))
    offset_enabled = str(db.get_setting("radio_config", "default_offset_enabled", "true")).lower() == "true"

    subprocess.run(['sudo', 'pkill', 'txtempus'])

    cmd = ['sudo', '/usr/bin/txtempus', '-s', service, '-r', str(duration)]
    if offset != 0 and offset_enabled:
        cmd.extend(['-z', str(offset)])

    subprocess.Popen(cmd)

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Manual transmit started: service={service}, duration={duration}min, ip={client_ip}")

    return {"status": "started", "service": service, "duration": duration}


@app.post("/api/control/stop")
async def stop_transmit(request: Request):
    subprocess.run(['sudo', 'pkill', 'txtempus'])

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Transmit stopped, ip={client_ip}")

    return {"status": "stopped"}



def enable_time_tester(service: str, duration_hours: int):
    # 1. Stop any running txtempus
    subprocess.run(['sudo', 'pkill', 'txtempus'])

    # 2. Pause all crons
    crons.pause_all_crons()

    # 3. Start txtempus in background
    # Fixed time 00:00, specified service
    # Duration converted to minutes
    duration_minutes = duration_hours * 60
    
    # Construct time string YYYY-MM-DD 00:00
    # txtempus requires full date-time format
    start_time_str = time.strftime("%Y-%m-%d 00:00")
    
    cmd = ['sudo', '/usr/bin/txtempus', '-s', service, '-t', start_time_str, '-r', str(duration_minutes)]
    
    subprocess.Popen(cmd)

    # 4. Update status in DB
    db.update_status("services", "txtempus_running", True)
    db.update_status("services", "txtempus_details", {
        "service": service,
        "duration": duration_minutes,
        "started_at": time.ctime(),
        "is_tester": True
    })
    
    # 5. Set config flags
    db.set_setting("app_config", "time_tester_active", "true")
    db.set_setting("app_config", "time_tester_service", service)


def disable_time_tester():
    # 1. Stop txtempus
    subprocess.run(['sudo', 'pkill', 'txtempus'])

    # 2. Update status
    db.update_status("services", "txtempus_running", False)
    db.update_status("services", "txtempus_details", {})
    
    # 3. Unset config flags
    db.set_setting("app_config", "time_tester_active", "false")

    # 4. Resume crons (re-apply from DB)
    crons.resume_all_crons()


@app.get("/api/control/time-tester")
async def get_time_tester():
    enabled = str(db.get_setting("app_config", "time_tester_active", "false")).lower() == "true"
    service = db.get_setting("app_config", "time_tester_service", "DCF77")
    return {"enabled": enabled, "service": service}


@app.post("/api/control/time-tester")
async def set_time_tester_endpoint(req: TimeTesterRequest, request: Request):
    if req.enabled:
        validate_service(req.service)
        enable_time_tester(req.service, req.duration_hours)
        action = "started"
    else:
        disable_time_tester()
        action = "stopped"

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Time Tester {action}: service={req.service}, duration={req.duration_hours}h, ip={client_ip}")

    # Return status
    return {"enabled": req.enabled, "affected_jobs": len(db.get_cron_jobs())}


@app.post("/api/control/restart")
async def restart_server(request: Request):
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')

    if not os.path.exists(script_path):
        raise HTTPException(status_code=500, detail="Restart script not found")

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Server restart requested, ip={client_ip}")

    subprocess.Popen(['sudo', script_path])
    return {"status": "restarting"}


@app.post("/api/control/restart-pi")
async def restart_pi(request: Request):
    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Pi reboot requested, ip={client_ip}")

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
async def apply_update(request: Request):
    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Update started, ip={client_ip}")

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


class BranchSwitchRequest(BaseModel):
    branch: str


@app.post("/api/system/switch-branch")
async def switch_branch(req: BranchSwitchRequest, request: Request):
    target_branch = req.branch
    if target_branch not in ["master", "experimental"]:
        raise HTTPException(status_code=400, detail="Invalid branch")

    # Audit log
    client_ip = get_client_ip(request)
    audit_logger.info(f"Branch switch requested: target={target_branch}, ip={client_ip}")

    def run_switch_sequence(base_dir, script_path, branch):
        log_file = "/tmp/airtime-switch.log"

        def log(msg):
            with open(log_file, "a") as f:
                f.write(f"[SWITCH] {msg}\n")
            print(f"[SWITCH] {msg}")

        try:
            with open(log_file, "w") as f:
                f.write(f"========================================\n")
                f.write(f"[SWITCH] Starting branch switch to {branch} at {time.ctime()}\n")

            log(f"Target Dir: {base_dir}")

            log("Fetching origin...")
            cmd_env = os.environ.copy()
            cmd_env["HOME"] = "/home/time"

            fetch_res = subprocess.run(
                ['sudo', '-u', 'time', '/usr/bin/git', '-C', base_dir, 'fetch', 'origin'],
                capture_output=True,
                text=True,
                env=cmd_env
            )
            
            if fetch_res.returncode != 0:
                 log(f"WARNING: Git fetch failed (code {fetch_res.returncode})")
                 log(fetch_res.stderr)
            
            log(f"Checking out {branch}...")
            checkout_res = subprocess.run(
                ['sudo', '-u', 'time', '/usr/bin/git', '-C', base_dir, 'checkout', branch],
                capture_output=True,
                text=True,
                env=cmd_env
            )

            if checkout_res.returncode != 0:
                log(f"ERROR: Git checkout failed (code {checkout_res.returncode})")
                log(checkout_res.stderr)
                return

            log(f"Pulling latest {branch}...")
            pull_res = subprocess.run(
                ['sudo', '-u', 'time', '/usr/bin/git', '-C', base_dir, 'pull', 'origin', branch],
                capture_output=True,
                text=True,
                env=cmd_env
            )
            
            if pull_res.returncode != 0:
                 log(f"WARNING: Git pull failed (code {pull_res.returncode})")
                 log(pull_res.stderr)

            # Rebuild frontend if possible (dev env only) - production uses committed dist/
            if os.path.exists(os.path.join(base_dir, "airtime-server", "frontend", "node_modules")):
                 log("Rebuilding frontend (dev env detected)...")
                 # This might fail if npm is not in path for root/time user, but we try
                 subprocess.run(
                     ['npm', 'run', 'build'],
                     cwd=os.path.join(base_dir, "airtime-server", "frontend"),
                     capture_output=True
                 )

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

            log("Switch sequence complete")

        except Exception as e:
            log(f"EXCEPTION: {str(e)}")

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    script_path = os.path.join(base_dir, 'restart.sh')

    if not os.path.exists(script_path):
        raise HTTPException(status_code=500, detail="Restart script not found")

    t = threading.Thread(target=run_switch_sequence, args=(base_dir, script_path, target_branch))
    t.start()

    return {
        "status": "switching",
        "message": f"Switching to {target_branch} in background."
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

    # Check for SSL certificates
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ssl_cert = os.path.join(base_dir, "airtime-server", "ssl", "cert.pem")
    ssl_key = os.path.join(base_dir, "airtime-server", "ssl", "key.pem")

    if os.path.exists(ssl_cert) and os.path.exists(ssl_key):
        print(f"[STARTUP] SSL certificates found - starting HTTPS server on port 8000")
        print(f"[STARTUP]   Certificate: {ssl_cert}")
        print(f"[STARTUP]   Private key: {ssl_key}")
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            ssl_keyfile=ssl_key,
            ssl_certfile=ssl_cert
        )
    else:
        print(f"[STARTUP] SSL certificates not found - starting HTTP server on port 8000")
        print(f"[STARTUP]   Run './setup-ssl.sh' to enable HTTPS")
        uvicorn.run(app, host="0.0.0.0", port=8000)
