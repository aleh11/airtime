# Existing installs migrate through the update button they already have

Every Python-era install polls `origin/master` and offers an update, which pulls
the repository and then runs `restart.sh` from the freshly pulled tree as root.
Both of those files are ours, so replacing `restart.sh` on master *is* the
migration: the user clicks the button they have always clicked, and the script
that arrives hands over to the release installer, which retires the Python
services, drops the nginx site and the crontab mirror, and migrates the
database. Nobody has to be told to open a terminal.

The installer stops `airtime-server.service`, and the script runs as a child of
it. systemd kills the whole cgroup when a unit stops, which would kill the
migration at its worst moment: the Python services retired, the new binary not
yet installed, and no dashboard left to recover from. The installer therefore
runs as a transient unit via `systemd-run`, which gets its own cgroup and
survives the teardown of its caller. This was measured on hardware rather than
reasoned about — a plain background child is killed, a transient unit is not.

## Consequences

- `restart.sh` must survive the cutover merge. It lives on `experimental` as the
  shim so the merge preserves it by default, rather than deleting the one file
  that migrates an existing install.
- The migration is one-way and unattended. After it runs the install is on the
  daemon and the git-based updater is gone.
- Installs whose `git` invocations fail are unreachable. The old endpoint
  compares the local and remote commits as strings, so when both lookups fail
  they compare equal and the dashboard reports itself permanently up to date —
  the symptom is a commit shown as `unknown`. Those installs need the documented
  `curl | sudo bash`, and the release notes have to say so.
- The shim resolves the installer through `releases/latest/download`, so a
  stable release must exist before it is published to master.
