#!/usr/bin/env bash
# The last thing the git updater ever does: hand over to the release installer.
set -Eeuo pipefail

repository="aleh11/airtime"
latest_installer="https://github.com/${repository}/releases/latest/download/install.sh"
installer_url="${AIRTIME_INSTALLER_URL:-}"
release_base_url="${AIRTIME_RELEASE_BASE_URL:-}"
log="/var/log/airtime-migration.log"

# releases/latest serves nothing until a stable exists, so fall back to the newest.
resolve_installer() {
  if [[ -n "${installer_url}" ]]; then
    return 0
  fi

  if curl -fsIL --retry 2 "${latest_installer}" >/dev/null 2>&1; then
    installer_url="${latest_installer}"
    return 0
  fi

  echo "no stable release published; falling back to the newest prerelease" >&2

  # No pipeline: a reader that stops early leaves curl on a closed pipe, fatal under pipefail.
  local body tag
  body="$(curl -fsSL --retry 2 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${repository}/releases?per_page=10" 2>/dev/null)" || body=""
  tag="$(awk -F'"' '/"tag_name"/{print $4; exit}' <<<"${body}")"

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

# A child of the unit the installer stops, so it needs its own cgroup to survive.
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
