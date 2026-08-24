#!/usr/bin/env bash
# Builds the dashboard, embeds it, and compiles the daemon.
#
# Usage: scripts/build.sh [version] [goos/goarch ...]

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-}"
shift || true
if [[ -z "${version}" ]]; then
  if [[ -f "${repo_root}/VERSION" ]]; then
    version="v$(tr -d '[:space:]' < "${repo_root}/VERSION")-dev"
  else
    version="dev"
  fi
fi
targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=("linux/arm64")
fi

cd "${repo_root}"

echo "▸ building dashboard"
(cd airtime-server/frontend && npm ci --no-audit --no-fund && npm run build)

echo "▸ embedding dashboard"
rm -rf internal/web/dist
cp -R airtime-server/frontend/dist internal/web/dist

mkdir -p build
for target in "${targets[@]}"; do
  goos="${target%%/*}"
  goarch="${target##*/}"
  output="build/airtime-${goos}-${goarch}"

  echo "▸ compiling ${output}"
  CGO_ENABLED=0 GOOS="${goos}" GOARCH="${goarch}" GOARM=7 \
    go build -trimpath -ldflags "-s -w -X main.version=${version}" \
    -o "${output}" ./cmd/airtimed

  (cd build && sha256sum "$(basename "${output}")" > "$(basename "${output}").sha256")
done

echo "▸ done"
ls -la build/
