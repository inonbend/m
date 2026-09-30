#!/usr/bin/env bash
# Builds local test fixtures (never committed: third-party footage and the Vital Animations license).
#   scripts/prepare-fixtures.sh <squat.mov> <curl_bad.mov> <curl_good.mov>
# Produces tests/fixtures/local/{squat_youtube,curl_bad,curl_good}.webm, curl_good.y4m and vital_subset.zip.
# Test Chromium has no H.264/HEVC decoder, so everything is transcoded to VP9 WebM.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/local; mkdir -p "$OUT"
FF=${FFMPEG:-$(command -v ffmpeg || python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")}
enc() { "$FF" -loglevel error -y -i "$1" -an -vf "scale=$3:-2,fps=30" -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 2M "$2"; }
[ $# -ge 3 ] && { enc "$1" "$OUT/squat_youtube.webm" 603; enc "$2" "$OUT/curl_bad.webm" 603; enc "$3" "$OUT/curl_good.webm" 603;
  "$FF" -loglevel error -y -i "$3" -an -vf "scale=360:-2,fps=30" -pix_fmt yuv420p "$OUT/curl_good.y4m"; }
# Vital Animations free pack: a few leg exercises + the JSON metadata
if [ ! -f "$OUT/vital_subset.zip" ]; then
  TMP=$(mktemp -d); curl -sSL https://vitalanimations.com/VitalAnimations.zip -o "$TMP/va.zip"
  (cd "$TMP" && unzip -q va.zip)
  mkdir -p "$TMP/sub"; cp "$TMP/VitalAnimations/Free50/50gymworkouts.json" "$TMP/sub/"
  for id in 0054 0055 0060 0076; do
    "$FF" -loglevel error -y -i "$TMP/VitalAnimations/Free50/Free50/$id.mp4" -an -vf scale=540:-2 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 1M "$TMP/sub/$id.webm"
  done
  (cd "$TMP/sub" && zip -q -0 "$OLDPWD/$OUT/vital_subset.zip" *)
  rm -rf "$TMP"
fi
ls -la "$OUT"
