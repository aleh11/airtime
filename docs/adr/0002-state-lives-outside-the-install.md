# Runtime state lives in /var/lib/airtime, never inside the install directory

The SQLite database used to live at `airtime-server/database/airtime.db`, inside the git clone, so any reinstall or re-clone destroyed the user's schedules and settings. State now lives in `/var/lib/airtime`, provisioned by systemd's `StateDirectory=`, and an existing database is migrated there automatically on first start. This is a precondition for replaceable release artifacts: the binary must be disposable, and nothing disposable may hold user data.

## Consequences

- Migration copies via SQLite's backup API rather than copying files, because the old database runs in WAL mode and recent writes can live only in the `-wal` sidecar.
- The legacy file is renamed to `.db.migrated` rather than deleted, so a failed upgrade is recoverable by hand.
- `AIRTIME_STATE_DIR` overrides the location, which is what makes the daemon runnable on a development machine.
