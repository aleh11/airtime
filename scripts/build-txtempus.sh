#!/usr/bin/env bash
# Usage: scripts/build-txtempus.sh [goos/goarch ...]
#
# Builds the txtempus transmitter that ships with each release, so a Pi
# installs a verified binary instead of compiling one. Builds the pinned commit
# of the AirTime fork, runs its hardware simulation first, and writes
# build/txtempus-linux-<arch> plus a .sha256 for each target. The binaries are
# linked statically, so they do not depend on the Pi's C++ runtime.
#
# Needs git, cmake and a g++ cross compiler per target:
#   linux/arm64 -> aarch64-linux-gnu-g++   (g++-aarch64-linux-gnu)
#   linux/arm   -> arm-linux-gnueabihf-g++ (g++-arm-linux-gnueabihf)

set -Eeuo pipefail

# The fork carries Raspberry Pi 4 support on top of hzeller/txtempus. Bump the
# commit here to ship a new transmitter; every Pi picks it up on its next update.
txtempus_repository="https://github.com/aleh11/txtempus.git"
txtempus_commit="914edafa77555c2f3a8d100149ddf085768c020e"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=("linux/arm64")
fi

work="$(mktemp -d)"
trap 'rm -rf -- "${work}"' EXIT

echo "▸ fetching txtempus ${txtempus_commit:0:12}"
git init -q "${work}/txtempus"
git -C "${work}/txtempus" fetch -q --depth 1 "${txtempus_repository}" "${txtempus_commit}"
git -C "${work}/txtempus" checkout -q FETCH_HEAD

echo "▸ simulating the Raspberry Pi backend"
"${work}/txtempus/test/rpi-sim/run.sh" > "${work}/simulation.log" 2>&1 || {
  cat "${work}/simulation.log" >&2
  echo "txtempus simulation failed" >&2
  exit 1
}
tail -n 1 "${work}/simulation.log"

mkdir -p "${repo_root}/build"
for target in "${targets[@]}"; do
  goarch="${target##*/}"
  case "${goarch}" in
    arm64) compiler="aarch64-linux-gnu-g++" ;;
    arm) compiler="arm-linux-gnueabihf-g++" ;;
    *)
      echo "no txtempus toolchain for ${target}" >&2
      exit 1
      ;;
  esac
  command -v "${compiler}" >/dev/null 2>&1 || {
    echo "${compiler} is required to build txtempus for ${target}" >&2
    exit 1
  }

  output="${repo_root}/build/txtempus-linux-${goarch}"
  build_dir="${work}/build-${goarch}"
  echo "▸ compiling $(basename "${output}")"
  # armhf toolchains differ on whether off_t is 64-bit; txtempus itself forces
  # it, so nothing here depends on the toolchain's default.
  cmake -S "${work}/txtempus" -B "${build_dir}" -DPLATFORM=rpi \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_SYSTEM_NAME=Linux \
    -DCMAKE_CXX_COMPILER="${compiler}" \
    -DCMAKE_EXE_LINKER_FLAGS="-static" > /dev/null
  cmake --build "${build_dir}" -j "$(nproc 2>/dev/null || echo 2)" > /dev/null
  install -m 0755 "${build_dir}/txtempus" "${output}"

  (cd "${repo_root}/build" && sha256sum "$(basename "${output}")" > "$(basename "${output}").sha256")
done

echo "▸ done"
