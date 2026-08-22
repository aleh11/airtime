# The backend is Go, serving its own frontend and TLS

The Python backend needed a virtualenv, uv, system Python packages, and nginx to serve the frontend and terminate TLS, which made every install a multi-part assembly that could half-fail. The backend is being rewritten in Go: it compiles to one static binary with the frontend embedded via `//go:embed`, terminates TLS itself, and cross-compiles to the Pi from a developer laptop with `GOOS=linux GOARCH=arm64` and no emulation, container, or arm64 CI runner.

## Considered Options

- **PyInstaller.** Keeps the existing code, but the binary must be built on arm64 hardware or under emulation, and it does not remove nginx or the GPIO dependency chain.
- **Deno**, matching the neighbouring Airwave project. `deno compile` gives a single binary, but GPIO would mean spawning `gpiomon` and parsing stdout, output lines have no clean answer because `gpioset` releases the line on exit, and Deno has no 32-bit ARM target at all.
- **Go**, chosen. `warthog618/go-gpiocdev` speaks the kernel GPIO character device directly with no cgo, holding output lines for the process lifetime and handling debounce and bias as kernel-level flags.

## Consequences

- cgo must stay off, or the trivial cross-compilation that motivated this choice is lost. SQLite therefore uses `modernc.org/sqlite`, not `mattn/go-sqlite3`.
- nginx, uv, the virtualenv, and the `gpiozero`/`python-crontab` system packages all leave the install.
- Privilege reduction is only partial: GPIO no longer needs root, but txtempus drives the hardware directly, so the daemon retains the privileges needed to spawn it.
