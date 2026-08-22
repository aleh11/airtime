#!/usr/bin/env bash
#
# AirTime installer.
#
#   curl -fsSL https://github.com/aleh11/airtime/releases/latest/download/install.sh | sudo bash
#
set -Eeuo pipefail

service_name="airtime"
install_path="/usr/local/bin/airtime"
service_path="/etc/systemd/system/airtime.service"
update_service_path="/etc/systemd/system/airtime-update.service"
update_path_unit="/etc/systemd/system/airtime-update.path"
update_helper="/usr/local/libexec/airtime-update"
state_dir="/var/lib/airtime"
update_request_path="${state_dir}/update.request"
legacy_dir="/home/time/airtime"
repository="aleh11/airtime"
release_base_url="${AIRTIME_RELEASE_BASE_URL:-https://github.com/${repository}/releases/latest/download}"
download_dir=""
step_index=0
step_total=8
progress_visible=false
status_visible=false

if [[ -t 1 && "${TERM:-dumb}" != "dumb" ]]; then
  accent=$'\033[38;5;214m'
  accent_alt=$'\033[38;5;220m'
  success=$'\033[38;5;83m'
  danger=$'\033[38;5;203m'
  muted=$'\033[38;5;244m'
  bright=$'\033[1m'
  reset=$'\033[0m'
  clear_line=$'\r\033[2K'
  interactive=true
else
  accent=""
  accent_alt=""
  success=""
  danger=""
  muted=""
  bright=""
  reset=""
  clear_line=$'\r'
  interactive=false
fi

cleanup() {
  if [[ -n "${download_dir}" && -d "${download_dir}" ]]; then
    rm -rf -- "${download_dir}"
  fi
}
trap cleanup EXIT

fail() {
  printf '%b\n  ✕  %s%b\n' "${danger}" "$1" "${reset}" >&2
  exit 1
}

render_banner() {
  printf '\n%b' "${accent}"
  printf '%s\n' \
    '     █████╗ ██╗██████╗ ████████╗██╗███╗   ███╗███████╗' \
    '    ██╔══██╗██║██╔══██╗╚══██╔══╝██║████╗ ████║██╔════╝' \
    '    ███████║██║██████╔╝   ██║   ██║██╔████╔██║█████╗  '
  printf '%b' "${accent_alt}"
  printf '%s\n' \
    '    ██╔══██║██║██╔══██╗   ██║   ██║██║╚██╔╝██║██╔══╝  ' \
    '    ██║  ██║██║██║  ██║   ██║   ██║██║ ╚═╝ ██║███████╗' \
    '    ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝╚═╝     ╚═╝╚══════╝'
  printf '\n%b    ◷  P R E C I S I O N   O N   T H E   A I R%b' "${accent}" "${reset}"
  printf '%b     DCF77 · WWVB · MSF · JJY%b\n\n' "${muted}" "${reset}"
}

render_progress() {
  local width=42
  local filled=$((step_index * width / step_total))
  local empty=$((width - filled))
  local bar=""
  local index
  for ((index = 0; index < filled; index++)); do bar+="━"; done
  for ((index = 0; index < empty; index++)); do bar+="·"; done
  printf '     %b%s%b %3d%%\n' "${accent}" "${bar}" "${reset}" "$((step_index * 100 / step_total))"
}

complete_step() {
  step_index=$((step_index + 1))
  if [[ "${interactive}" == true && "${progress_visible}" == true ]]; then
    if [[ "${status_visible}" == true ]]; then
      printf '\033[2A'
    else
      printf '\033[1A'
    fi
    printf '%b' "${clear_line}"
  fi
  printf '  %b✓%b  %s\n' "${success}" "${reset}" "$1"
  if [[ "${interactive}" == true ]]; then
    printf '%b' "${clear_line}"
    render_progress
    progress_visible=true
  elif [[ "${step_index}" -eq "${step_total}" ]]; then
    render_progress
  fi
  status_visible=false
}

render_status() {
  local frame="$1"
  local label="$2"
  if [[ "${progress_visible}" == true ]]; then
    if [[ "${status_visible}" == true ]]; then
      printf '\033[2A'
    else
      printf '\033[1A'
    fi
  fi
  printf '%b  %b%s%b  %s\n' "${clear_line}" "${accent}" "${frame}" "${reset}" "${label}"
  printf '%b' "${clear_line}"
  render_progress
  progress_visible=true
  status_visible=true
}

# Runs a command while animating a waveform spinner, keeping its output for
# failures only so a successful install stays quiet.
with_status() {
  local label="$1"
  shift

  if [[ "${interactive}" != true ]]; then
    printf '  ·  %s\n' "${label}"
    "$@" >/dev/null 2>&1 || return 1
    return 0
  fi

  local frames=('≋  ' ' ≋ ' '  ≋' ' ≋ ')
  local log
  log="$(mktemp)"

  "$@" >"${log}" 2>&1 &
  local pid=$!
  local index=0

  while kill -0 "${pid}" 2>/dev/null; do
    render_status "${frames[index % ${#frames[@]}]}" "${label}"
    index=$((index + 1))
    sleep 0.12
  done

  if ! wait "${pid}"; then
    printf '\n%b' "${muted}"
    tail -n 12 "${log}" >&2
    printf '%b' "${reset}"
    rm -f "${log}"
    return 1
  fi

  rm -f "${log}"
  return 0
}

detect_asset() {
  local machine
  machine="$(uname -m)"
  case "${machine}" in
    aarch64 | arm64) printf 'airtime-linux-arm64' ;;
    armv7l | armv6l | arm) printf 'airtime-linux-arm' ;;
    *) fail "unsupported architecture ${machine}; AirTime ships arm64 and armv7 builds" ;;
  esac
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "run this installer with sudo"
}

preflight() {
  require_root
  command -v curl >/dev/null 2>&1 || fail "curl is required to download the release"
  command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required to verify the release"
  command -v systemctl >/dev/null 2>&1 || fail "systemd is required"
}

download_release() {
  local asset="$1"
  download_dir="$(mktemp -d)"

  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${asset}" --output "${download_dir}/${asset}"
  curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \
    "${release_base_url}/${asset}.sha256" --output "${download_dir}/${asset}.sha256"

  (cd "${download_dir}" && sha256sum --check --status "${asset}.sha256") \
    || fail "checksum mismatch — refusing to install this download"
}

install_dependencies() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends chrony
}

install_txtempus() {
  if [[ -x /usr/bin/txtempus ]]; then
    return 0
  fi

  apt-get install -y --no-install-recommends git build-essential cmake
  local work
  work="$(mktemp -d)"
  git clone --depth 1 https://github.com/hzeller/txtempus.git "${work}/txtempus"
  mkdir -p "${work}/txtempus/build"
  (cd "${work}/txtempus/build" && cmake .. -DPLATFORM=rpi && make && make install)
  rm -rf "${work}"
}

retire_python_install() {
  local unit
  for unit in airtime-server airtime-status; do
    if systemctl list-unit-files | grep -q "^${unit}.service"; then
      systemctl disable --now "${unit}" || true
      rm -f "/etc/systemd/system/${unit}.service"
    fi
  done

  # The dashboard is served by the daemon now, so the nginx site goes with it.
  if [[ -e /etc/nginx/sites-enabled/airtime ]]; then
    rm -f /etc/nginx/sites-enabled/airtime /etc/nginx/sites-available/airtime
    systemctl reload nginx 2>/dev/null || true
  fi

  # Schedules live in the database; the crontab was only ever a mirror of it.
  if crontab -l -u root >/dev/null 2>&1; then
    crontab -l -u root | grep -v 'txtempus' | crontab -u root - || true
  fi
}

install_binary() {
  local asset="$1"
  install -m 0755 -o root -g root "${download_dir}/${asset}" "${install_path}"
}

provision_state() {
  install -d -m 0755 -o root -g root "${state_dir}"

  local legacy_db="${legacy_dir}/airtime-server/database/airtime.db"
  if [[ -f "${legacy_db}" && ! -f "${state_dir}/airtime.db" ]]; then
    printf '  %b·%b  found an existing database; it will be migrated on first start\n' "${muted}" "${reset}"
  fi
}

install_units() {
  cat > "${service_path}" <<UNIT
[Unit]
Description=AirTime time-signal transmitter
Wants=network-online.target
After=network-online.target chrony.service

[Service]
Type=simple
ExecStart=${install_path}
Environment=AIRTIME_STATE_DIR=${state_dir}
Environment=AIRTIME_LEGACY_DB=${legacy_dir}/airtime-server/database/airtime.db
Restart=always
RestartSec=3
StateDirectory=airtime
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${state_dir}
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT

  install -d -m 0755 -o root -g root /usr/local/libexec
  cat > "${update_helper}" <<HELPER
#!/usr/bin/env bash
# Installs the latest AirTime release. Triggered by airtime-update.path when the
# daemon writes an update request; the daemon itself never has the privileges to
# replace its own binary.
set -Eeuo pipefail

request="${update_request_path}"
install_path="${install_path}"
release_base_url="${release_base_url}"

rm -f -- "\${request}"

machine="\$(uname -m)"
case "\${machine}" in
  aarch64 | arm64) asset="airtime-linux-arm64" ;;
  *) asset="airtime-linux-arm" ;;
esac

work="\$(mktemp -d)"
trap 'rm -rf -- "\${work}"' EXIT

curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \\
  "\${release_base_url}/\${asset}" --output "\${work}/\${asset}"
curl --fail --silent --show-error --location --retry 3 --proto '=https' --tlsv1.2 \\
  "\${release_base_url}/\${asset}.sha256" --output "\${work}/\${asset}.sha256"

cd "\${work}"
sha256sum --check --status "\${asset}.sha256"

install -m 0755 -o root -g root "\${work}/\${asset}" "\${install_path}"
systemctl restart airtime
HELPER
  chmod 0755 "${update_helper}"

  cat > "${update_service_path}" <<UNIT
[Unit]
Description=Install an AirTime release update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${update_helper}
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/usr/local/bin ${state_dir}
UNIT

  cat > "${update_path_unit}" <<UNIT
[Unit]
Description=Watch for AirTime update requests

[Path]
PathExists=${update_request_path}
Unit=airtime-update.service

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable "${service_name}" airtime-update.path
}

start_service() {
  systemctl restart "${service_name}"
  systemctl restart chrony 2>/dev/null || systemctl restart chronyd 2>/dev/null || true

  local attempt
  for attempt in $(seq 1 20); do
    if systemctl is-active --quiet "${service_name}"; then
      return 0
    fi
    sleep 0.5
  done

  journalctl -u "${service_name}" --no-pager -n 20 >&2
  return 1
}

render_summary() {
  local address
  address="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  [[ -n "${address}" ]] || address="pi-ip-address"

  printf '\n  %b%sAirTime is on the air%b\n\n' "${bright}" "${success}" "${reset}"
  printf '    %bDashboard%b  https://%s:8443\n' "${muted}" "${reset}" "${address}"
  printf '    %bStatus%b     systemctl status %s\n' "${muted}" "${reset}" "${service_name}"
  printf '    %bLogs%b       journalctl -u %s -f\n' "${muted}" "${reset}" "${service_name}"
  printf '    %bState%b      %s\n\n' "${muted}" "${reset}" "${state_dir}"
  printf '  %bYour browser will warn about the self-signed certificate. That is expected.%b\n\n' "${muted}" "${reset}"
}

main() {
  render_banner
  preflight

  local asset
  asset="$(detect_asset)"

  complete_step "Checked this Pi (${asset#airtime-linux-})"

  with_status "Downloading and verifying the release" download_release "${asset}" \
    || fail "could not download a verified release"
  complete_step "Downloaded and verified ${asset}"

  with_status "Installing system packages" install_dependencies \
    || fail "could not install system packages"
  complete_step "System packages installed"

  with_status "Installing the txtempus transmitter" install_txtempus \
    || fail "could not install txtempus"
  complete_step "Transmitter ready"

  with_status "Retiring the previous install" retire_python_install \
    || fail "could not retire the previous install"
  complete_step "Previous install retired"

  with_status "Installing AirTime" install_binary "${asset}" \
    || fail "could not install the binary"
  provision_state
  complete_step "AirTime installed to ${install_path}"

  with_status "Writing service units" install_units \
    || fail "could not install service units"
  complete_step "Services registered"

  with_status "Starting AirTime" start_service \
    || fail "AirTime did not start"
  complete_step "AirTime is running"

  render_summary
}

main "$@"
