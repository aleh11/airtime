"""
Network connectivity health check via ICMP ping.
Returns health score (blink interval) and latency metrics.
"""
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class PingResult:
    """Result of a ping health check."""
    score: float  # Blink interval in seconds (0 = offline, 0.1 = excellent, 10 = poor)
    latency_ms: float  # Round-trip time in milliseconds
    connected: bool  # Whether the ping succeeded


# Health score mapping (lower is better)
PING_SCORE_MAP = [
    (0, 40, 0.1),  # Excellent: 0-40ms
    (40, 80, 0.5),  # Good: 40-80ms
    (80, 120, 1.0),  # Fair: 80-120ms
    (120, 280, 3.0),  # Poor: 120-280ms
    (280, 750, 5.0),  # Bad: 280-750ms
    (750, 5000, 10.0),  # Terrible: 750-5000ms
]

PING_TARGET = "1.1.1.1"
PING_TIMEOUT = 6  # seconds
PING_COUNT = 1


def _calculate_score(latency_ms: float) -> float:
    """Convert latency to health score (blink interval)."""
    if latency_ms > 5000 or latency_ms == 0:
        return 0.0  # Offline

    for min_lat, max_lat, score in PING_SCORE_MAP:
        if min_lat <= latency_ms <= max_lat:
            return score

    return 0.0  # Default to offline for out-of-range values


def get_ping() -> PingResult:
    """
    Perform a single ping to check internet connectivity.

    Returns:
        PingResult with score, latency, and connection status
    """
    try:
        output = subprocess.check_output(
            ["ping", "-c", str(PING_COUNT), "-W", str(PING_TIMEOUT), PING_TARGET],
            text=True,
            stderr=subprocess.DEVNULL
        )
    except FileNotFoundError:
        # ping command not available
        return PingResult(score=0.0, latency_ms=0.0, connected=False)
    except subprocess.CalledProcessError:
        # Ping failed (timeout, unreachable, etc.)
        return PingResult(score=0.0, latency_ms=0.0, connected=False)

    # Parse the RTT from output
    # Looking for line like: "rtt min/avg/max/mdev = 5.123/5.234/5.345/0.123 ms"
    latency_ms = 0.0
    for line in output.strip().splitlines():
        if 'rtt' in line.lower():
            try:
                # Split on '/' and get the average (index 5 in full split)
                parts = line.split('/')
                if len(parts) >= 6:
                    latency_ms = float(parts[5].split()[0])
                    break
            except (ValueError, IndexError):
                continue

    if latency_ms == 0.0:
        # Couldn't parse latency, treat as failed
        return PingResult(score=0.0, latency_ms=0.0, connected=False)

    score = _calculate_score(latency_ms)
    connected = score > 0.0

    return PingResult(score=score, latency_ms=latency_ms, connected=connected)


if __name__ == "__main__":
    result = get_ping()
    print(f"Connected: {result.connected}")
    print(f"Latency: {result.latency_ms:.2f}ms")
    print(f"Score: {result.score}")