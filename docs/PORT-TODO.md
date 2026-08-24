# Go port + release pipeline — working plan

Decisions behind this plan: [ADR 0001](adr/0001-github-releases-single-binary.md),
[0002](adr/0002-state-lives-outside-the-install.md), [0003](adr/0003-go-backend.md),
[0004](adr/0004-in-process-scheduler.md).

Anything marked **[PI]** cannot be signed off without hardware.

## Phase 0 — state relocation (done, still on Python)

- [x] Resolve state dir to `/var/lib/airtime`, override via `AIRTIME_STATE_DIR`
- [x] Migrate a legacy in-repo database via the SQLite backup API
- [x] Installer provisions the state dir; units declare `StateDirectory=`
- [x] **[PI]** Confirm an existing install migrates and keeps its schedules — verified: 5 schedules, 8 settings, offset preserved

## Phase 1 — Go daemon core

- [x] `go.mod`, cgo off, `modernc.org/sqlite`
- [x] Store: settings, status, schedules — same schema, same migration behaviour
- [x] Config: state dir, listen addr, TLS paths, txtempus path
- [x] Self-signed cert generation on first start
- [x] `//go:embed` the frontend, serve it with SPA fallback
- [x] Port all 17 endpoints (`/api/status`, crons, settings, control, metrics)
- [x] Metrics from `/proc` and `/sys/class/thermal` (replaces psutil)
- [x] Transmitter: spawn and stop txtempus, track running state

## Phase 2 — scheduler

- [x] In-process scheduler driven from SQLite
- [x] Installer strips the crontab mirror (schedules already live in SQLite)
- [x] Offset and time-mode applied at fire time, not at write time
- [x] **[PI]** Verify a schedule survives a reboot and fires — verified; exposed the clock-jump misfire ([ADR 0005](adr/0005-bounded-schedule-catch-up.md))
- [x] **[PI]** Re-verify after a reboot that the clock-jump fix holds — verified: both guards fired, zero spurious broadcasts

## Phase 3 — GPIO

- [x] `go-gpiocdev` outputs for heartbeat, NTP and antenna LEDs
- [x] Button input with kernel debounce and pull-up bias
- [x] Stealth mode suppresses LEDs
- [x] Fake implementation behind the same interface for development
- [x] **[PI]** Lines behave after reboot; no leaked lines on restart — verified, kernel reports the 10ms debounce

## Phase 4 — release pipeline

- [x] `GOOS=linux GOARCH=arm64` cross-compile from the laptop
- [x] Both `linux/arm64` and `linux/arm` (GOARM=7) build, so either image works
- [x] GitHub Actions: build when `VERSION` changes, publish asset + `.sha256`
- [x] Update helper + systemd path unit (request file, hardened oneshot)
- [x] Rewrite the in-app updater against release assets
- [x] Remove `/api/system/switch-branch` and its UI
- [x] Stop committing `frontend/dist` (embedded at build time instead)

## Phase 5 — installer

- [x] Rewrite `install.sh` around `curl | sudo bash` of a release asset
- [x] Banner, stepped progress, spinner, TTY-aware colour fallback
- [x] Drop nginx, uv, virtualenv and the Python system packages
- [x] Keep txtempus install; keep chrony setup
- [x] Uninstall script

## Phase 6 — cutover

- [x] **[PI]** Full install on a clean machine — verified on the dev Pi after a
      full purge, with txtempus and chrony removed so both were built and
      installed from scratch. Not literally a fresh SD card: `build-essential`,
      `cmake` and `git` were already present, so a missing build dependency
      would not have been caught. Found three defects (see below).
- [x] **[PI]** Upgrade from a Python install, verifying nothing is lost — verified end to end
- [ ] Ship `restart.sh` on master as a shim that runs the new installer, so
      existing installs migrate from the update banner they already have
- [ ] Merge `experimental` into master (2 conflict hunks, both in built assets).
      The merge must **keep** `restart.sh`: Phase 8 deleted it here, and
      `apply_update` on master pulls before executing it, so letting that
      deletion land would strip the Python backend and the script that replaces
      it in the same pull, leaving no way to recover from the dashboard.
- [ ] Bump `VERSION` to `0.3.0` to cut the first full release. `0.3.0-rc.1` and
      `0.3.0-rc.2` are published as prereleases, so `releases/latest/download`
      is still unserved and no install can reach them by accident.

Defects the clean install found, all fixed in rc.2:

- `with_status` runs each step in a background subshell, so `download_release`
  could not hand `download_dir` back and the binary install resolved to `/`.
  Only ever broke on a TTY, which is why the upgrade test missed it.
- The scheduler ticked on a ticker aligned to daemon start, firing schedules up
  to 30s after the minute they name.
- Metrics rendered raw `float64`, so the dashboard showed `0.5025125628140703%`.

## Phase 7 — UI

- [x] Split `ControlWidget` (785 lines) and `ScheduleWidget` (722 lines)
- [ ] Layout pass on the 7/5 grid

## Notes

- Tests live in `tests/`, not beside the packages. They are all external
  (`package foo_test`), so they exercise only exported API. `go test ./...`
  covers them; per-package coverage needs `-coverpkg ./internal/...`.
- The daemon cannot migrate a database from `/home` itself: the unit sets
  `ProtectHome=true`, so the installer performs that migration as root.

## Phase 8 — post-Pi cleanup

- [x] Delete `airtime-server/backend`, `nginx.conf`, `restart.sh`, `status.sh`.
      `master` still carries the Python implementation if it is ever needed.
- [ ] Decide whether to surface the Time Tester in the UI — the backend supports
      it and the modal exists, but nothing has ever rendered a trigger for it.
