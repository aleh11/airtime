# Releases are versioned GitHub Release assets, not git pulls

AirTime originally updated itself by running `git pull` in the user's clone and restarting services, which meant every install was a working tree that could be dirtied, detached, or left on a branch nobody could identify. We now publish a single compiled binary per version as a GitHub Release asset alongside a `.sha256`, and both the installer and the in-app updater download and verify that asset. Users no longer need git, and a version is now a thing we can name and roll back to.

## Consequences

- The in-app update button cannot self-update the running process. It writes an update request file; a systemd path unit runs a hardened oneshot helper that swaps the binary and restarts the service. The application never escalates privileges — it only asks.
- Rollback becomes "install the previous asset", which is the same code path as a normal update.
- `frontend/dist` no longer needs to be committed, since releases carry the built frontend inside the binary.
