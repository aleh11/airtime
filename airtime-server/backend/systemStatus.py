from gpiozero import LED, Button
import subprocess
import time
import signal
import re
from dataclasses import dataclass

import db
import pingCheck
import timeSyncCheck

PIN_LED_HEARTBEAT = 9
PIN_LED_NTP = 11
PIN_LED_ANTENNA = 5
PIN_BUTTON = 19

HEALTH_CHECK_INTERVAL = 2.0
LED_BLINK_DURATION = 0.1
BUTTON_DEBOUNCE = 0.5
BUTTON_HOLD_TIME = 3.0

TXTEMPUS_BINARY = "/usr/bin/txtempus"
TXTEMPUS_PROCESS_NAME = "txtempus"

led_heartbeat = LED(PIN_LED_HEARTBEAT)
led_ntp = LED(PIN_LED_NTP)
led_antenna = LED(PIN_LED_ANTENNA)

button_launch_antenna = Button(
    PIN_BUTTON,
    bounce_time=0.2,
    hold_time=BUTTON_HOLD_TIME
)

last_pressed = 0.0
shutdown_requested = False


def cleanup_gpio() -> None:
    try:
        led_heartbeat.close()
        led_ntp.close()
        led_antenna.close()
        button_launch_antenna.close()
        print("GPIO resources released")
    except Exception as e:
        print(f"Error during GPIO cleanup: {e}")


def signal_handler(signum, frame) -> None:
    global shutdown_requested
    print(f"\nReceived signal {signum}, shutting down gracefully...")
    shutdown_requested = True


@dataclass
class LEDState:
    is_on: bool = False
    last_toggle: float = 0.0
    blink_interval: float = 0.0


heartbeat_state = LEDState()
ntp_state = LEDState()


def get_stealth_mode() -> bool:
    try:
        return bool(db.get_setting("app_config", "stealth_mode", False))
    except Exception as e:
        print(f"Error reading stealth mode: {e}")
        return False


def set_stealth_mode(state: bool) -> None:
    try:
        db.set_setting("app_config", "stealth_mode", "true" if state else "false")
        print(f"Stealth mode {'enabled' if state else 'disabled'} via button")
    except Exception as e:
        print(f"Error saving stealth mode: {e}")


def get_radio_defaults() -> tuple[str, str, str, bool]:
    try:
        service = db.get_setting("radio_config", "default_service", "DCF77")
        duration = db.get_setting("radio_config", "default_duration_minutes", "10")
        offset = db.get_setting("radio_config", "default_offset", "0")
        offset_enabled_raw = db.get_setting("radio_config", "default_offset_enabled", "false")

        if isinstance(offset_enabled_raw, bool):
            offset_enabled = offset_enabled_raw
        else:
            offset_enabled = str(offset_enabled_raw).lower() == "true"

        return service, duration, offset, offset_enabled
    except Exception as e:
        print(f"Error reading radio defaults: {e}")
        return "DCF77", "10", "0", False


def update_db_status(section: str, key: str, value) -> None:
    try:
        db.update_status(section, key, value)
    except Exception as e:
        print(f"Error updating DB [{section}.{key}]: {e}")


def check_internet() -> None:
    try:
        result = pingCheck.get_ping()

        update_db_status("internet_status", "connected", result.connected)
        update_db_status("internet_status", "score", result.score)
        update_db_status("internet_status", "ping_ms", result.latency_ms)

        if result.connected:
            heartbeat_state.blink_interval = result.score
        else:
            heartbeat_state.blink_interval = 0.0

    except Exception as e:
        print(f"Internet check error: {e}")
        update_db_status("internet_status", "connected", False)
        heartbeat_state.blink_interval = 0.0


def check_ntp() -> None:
    try:
        result = timeSyncCheck.get_ntp_status()

        update_db_status("ntp_status", "synced", result.synced)
        update_db_status("ntp_status", "score", result.score)
        update_db_status("ntp_status", "last_rx_seconds", result.last_rx_seconds)
        update_db_status("ntp_status", "server", result.server)

        if result.synced:
            ntp_state.blink_interval = result.score
        else:
            ntp_state.blink_interval = 0.0

    except Exception as e:
        print(f"NTP check error: {e}")
        update_db_status("ntp_status", "synced", False)
        ntp_state.blink_interval = 0.0


def check_txtempus_process() -> bool:
    status_data = {
        "running": False,
        "service": None,
        "duration": None,
        "started_at": None,
        "offset": None,
        "pid": None
    }

    try:
        result = subprocess.run(
            ['ps', '-C', TXTEMPUS_PROCESS_NAME, '-o', 'pid,lstart,args'],
            capture_output=True, text=True
        )

        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                parts = lines[-1].strip().split()
                if len(parts) >= 7:
                    status_data["running"] = True
                    status_data["pid"] = parts[0]
                    status_data["started_at"] = " ".join(parts[1:6])

                    args_str = " ".join(parts[6:])
                    m_svc = re.search(r'-s\s+(\w+)', args_str)
                    if m_svc: status_data["service"] = m_svc.group(1)

                    m_dur = re.search(r'-r\s+(\d+)', args_str)
                    if m_dur: status_data["duration"] = int(m_dur.group(1))

                    m_off = re.search(r'-z\s+([+-]?\d+)', args_str)
                    if m_off: status_data["offset"] = int(m_off.group(1))

    except Exception as e:
        print(f"Process check error: {e}")

    update_db_status("services", "txtempus_details", status_data)
    update_db_status("services", "txtempus_running", status_data["running"])

    return status_data["running"]


def _update_blink_led(led, state: LEDState, now: float) -> None:
    if state.blink_interval > 0:
        if state.is_on:
            if now - state.last_toggle >= LED_BLINK_DURATION:
                led.off()
                state.is_on = False
                state.last_toggle = now
        else:
            if now - state.last_toggle >= state.blink_interval:
                led.on()
                state.is_on = True
                state.last_toggle = now
    else:
        led.off()
        state.is_on = False


def update_leds(is_stealth: bool, txtempus_running: bool) -> None:
    now = time.time()

    if is_stealth:
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()
        return

    _update_blink_led(led_heartbeat, heartbeat_state, now)
    _update_blink_led(led_ntp, ntp_state, now)

    if txtempus_running:
        led_antenna.on()
    else:
        led_antenna.off()


def monitoring_loop() -> None:
    last_health_check = 0.0
    print("Starting unified monitoring loop...")

    while not shutdown_requested:
        try:
            now = time.time()

            if now - last_health_check >= HEALTH_CHECK_INTERVAL:
                check_internet()
                check_ntp()
                last_health_check = now

            txtempus_running = check_txtempus_process()
            is_stealth = get_stealth_mode()
            update_leds(is_stealth, txtempus_running)

            time.sleep(0.05)

        except Exception as e:
            print(f"Monitoring loop error: {e}")
            time.sleep(1.0)

    print("Monitoring loop exiting...")


def on_short_press() -> None:
    global last_pressed
    now = time.time()

    if now - last_pressed < BUTTON_DEBOUNCE:
        return
    last_pressed = now

    toggle_txtempus()


def on_long_hold() -> None:
    new_mode = not get_stealth_mode()
    set_stealth_mode(new_mode)

    if new_mode:
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()


def toggle_txtempus() -> None:
    try:
        result = subprocess.run(
            ['pgrep', '-x', TXTEMPUS_PROCESS_NAME],
            capture_output=True, text=True
        )

        if result.returncode == 0:
            for pid in result.stdout.strip().split('\n'):
                if pid:
                    subprocess.run(['sudo', 'kill', pid])
            print("txtempus stopped via button press")
            update_db_status("services", "txtempus_running", False)
        else:
            service, duration, offset, offset_enabled = get_radio_defaults()
            service = str(service)
            duration = str(duration)
            offset = str(offset)

            cmd = ['sudo', TXTEMPUS_BINARY, '-s', service, '-r', duration]

            if int(offset) != 0 and offset_enabled:
                cmd.extend(['-z', offset])

            subprocess.Popen(cmd)
            print(f"txtempus launched: {service} for {duration}m with offset={offset if offset_enabled else 'disabled'}")
            update_db_status("services", "txtempus_running", True)

    except Exception as e:
        print(f"Error toggling txtempus: {e}")


def startup_animation() -> None:
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

    led_heartbeat.off()
    led_ntp.off()
    led_antenna.off()


def main() -> None:
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    button_launch_antenna.when_pressed = on_short_press
    button_launch_antenna.when_held = on_long_hold

    try:
        startup_animation()

        print("AirTime Hardware Monitor running...")
        print(f"  Heartbeat LED: GPIO {PIN_LED_HEARTBEAT}")
        print(f"  NTP LED: GPIO {PIN_LED_NTP}")
        print(f"  Antenna LED: GPIO {PIN_LED_ANTENNA}")
        print(f"  Control Button: GPIO {PIN_BUTTON}")
        print(f"  Health check interval: {HEALTH_CHECK_INTERVAL}s")

        monitoring_loop()

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        led_heartbeat.off()
        led_ntp.off()
        led_antenna.off()
        cleanup_gpio()
        print("Hardware monitor stopped.")


if __name__ == '__main__':
    main()
