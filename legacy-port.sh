#!/usr/bin/env bash
# Ports a pre-2.0 AirTime to the daemon when its own update button cannot.
set -Eeuo pipefail

repository="aleh11/airtime"
state_dir="/var/lib/airtime"
latest_installer="https://github.com/${repository}/releases/latest/download/install.sh"

if [[ "${EUID}" -ne 0 ]]; then
  echo "run this with sudo" >&2
  exit 1
fi

say() { printf '  ·  %s\n' "$1"; }

legacy_dir="${AIRTIME_LEGACY_DIR:-}"
if [[ -z "${legacy_dir}" ]]; then
  for candidate in /home/*/airtime /opt/airtime /root/airtime; do
    if [[ -f "${candidate}/airtime-server/backend/server.py" || -f "${candidate}/airtime-server/database/airtime.db" ]]; then
      legacy_dir="${candidate}"
      break
    fi
  done
fi

if [[ -n "${legacy_dir}" ]]; then
  say "found the old install at ${legacy_dir}"
else
  say "no old install found; installing fresh"
fi

say "stopping the old services"
for unit in airtime-server airtime-status; do
  systemctl disable --now "${unit}.service" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${unit}.service"
done
systemctl daemon-reload

if [[ -e /etc/nginx/sites-enabled/airtime ]]; then
  say "removing the nginx site"
  rm -f /etc/nginx/sites-enabled/airtime /etc/nginx/sites-available/airtime
  systemctl reload nginx >/dev/null 2>&1 || true
fi

if crontab -l -u root >/dev/null 2>&1; then
  crontab -l -u root | grep -v 'txtempus' | crontab -u root - || true
fi

legacy_db="${legacy_dir:+${legacy_dir}/airtime-server/database/airtime.db}"
if [[ -n "${legacy_db}" && -f "${legacy_db}" && ! -f "${state_dir}/airtime.db" ]]; then
  install -d -m 0755 -o root -g root "${state_dir}"
  # The backup API, because the database is in WAL mode and recent writes may
  # live only in its sidecar.
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${legacy_db}" ".backup '${state_dir}/airtime.db'"
  else
    cp -- "${legacy_db}" "${state_dir}/airtime.db"
  fi
  mv -- "${legacy_db}" "${legacy_db}.ported"
  rm -f -- "${legacy_db}-wal" "${legacy_db}-shm"
  schedules="$(sqlite3 "${state_dir}/airtime.db" 'SELECT COUNT(*) FROM cron_jobs' 2>/dev/null || echo '?')"
  say "moved your database across (${schedules} schedules kept)"
elif [[ -f "${state_dir}/airtime.db" ]]; then
  say "a database is already in ${state_dir}; leaving it alone"
fi

installer_url="${latest_installer}"
release_base_url="${AIRTIME_RELEASE_BASE_URL:-}"
if ! curl -fsIL --retry 2 "${latest_installer}" >/dev/null 2>&1; then
  # No pipeline: a reader that stops early leaves curl on a closed pipe, fatal under pipefail.
  body="$(curl -fsSL --retry 2 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${repository}/releases?per_page=10" 2>/dev/null)" || body=""
  tag="$(awk -F'"' '/"tag_name"/{print $4; exit}' <<<"${body}")"
  if [[ -z "${tag}" ]]; then
    echo "could not reach GitHub to fetch the installer; check this Pi's internet" >&2
    exit 1
  fi
  installer_url="https://github.com/${repository}/releases/download/${tag}/install.sh"
  release_base_url="${release_base_url:-https://github.com/${repository}/releases/download/${tag}}"
  say "no stable release yet; using ${tag}"
fi

say "running the installer"
if [[ -n "${release_base_url}" ]]; then
  curl -fsSL "${installer_url}" | AIRTIME_RELEASE_BASE_URL="${release_base_url}" bash
else
  curl -fsSL "${installer_url}" | bash
fi
