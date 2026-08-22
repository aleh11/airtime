#!/usr/bin/env bash
#
# Removes AirTime. Pass --purge to delete schedules and settings as well.
#
set -Eeuo pipefail

state_dir="/var/lib/airtime"
purge=false
[[ "${1:-}" == "--purge" ]] && purge=true

[[ "${EUID}" -eq 0 ]] || { echo "run this with sudo" >&2; exit 1; }

systemctl disable --now airtime.service airtime-update.path 2>/dev/null || true
rm -f /etc/systemd/system/airtime.service \
      /etc/systemd/system/airtime-update.service \
      /etc/systemd/system/airtime-update.path \
      /usr/local/libexec/airtime-update \
      /usr/local/bin/airtime
systemctl daemon-reload

if [[ "${purge}" == true ]]; then
  rm -rf -- "${state_dir}"
  echo "AirTime removed, including schedules and settings."
else
  echo "AirTime removed. Schedules and settings are kept in ${state_dir}."
fi
