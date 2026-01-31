"""
Hardware monitoring service for AirTime radio time synchronization system.
Controls GPIO LEDs and buttons, monitors system health.
"""
from gpiozero import LED, Button
import subprocess
import time
import signal
from typing import Optional
from dataclasses import dataclass

import db
import pingCheck
import timeSyncCheck

# --- GPIO Pin Configuration ---
PIN_LED_HEARTBEAT = 9  # Internet connectivity indicator
PIN_LED_NTP = 11  # NTP sync status indicator
PIN_LED_ANTENNA = 5  # Radio broadcast indicator
PIN_BUTTON = 19  # Control button (short press = toggle broadcast, long hold = stealth)

# --- Timing Constants ---
HEALTH_CHECK_INTERVAL = 2.0  # seconds between health checks
LED_BLINK_DURATION = 0.1  # seconds LED stays on during blink
BUTTON_DEBOUNCE = 0.5  # seconds to ignore repeated button presses
BUTTON_HOLD_TIME = 3.0  # seconds to trigger long hold action

# --- Process Configuration ---
TXTEMPUS_BINARY = "/usr/bin/txtempus"
TXTEMPUS_PROCESS_NAME = "txtempus"

# --- LED Setup ---
led_heartbeat = LED(PIN_LED_HEARTBEAT)
led_ntp = LED(PIN_LED_NTP)
led_antenna = LED(PIN_LED_ANTENNA)

# --- Button Setup ---
button_launch_antenna = Button(
    PIN_BUTTON,
    bounce_time=0.2,
    hold_time=BUTTON_HOLD_TIME
)

# --- State Tracking ---
last_pressed = 0.0  # For software debouncing
shutdown_requested = False  # For graceful shutdown


# --- Signal Handlers ---

def cleanup_gpio() -> None:
    """
    Cleanup GPIO resources on shutdown.
    """
    try:
        led_heartbeat.close()
        led_ntp.close()
        led_antenna.close()
        button_launch_antenna.close()
        print("GPIO resources released")
    except Exception as e:
        print(f"Error during GPIO cleanup: {e}")


def signal_handler(signum, frame) -> None:
    """
    Handle shutdown signals (SIGTERM, SIGINT).
    """
    global shutdown_requested
    print(f"\nReceived signal {signum}, shutting down gracefully...")
    shutdown_requested = True


@dataclass
class LEDState:
    """Track LED blink state for smooth blinking."""
    is_on: bool = False
    last_toggle: float = 0.0
    blink_interval: float = 0.0


# LED state trackers
heartbeat_state = LEDState()
ntp_state = LEDState()


# --- Configuration Helpers ---

def get_stealth_mode() -> bool:
    """
    Check if stealth mode is enabled (LEDs off).

    Returns:
        True if LEDs should be disabled, False otherwise
    """
    try:
        return bool(db.get_setting("app_config", "stealth_mode", False))
    except Exception as e:
        print(f"Error reading stealth mode: {e}")
        return False


def set_stealth_mode(state: bool) -> None:
    """
    Update stealth mode setting in the database.

    Args:
        state: True to disable LEDs, False to enable them
    """
    try:
        db.set_setting("app_config", "stealth_mode", "true" if state else "false")
        print(f"Stealth mode {'enabled' if state else 'disabled'} via button")
    except Exception as e:
        print(f"Error saving stealth mode: {e}")


def get_radio_defaults() -> tuple[str, str, str, bool]:
    """
    Get default radio configuration from settings.

    Returns:
        Tuple of (service, duration_minutes, offset_minutes, offset_enabled)
    """
    try:
        service = db.get_setting("radio_config", "default_service", "DCF77")
        duration = db.get_setting("radio_config", "default_duration_minutes", "10")
        offset = db.get_setting("radio_config", "default_offset", "0")
        offset_enabled_raw = db.get_setting("radio_config", "default_offset_enabled", "false")

        # Convert to boolean
        if isinstance(offset_enabled_raw, bool):
            offset_enabled = offset_enabled_raw
        else:
            offset_enabled = str(offset_enabled_raw).lower() == "true"

        return service, duration, offset, offset_enabled
    except Exception as e:
        print(f"Error reading radio defaults: {e}")
        return "DCF77", "10", "0", False


def update_db_status(section: str, key: str, value) -> None:
    """
    Safely update status.json with error handling.

    Args:
        section: Section name in status.json
        key: Key within the section
        value: Value to set
    """
    try:
        db.update_status(section, key, value)
    except Exception as e:
        print(f"Error updating DB [{section}.{key}]: {e}")


# --- Health Check Functions ---

def check_internet() -> None:
    """
    Check internet connectivity and update heartbeat LED state.
    Updates database with current connectivity status.
    """
    try:
        result = pingCheck.get_ping()

        # Update database
        update_db_status("internet_status", "connected", result.connected)
        update_db_status("internet_status", "score", result.score)
        update_db_status("internet_status", "ping_ms", result.latency_ms)

        # Update LED state for blinking
        if result.connected:
            heartbeat_state.blink_interval = result.score
        else:
            heartbeat_state.blink_interval = 0.0  # Off when disconnected

    except Exception as e:
        print(f"Internet check error: {e}")
        update_db_status("internet_status", "connected", False)
        heartbeat_state.blink_interval = 0.0


def check_ntp() -> None:
    """
    Check NTP synchronization and update NTP LED state.
    Updates database with current sync status.
    """
    try:
        result = timeSyncCheck.get_ntp_status()

        # Update database
        update_db_status("ntp_status", "synced", result.synced)
        update_db_status("ntp_status", "score", result.score)
        update_db_status("ntp_status", "last_rx_seconds", result.last_rx_seconds)
        update_db_status("ntp_status", "server", result.server)

        # Update LED state for blinking
        if result.synced:
            ntp_state.blink_interval = result.score
        else:
            ntp_state.blink_interval = 0.0  # Off when not synced

    except Exception as e:
        print(f"NTP check error: {e}")
        update_db_status("ntp_status", "synced", False)
        ntp_state.blink_interval = 0.0


def check_txtempus_process() -> bool:
    """
    Check if txtempus is running and update status with details.
    
    Returns:
        True if txtempus is running, False otherwise
    """
    import re
    from datetime import datetime
    
    status_data = {
        "running": False,
        "service": None,
        "duration": None,
        "started_at": None,
        "pid": None
    }

    try:
        # Get detailed process info: pid, start time, command args
        # output format: PID | STARTED | COMMAND
        cmd = ['ps', '-C', TXTEMPUS_PROCESS_NAME, '-o', 'pid,lstart,args']
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:  # Header + at least one process
                # Parse the last line (most recent process if multiple)
                # PSD format for lstart is like "Mon Jan 26 17:00:00 2026"
                latest_line = lines[-1].strip()
                
                # Regex to parse ps output
                # Matches: PID (digits) space DATE (many chars) space COMMAND (rest)
                # Note: args usually starts with /path/to/txtempus or just txtempus
                
                # Simple parsing strategy:
                # PID is first column
                # lstart is fixed format: Day Mon DD HH:MM:SS YYYY (5 tokens)
                # content: PID Day Mon DD HH:MM:SS YYYY COMMAND...
                
                parts = latest_line.split()
                if len(parts) >= 7: # PID + 5 for date + at least 1 for command
                    pid = parts[0]
                    # Reconstruct date string from the 5 tokens
                    date_parts = parts[1:6]
                    date_str = " ".join(date_parts)
                    
                    # Everything matching index 6 onwards is the command
                    args_str = " ".join(parts[6:])
                    
                    status_data["running"] = True
                    status_data["pid"] = pid
                    status_data["started_at"] = date_str
                    
                    # Parse args for service and duration
                    # -s SERVICE -r DURATION
                    m_svc = re.search(r'-s\s+(\w+)', args_str)
                    if m_svc: status_data["service"] = m_svc.group(1)
                    
                    m_dur = re.search(r'-r\s+(\d+)', args_str)
                    if m_dur: status_data["duration"] = int(m_dur.group(1))

    except Exception as e:
        print(f"Process check error: {e}")

    # Update database with full dictionary
    # We store the whole dict as the value for "txtempus_running" check or a new key
    # To keep backward compatibility with "txtempus_running" boolean check in some places, 
    # we might want to store specific fields or update how we store it.
    # The current DB schema stores individual keys in sections.
    
    update_db_status("services", "txtempus_details", status_data)
    update_db_status("services", "txtempus_running", status_data["running"])

    return status_data["running"]


def update_leds(is_stealth: bool, txtempus_running: bool) -> None:
    """
    Update all LED states based on current conditions.
    Handles blinking for heartbeat and NTP, solid for antenna.

    Args:
        is_stealth: Whether stealth mode is active (all LEDs off)
        txtempus_running: Whether txtempus is currently running
    """
    now = time.time()

    if is_stealth:
        # Stealth mode - all LEDs off
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()
        return

    # --- Heartbeat LED (blinking) ---
    if heartbeat_state.blink_interval > 0:
        # Should be blinking
        if heartbeat_state.is_on:
            # LED is on, check if it's time to turn off
            if now - heartbeat_state.last_toggle >= LED_BLINK_DURATION:
                led_heartbeat.off()
                heartbeat_state.is_on = False
                heartbeat_state.last_toggle = now
        else:
            # LED is off, check if it's time to turn on
            if now - heartbeat_state.last_toggle >= heartbeat_state.blink_interval:
                led_heartbeat.on()
                heartbeat_state.is_on = True
                heartbeat_state.last_toggle = now
    else:
        # Should be off (disconnected)
        led_heartbeat.off()
        heartbeat_state.is_on = False

    # --- NTP LED (blinking) ---
    if ntp_state.blink_interval > 0:
        # Should be blinking
        if ntp_state.is_on:
            # LED is on, check if it's time to turn off
            if now - ntp_state.last_toggle >= LED_BLINK_DURATION:
                led_ntp.off()
                ntp_state.is_on = False
                ntp_state.last_toggle = now
        else:
            # LED is off, check if it's time to turn on
            if now - ntp_state.last_toggle >= ntp_state.blink_interval:
                led_ntp.on()
                ntp_state.is_on = True
                ntp_state.last_toggle = now
    else:
        # Should be off (not synced)
        led_ntp.off()
        ntp_state.is_on = False

    # --- Antenna LED (solid) ---
    if txtempus_running:
        led_antenna.on()
    else:
        led_antenna.off()


# --- Main Monitoring Loop ---

def monitoring_loop() -> None:
    """
    Main monitoring loop - unified handler for all health checks and LED control.
    Runs continuously, checking health and updating LEDs.
    """
    last_health_check = 0.0

    print("Starting unified monitoring loop...")

    while not shutdown_requested:
        try:
            now = time.time()

            # Perform health checks at regular intervals
            if now - last_health_check >= HEALTH_CHECK_INTERVAL:
                check_internet()
                check_ntp()
                last_health_check = now

            # Check txtempus process (can be done more frequently if needed)
            txtempus_running = check_txtempus_process()

            # Check stealth mode
            is_stealth = get_stealth_mode()

            # Update all LEDs based on current state
            update_leds(is_stealth, txtempus_running)

            # Short sleep to keep loop responsive but not CPU-intensive
            time.sleep(0.05)  # 50ms - keeps LEDs smooth, responsive to stealth toggle

        except Exception as e:
            print(f"Monitoring loop error: {e}")
            time.sleep(1.0)  # Back off on error

    print("Monitoring loop exiting...")


# --- Button Handlers ---

def on_short_press() -> None:
    """
    Handle short button press - toggle radio broadcast.
    Uses software debouncing to prevent multiple triggers.
    """
    global last_pressed
    now = time.time()

    # Debounce
    if now - last_pressed < BUTTON_DEBOUNCE:
        return
    last_pressed = now

    toggle_txtempus()


def on_long_hold() -> None:
    """
    Handle long button hold (3+ seconds) - toggle stealth mode.
    """
    current_mode = get_stealth_mode()
    new_mode = not current_mode

    set_stealth_mode(new_mode)

    # Immediate feedback - turn off all LEDs if entering stealth
    if new_mode:
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()


# --- Radio Control ---

def toggle_txtempus() -> None:
    """
    Toggle txtempus broadcast process (start if stopped, stop if running).
    Uses default service and duration from settings.
    """
    try:
        # Check if already running
        result = subprocess.run(
            ['pgrep', '-x', TXTEMPUS_PROCESS_NAME],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            # Process is running - kill it
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                if pid:  # Skip empty strings
                    subprocess.run(['sudo', 'kill', pid])
            print(f"txtempus stopped via button press")
            update_db_status("services", "txtempus_running", False)
        else:
            # Process not running - start it
            service, duration, offset, offset_enabled = get_radio_defaults()

            # Ensure all values are strings for subprocess
            service = str(service)
            duration = str(duration)
            offset = str(offset)

            cmd = [
                'sudo',
                TXTEMPUS_BINARY,
                '-s', service,
                '-r', duration
            ]

            # Add offset if non-zero AND enabled
            if int(offset) != 0 and offset_enabled:
                cmd.extend(['-z', offset])

            subprocess.Popen(cmd)
            print(f"txtempus launched: {service} for {duration}m with offset={offset if offset_enabled else 'disabled'}")
            update_db_status("services", "txtempus_running", True)

    except Exception as e:
        print(f"Error toggling txtempus: {e}")


# --- Startup Animation ---

def startup_animation() -> None:
    """
    Play a quick LED sequence on system startup.
    Helps verify all LEDs are functional.
    """
    for _ in range(3):
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()
        time.sleep(0.1)

        led_heartbeat.on()
        time.sleep(0.1)

        led_ntp.on()
        time.sleep(0.1)

        led_antenna.on()
        time.sleep(0.2)

    # Turn off all LEDs after animation
    led_heartbeat.off()
    led_ntp.off()
    led_antenna.off()


# --- Main Entry Point ---

def main() -> None:
    """
    Main entry point for the hardware monitoring service.
    Starts monitoring loop and waits for signals.
    """
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Bind button handlers
    button_launch_antenna.when_pressed = on_short_press
    button_launch_antenna.when_held = on_long_hold

    try:
        # Startup sequence
        startup_animation()

        print("AirTime Hardware Monitor running...")
        print(f"  Heartbeat LED: GPIO {PIN_LED_HEARTBEAT}")
        print(f"  NTP LED: GPIO {PIN_LED_NTP}")
        print(f"  Antenna LED: GPIO {PIN_LED_ANTENNA}")
        print(f"  Control Button: GPIO {PIN_BUTTON}")
        print(f"  Health check interval: {HEALTH_CHECK_INTERVAL}s")

        # Run unified monitoring loop (blocks here)
        monitoring_loop()

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        # Cleanup - turn off all LEDs and release GPIO
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()
        cleanup_gpio()
        print("Hardware monitor stopped.")


if __name__ == '__main__':
    main()