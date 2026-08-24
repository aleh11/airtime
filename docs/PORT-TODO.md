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

- [ ] **[PI]** Full install on a clean SD card
- [x] **[PI]** Upgrade from a Python install, verifying nothing is lost — verified end to end
- [ ] Merge `experimental` into master (2 conflict hunks, both in built assets)
- [ ] Bump `VERSION` to cut the first binary release

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
