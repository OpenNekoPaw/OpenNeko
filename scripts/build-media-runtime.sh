#!/usr/bin/env bash
set -euo pipefail

target="${1:?target is required}"
output_root="${2:?output root is required}"
ffmpeg_version="8.1.2"
source_sha256="464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c"
work_root="$(mktemp -d)"
archive="${work_root}/ffmpeg-${ffmpeg_version}.tar.xz"
source_root="${work_root}/ffmpeg-${ffmpeg_version}"
install_root="${work_root}/install"

curl --fail --location --silent --show-error \
  --retry 5 \
  --retry-all-errors \
  --retry-delay 2 \
  "https://ffmpeg.org/releases/ffmpeg-${ffmpeg_version}.tar.xz" \
  --output "${archive}"
actual_sha256="$(shasum -a 256 "${archive}" | awk '{print $1}')"
if [[ "${actual_sha256}" != "${source_sha256}" ]]; then
  echo "FFmpeg source checksum mismatch." >&2
  exit 1
fi
tar -xf "${archive}" -C "${work_root}"

configure_args=(
  "--prefix=${install_root}"
  "--disable-doc"
  "--disable-debug"
  "--disable-ffplay"
  "--disable-avdevice"
  "--disable-network"
  "--disable-autodetect"
  "--disable-shared"
  "--enable-static"
)
if [[ "${target}" == "darwin-arm64" ]]; then
  configure_args+=("--enable-videotoolbox" "--enable-audiotoolbox")
elif [[ "${target}" == "win32-x64" ]]; then
  configure_args+=(
    "--target-os=mingw32"
    "--arch=x86_64"
    "--enable-mediafoundation"
  )
else
  echo "Unsupported media runtime target: ${target}." >&2
  exit 1
fi

(
  cd "${source_root}"
  ./configure "${configure_args[@]}"
  make -j2
  make install
)

node scripts/prepare-media-runtime-bundle.mjs \
  --target "${target}" \
  --ffmpeg "${install_root}/bin/ffmpeg" \
  --ffprobe "${install_root}/bin/ffprobe" \
  --license "${source_root}/COPYING.LGPLv2.1" \
  --spdx "LGPL-2.1-or-later" \
  --output "${output_root}"
