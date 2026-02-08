import subprocess
from dataclasses import dataclass


@dataclass
class PingResult:
    score: float
    latency_ms: float
    connected: bool


PING_SCORE_MAP = [
    (0, 40, 0.1),
    (40, 80, 0.5),
    (80, 120, 1.0),
    (120, 280, 3.0),
    (280, 750, 5.0),
    (750, 5000, 10.0),
]

PING_TARGET = "1.1.1.1"
PING_TIMEOUT = 6
PING_COUNT = 1

OFFLINE = PingResult(score=0.0, latency_ms=0.0, connected=False)


def _calculate_score(latency_ms: float) -> float:
    if latency_ms > 5000 or latency_ms == 0:
        return 0.0

    for min_lat, max_lat, score in PING_SCORE_MAP:
        if min_lat <= latency_ms <= max_lat:
            return score

    return 0.0


def get_ping() -> PingResult:
    try:
        output = subprocess.check_output(
            ["ping", "-c", str(PING_COUNT), "-W", str(PING_TIMEOUT), PING_TARGET],
            text=True,
            stderr=subprocess.DEVNULL
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return OFFLINE

    latency_ms = 0.0
    for line in output.strip().splitlines():
        if 'rtt' in line.lower():
            try:
                parts = line.split('/')
                if len(parts) >= 6:
                    latency_ms = float(parts[5].split()[0])
                    break
            except (ValueError, IndexError):
                continue

    if latency_ms == 0.0:
        return OFFLINE

    score = _calculate_score(latency_ms)
    return PingResult(score=score, latency_ms=latency_ms, connected=score > 0.0)


if __name__ == "__main__":
    result = get_ping()
    print(f"Connected: {result.connected}")
    print(f"Latency: {result.latency_ms:.2f}ms")
    print(f"Score: {result.score}")
