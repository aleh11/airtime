import subprocess
from dataclasses import dataclass


@dataclass
class NTPResult:
    score: float
    last_rx_seconds: float
    server: str
    synced: bool


NTP_SCORE_MAP = [
    (0, 20, 0.1),
    (20, 40, 0.5),
    (40, 60, 1.0),
    (60, 100, 3.0),
    (100, 512, 5.0),
    (512, 1024, 10.0),
]

NOT_SYNCED = NTPResult(score=0.0, last_rx_seconds=9999.0, server="unknown", synced=False)


def _calculate_score(last_rx_seconds: float) -> float:
    if last_rx_seconds > 1024:
        return 0.0

    for min_rx, max_rx, score in NTP_SCORE_MAP:
        if min_rx <= last_rx_seconds <= max_rx:
            return score

    return 0.0


def get_ntp_status() -> NTPResult:
    try:
        output = subprocess.check_output(
            ["chronyc", "-n", "sources"],
            text=True,
            stderr=subprocess.DEVNULL
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return NOT_SYNCED

    lines = output.strip().splitlines()
    if len(lines) < 3:
        return NOT_SYNCED

    best_server = None
    best_last_rx = None

    for line in lines[2:]:
        parts = line.split()
        if len(parts) < 6:
            continue

        try:
            last_rx = int(parts[5])
        except ValueError:
            continue

        if best_last_rx is None or last_rx < best_last_rx:
            best_last_rx = last_rx
            best_server = parts[1]

    if best_last_rx is None or best_server is None:
        return NOT_SYNCED

    score = _calculate_score(float(best_last_rx))

    return NTPResult(
        score=score,
        last_rx_seconds=float(best_last_rx),
        server=best_server,
        synced=score > 0.0
    )


if __name__ == "__main__":
    result = get_ntp_status()
    print(f"Synced: {result.synced}")
    print(f"Server: {result.server}")
    print(f"Last RX: {result.last_rx_seconds}s ago")
    print(f"Score: {result.score}")
