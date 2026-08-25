# CLAUDE.md

AirTime is a Raspberry Pi appliance that transmits radio time signals (DCF77,
WWVB, MSF, JJY40, JJY60) to nearby radio-controlled clocks, plus a dashboard for
controlling it.

The whole backend is one Go daemon: `cmd/airtimed` with packages under
`internal/`. The dashboard is a React + Vite SPA in `airtime-server/frontend/`,
built and embedded into `internal/web/dist` by `scripts/build.sh`. State lives in
`/var/lib/airtime`.

`airtime-server/CLAUDE.md` describes the retired Python implementation and is
superseded — do not follow it.

## Start here

- [CONTEXT.md](CONTEXT.md) — domain vocabulary. Use these terms.
- [docs/adr/](docs/adr/) — the decisions and why.
- [docs/PORT-TODO.md](docs/PORT-TODO.md) — what remains from the Go port.

## Agent skills

### Issue tracker

Issues and specs are local markdown under the gitignored `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
