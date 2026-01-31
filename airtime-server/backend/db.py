"""
SQLite-based database module for AirTime.
Fully normalized schema - no JSON blobs, proper relational structure.
"""
import sqlite3
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional, List
from contextlib import contextmanager

# Database directory and file path
# Use parent directory of backend/ to find top-level database/
DB_DIR = Path(__file__).parent.parent / "database"
DB_FILE = DB_DIR / "airtime.db"

# Legacy JSON files (for one-time migration only)
SETTINGS_FILE = "settings.json"
STATUS_FILE = "status.json"


# --- Database Schema ---

SCHEMA = """
-- Settings table (normalized like status table)
-- category examples: "radio_config", "app_config"
CREATE TABLE IF NOT EXISTS settings (
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category, key)
);

-- Status table (real-time system state)
CREATE TABLE IF NOT EXISTS status (
    section TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (section, key)
);

-- Cron jobs table (dedicated storage for scheduled tasks)
CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    schedule TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_status_section ON status(section);
"""


# --- Connection Management ---

@contextmanager
def get_connection():
    """Get a database connection with WAL mode for concurrent access."""
    conn = sqlite3.connect(str(DB_FILE), timeout=10.0)
    conn.row_factory = sqlite3.Row
    
    # Enable WAL mode for better concurrent read/write
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_database() -> None:
    """Initialize database with schema."""
    # Ensure database directory exists
    DB_DIR.mkdir(exist_ok=True)
    
    with get_connection() as conn:
        conn.executescript(SCHEMA)
    print(f"Database initialized: {DB_FILE}")


# --- BACKWARD COMPATIBLE API ---

# --- Status API (Atomic Updates) ---

def update_status(section: str, key: str, value: Any) -> None:
    """Update status value atomically."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO status (section, key, value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section, key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (section, key, json.dumps(value) if isinstance(value, (dict, list, bool)) else str(value))
        )


# --- Settings & Status API ---

def get_setting(category: str, key: str, default: Any = None) -> Any:
    """
    Get a specific setting value.
    
    Args:
        category: Category name (e.g., "radio_config", "app_config")
        key: Setting key
        default: Default value if not found
    """
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE category = ? AND key = ?",
            (category, key)
        ).fetchone()
        
        if row:
            value = row['value']
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                if value.lower() in ('true', 'false'):
                    return value.lower() == 'true'
                elif value.isdigit():
                    return int(value)
                return value
        return default


def set_setting(category: str, key: str, value: Any) -> None:
    """Set a specific setting value."""
    with get_connection() as conn:
        if isinstance(value, (list, dict)):
            value = json.dumps(value)
        elif isinstance(value, bool):
            value = str(value)
        
        conn.execute(
            """
            INSERT INTO settings (category, key, value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(category, key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (category, key, str(value))
        )


def get_category(category: str) -> Dict[str, Any]:
    """Get all settings in a category."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT key, value FROM settings WHERE category = ?",
            (category,)
        ).fetchall()
        
        result = {}
        for row in rows:
            try:
                result[row['key']] = json.loads(row['value'])
            except (json.JSONDecodeError, ValueError):
                value = row['value']
                if value.lower() in ('true', 'false'):
                    result[row['key']] = value.lower() == 'true'
                elif value.isdigit():
                    result[row['key']] = int(value)
                else:
                    result[row['key']] = value
        
        return result


def get_status_value(section: str, key: str, default: Any = None) -> Any:
    """Get a specific status value."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM status WHERE section = ? AND key = ?",
            (section, key)
        ).fetchone()
        
        if row:
            try:
                return json.loads(row['value'])
            except (json.JSONDecodeError, ValueError):
                return row['value']
        return default


# --- CRON JOBS API ---

def get_cron_jobs() -> List[Dict[str, Any]]:
    """
    Get all cron jobs with friendly time/frequency parsing.

    Returns list of jobs with additional fields:
    - friendly_time: "HH:MM" format
    - friendly_freq: "daily", "weekly", "monthly", or "custom"
    - radio_details: Parsed txtempus command details
    """
    import re

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, command, schedule, enabled, created_at, updated_at FROM cron_jobs ORDER BY created_at"
        ).fetchall()

    jobs = []
    for row in rows:
        job = {
            "id": row["id"],
            "command": row["command"],
            "schedule": row["schedule"],
            "enabled": bool(row["enabled"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }

        # Parse schedule for friendly display
        parts = job["schedule"].split()
        if len(parts) == 5:
            minute, hour, dom, month, dow = parts
            job["friendly_time"] = f"{hour.zfill(2)}:{minute.zfill(2)}"

            if dom == "*" and month == "*" and dow == "*":
                job["friendly_freq"] = "daily"
            elif dom == "*" and month == "*" and dow != "*":
                job["friendly_freq"] = "weekly"
            elif dom != "*" and month == "*":
                job["friendly_freq"] = "monthly"
            else:
                job["friendly_freq"] = "custom"
        else:
            job["friendly_time"] = "00:00"
            job["friendly_freq"] = "custom"

        # Parse txtempus command
        cmd = job["command"]
        details = {
            "is_txtempus": "txtempus" in cmd,
            "service": "DCF77",
            "duration": "10",
            "offset": "0"
        }

        if details["is_txtempus"]:
            if m := re.search(r'-s\s+(\w+)', cmd):
                details["service"] = m.group(1)
            if m := re.search(r'-r\s+(\d+)', cmd):
                details["duration"] = m.group(1)
            if m := re.search(r'-z\s+([+-]?\d+)', cmd):
                # Store in minutes (matches txtempus -z flag and API)
                details["offset"] = m.group(1)

        job["radio_details"] = details
        jobs.append(job)

    return jobs


def add_or_update_cron_job(job_id: str, command: str, schedule: str, enabled: bool = True) -> None:
    """Add or update a cron job."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO cron_jobs (id, command, schedule, enabled, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                command = excluded.command,
                schedule = excluded.schedule,
                enabled = excluded.enabled,
                updated_at = CURRENT_TIMESTAMP
            """,
            (job_id, command, schedule, enabled)
        )


def delete_cron_job(job_id: str) -> bool:
    """Delete a cron job. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM cron_jobs WHERE id = ?", (job_id,))
        return cursor.rowcount > 0


# --- Initialization ---

def ensure_initialized() -> None:
    """Ensure database is initialized."""
    if not DB_FILE.exists():
        print("First run - creating normalized database...")
        init_database()


# Auto-initialize on import
ensure_initialized()


if __name__ == '__main__':
    # Demo/test code
    print("AirTime SQLite Database (Normalized)")
    print("=" * 70)
    
    # Show schema
    with get_connection() as conn:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        print("\nTables:")
        for table in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM {table['name']}").fetchone()[0]
            print(f"  - {table['name']}: {count} rows")
    
    # Show settings by category
    print("\nSettings by Category:")
    with get_connection() as conn:
        categories = conn.execute(
            "SELECT DISTINCT category FROM settings ORDER BY category"
        ).fetchall()
        for cat in categories:
            settings = get_category(cat['category'])
            print(f"\n  [{cat['category']}]")
            for key, value in settings.items():
                print(f"    {key} = {value}")
    
    # Show cron jobs
    print("\nCron Jobs:")
    jobs = get_cron_jobs()
    for job in jobs:
        status = "✓" if job['enabled'] else "✗"
        print(f"  {status} {job['id']}: {job['schedule']} → {job['command']}")
    
    # Show status
    print("\nCurrent Status:")
    status = _load_status_as_dict()
    print(json.dumps(status, indent=2))
