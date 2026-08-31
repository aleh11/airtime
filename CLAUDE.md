# CLAUDE.md

AirTime is a Raspberry Pi appliance that transmits radio time signals (DCF77,
WWVB, MSF, JJY40, JJY60) to nearby radio-controlled clocks, plus a dashboard for
controlling it.

The whole backend is one Go daemon: `cmd/airtimed` with packages under
`internal/`. The dashboard is a React + Vite SPA in `airtime-server/frontend/`,
built and embedded into `internal/web/dist` by `scripts/build.sh`. State lives in
`/var/lib/airtime`.

## Comments

One line, or none. A comment longer than one line is a defect: cut it or delete
it. Never restate what the code does — the only thing worth writing down is a
*why* that cannot be read off the code, and that fits on one line. History
belongs in commit messages, reasoning belongs in `docs/adr/`, and neither
belongs above a function.

No doc comments on packages, types or functions, in any language, including Go
and TSDoc. The convention does not override this.

## Start here

- [CONTEXT.md](CONTEXT.md) — domain vocabulary. Use these terms.
- [docs/adr/](docs/adr/) — the decisions and why.
- [docs/PORT-TODO.md](docs/PORT-TODO.md) — what remains from the Go port.

## Agent skills

### Issue tracker

Issues and specs are local markdown under the gitignored `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
