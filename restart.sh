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

repository="aleh11/airtime"
latest_installer="https://github.com/${repository}/releases/latest/download/install.sh"
installer_url="${AIRTIME_INSTALLER_URL:-}"
release_base_url="${AIRTIME_RELEASE_BASE_URL:-}"
log="/var/log/airtime-migration.log"

# By the time this script runs, the pull that delivered it has already removed
# the Python backend, so there is no working install to fall back to: whatever
# happens next, it has to end with a daemon installed. Resolving through
# releases/latest is therefore not enough on its own — it serves nothing at all
# until a stable release exists, and a Pi that pulled this from a development
# branch beforehand would be left with neither implementation. Fall back to the
# newest release of any kind so the migration still completes.
resolve_installer() {
  if [[ -n "${installer_url}" ]]; then
    return 0
  fi

  if curl -fsIL --retry 2 "${latest_installer}" >/dev/null 2>&1; then
    installer_url="${latest_installer}"
    return 0
  fi

  echo "no stable release published; falling back to the newest prerelease" >&2

  local tag
  tag="$(curl -fsSL --retry 2 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${repository}/releases?per_page=10" 2>/dev/null \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"

  if [[ -z "${tag}" ]]; then
    echo "could not resolve any release to install; run the installer manually:" >&2
    echo "  curl -fsSL ${latest_installer} | sudo bash" >&2
    return 1
  fi

  installer_url="https://github.com/${repository}/releases/download/${tag}/install.sh"
  # The installer defaults its asset URLs to releases/latest, which is the thing
  # that was missing, so it has to be pointed at the same release.
  release_base_url="${release_base_url:-https://github.com/${repository}/releases/download/${tag}}"
  echo "migrating to ${tag}" >&2
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "this must run as root" >&2
  exit 1
fi

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run is required to migrate; run the installer manually:" >&2
  echo "  curl -fsSL ${latest_installer} | sudo bash" >&2
  exit 1
fi

resolve_installer

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
if [[ -n "${release_base_url}" ]]; then
  args+=(--setenv=AIRTIME_RELEASE_BASE_URL="${release_base_url}")
fi

echo "Migrating AirTime to a packaged release; follow ${log}"

exec systemd-run "${args[@]}" \
  /bin/bash -c "curl -fsSL '${installer_url}' | bash >>'${log}' 2>&1"
