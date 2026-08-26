#!/usr/bin/env bash
#
# AirTime now ships as a single verified binary instead of a git checkout.
#
# The dashboard's "Update Now" button pulls this repository and then runs this
# script as root, so this is the last thing the git-based updater ever does: it
# hands over to the release installer, which retires the Python services, drops
# the nginx site and the crontab mirror, and migrates the database.
#
set -Eeuo pipefail

installer_url="${AIRTIME_INSTALLER_URL:-https://github.com/aleh11/airtime/releases/latest/download/install.sh}"
log="/var/log/airtime-migration.log"

if [[ "${EUID}" -ne 0 ]]; then
  echo "this must run as root" >&2
  exit 1
fi

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run is required to migrate; run the installer manually:" >&2
  echo "  curl -fsSL ${installer_url} | sudo bash" >&2
  exit 1
fi

# This script is a child of airtime-server.service, and the installer stops that
# unit. systemd kills the whole cgroup when it does, which would kill this
# script mid-migration and leave the Pi with neither the old stack nor the new
# one. A transient unit gets its own cgroup and survives the teardown.
args=(
  --unit=airtime-migration
  --collect
  --no-block
  --property=Type=oneshot
  --property=TimeoutStartSec=3600
)
if [[ -n "${AIRTIME_RELEASE_BASE_URL:-}" ]]; then
  args+=(--setenv=AIRTIME_RELEASE_BASE_URL="${AIRTIME_RELEASE_BASE_URL}")
fi

echo "Migrating AirTime to a packaged release; follow ${log}"

exec systemd-run "${args[@]}" \
  /bin/bash -c "curl -fsSL '${installer_url}' | bash >>'${log}' 2>&1"
