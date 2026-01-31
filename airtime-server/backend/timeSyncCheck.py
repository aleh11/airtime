"""
NTP synchronization health check via chronyc.
Returns health score (blink interval) and NTP metrics.
"""
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class NTPResult:
    """Result of an NTP health check."""
    score: float  # Blink interval in seconds (0 = not synced, 0.1 = excellent, 10 = poor)
    last_rx_seconds: float  # Seconds since last successful NTP poll
    server: str  # IP address of the most recently polled NTP server
    synced: bool  # Whether NTP is actively synchronized


# Health score mapping (lower is better)
NTP_SCORE_MAP = [
    (0, 20, 0.1),  # Excellent: 0-20s
    (20, 40, 0.5),  # Good: 20-40s
    (40, 60, 1.0),  # Fair: 40-60s
    (60, 100, 3.0),  # Poor: 60-100s
    (100, 512, 5.0),  # Bad: 100-512s
    (512, 1024, 10.0),  # Terrible: 512-1024s
]


def _calculate_score(last_rx_seconds: float) -> float:
    """Convert last poll time to health score (blink interval)."""
    if last_rx_seconds > 1024:
        return 0.0  # Not synced

    for min_rx, max_rx, score in NTP_SCORE_MAP:
        if min_rx <= last_rx_seconds <= max_rx:
            return score

    return 0.0  # Default to not synced


def get_ntp_status() -> NTPResult:
    """
    Check NTP synchronization status using chronyc.

    Returns:
        NTPResult with score, last poll time, server, and sync status
    """
    try:
        output = subprocess.check_output(
            ["chronyc", "-n", "sources"],
            text=True,
            stderr=subprocess.DEVNULL
        )
    except FileNotFoundError:
        # chronyc not available
        return NTPResult(score=0.0, last_rx_seconds=9999.0, server="unknown", synced=False)
    except subprocess.CalledProcessError:
        # chronyc failed
        return NTPResult(score=0.0, last_rx_seconds=9999.0, server="unknown", synced=False)

    lines = output.strip().splitlines()

    # Skip header lines (first 2 lines are headers)
    # Example output:
    # MS Name/IP address         Stratum Poll Reach LastRx Last sample
    # ===============================================================================
    # ^* 216.239.35.0                  1   6   377    15  +2345us[+2567us] +/-   10ms

    if len(lines) < 3:
        # No data available
        return NTPResult(score=0.0, last_rx_seconds=9999.0, server="unknown", synced=False)

    data_lines = lines[2:]

    best_server = None
    best_last_rx = None

    for line in data_lines:
        parts = line.split()
        if len(parts) < 6:
            continue

        # Column 2 is server (parts[1])
        # Column 6 is LastRx (parts[5])
        server = parts[1]
        try:
            last_rx = int(parts[5])
        except ValueError:
            continue

        # Keep the server with the smallest LastRx (most recently polled)
        if best_last_rx is None or last_rx < best_last_rx:
            best_last_rx = last_rx
            best_server = server

    if best_last_rx is None or best_server is None:
        # No valid NTP data found
        return NTPResult(score=0.0, last_rx_seconds=9999.0, server="unknown", synced=False)

    score = _calculate_score(float(best_last_rx))
    synced = score > 0.0

    return NTPResult(
        score=score,
        last_rx_seconds=float(best_last_rx),
        server=best_server,
        synced=synced
    )


if __name__ == "__main__":
    result = get_ntp_status()
    print(f"Synced: {result.synced}")
    print(f"Server: {result.server}")
    print(f"Last RX: {result.last_rx_seconds}s ago")
    print(f"Score: {result.score}")