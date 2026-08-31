# Scheduled broadcasts are owned by the daemon, not the system crontab

Schedules were stored in SQLite and also written into root's crontab, with a reconciliation loop diffing the two on every change; the desync between them is the direct cause of the stale-offset workarounds in the old request handlers. The daemon now owns scheduling in-process, and SQLite is the only source of truth. SQLite already held every schedule, so an upgrade needs no import: the installer simply strips the crontab mirror.

## Consequences

- A scheduled broadcast now requires the daemon to be running, where cron would previously have fired it regardless. `Restart=always` covers the crash case, and a dead daemon already means a dead dashboard.
- AirTime no longer writes to root's crontab at all, so uninstalling leaves nothing behind.
