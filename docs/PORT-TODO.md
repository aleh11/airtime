# Go port + release pipeline — what is left

Everything through Phase 5 is done and signed off on hardware. The decisions
behind it live in [docs/adr/](adr/), which is where to read rather than here:
[0001](adr/0001-github-releases-single-binary.md),
[0002](adr/0002-state-lives-outside-the-install.md),
[0003](adr/0003-go-backend.md),
[0004](adr/0004-in-process-scheduler.md),
[0005](adr/0005-bounded-schedule-catch-up.md),
[0006](adr/0006-release-channels.md),
[0007](adr/0007-migrating-existing-installs.md).

This file is a plan, not a record. Delete it once the cutover lands.

Anything marked **[PI]** cannot be signed off without hardware.

## Cutover

- [ ] Decide the first stable version. `VERSION` is `0.4.0`, so merging cuts
      `v0.4.0` and `0.3.0` never exists. Permanent once published.
- [ ] Merge `experimental` into master. Master has been merged in already, so
      this is currently conflict-free — confirm that still holds before doing it.
- [ ] Confirm `releases/latest/download/install.sh` returns 200 once the stable
      release publishes. The migration shim resolves through it, and it 404s
      while every release is a prerelease.
- [ ] Say in the release notes that an install reporting its commit as
      `unknown` cannot migrate itself and needs the manual installer
      ([0007](adr/0007-migrating-existing-installs.md)).

## Verification still outstanding

- [ ] **[PI]** The CPU figure holds still. Three reads in a row should agree
      with each other and with the kernel; the Pi is on a build from before the
      fix, where they did not.
- [ ] **[PI]** A clean SD card. The clean install was verified on a wiped Pi
      that already had `build-essential`, `cmake` and `git`, so a missing build
      dependency would still not be caught.

## UI

- [ ] Port master's custom beaker SVG onto the themed tokens. Master styles it
      with hardcoded purple utilities, which is the one thing `index.css` says
      components may not do.
- [ ] Layout pass on the 7/5 grid.
- [ ] Decide whether to surface the Time Tester. The backend supports it and the
      modal exists, but nothing has ever rendered a trigger for it.

## Cleanup after the cutover

- [ ] Untrack `airtime-server/frontend/dist`. It is a build output that is still
      tracked, `scripts/build.sh` regenerates it, and Tailwind's source detection
      scans it because it is not gitignored. Safe once no install pulls master
      expecting nginx to serve it.
- [ ] Prune old `-beta` prereleases. Every push to `experimental` publishes one
      and nothing removes them.

## Notes

- Tests live in `tests/`, not beside the packages. They are all external
  (`package foo_test`), so they exercise only exported API. `go test ./...`
  covers them; per-package coverage needs `-coverpkg ./internal/...`.
- The daemon cannot migrate a database from `/home` itself: the unit sets
  `ProtectHome=true`, so the installer performs that migration as root.
