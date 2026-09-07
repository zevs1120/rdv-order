#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node "$repo_dir/scripts/android/sync-resources.mjs" --check
"$repo_dir/scripts/android/gradle.sh" :app:assembleDebug "$@"
sdk_dir="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$repo_dir/.tools/android-sdk}}"
build_tools="$sdk_dir/build-tools/35.0.0"
if [[ ! -x "$build_tools/apksigner" ]]; then
  echo 'Set ANDROID_HOME to an SDK with build-tools 35.0.0.' >&2
  exit 1
fi
if [[ -z "${JAVA_HOME:-}" && -d "$repo_dir/.tools/zulu/Contents/Home" ]]; then
  export JAVA_HOME="$repo_dir/.tools/zulu/Contents/Home"
fi
artifact_dir="$repo_dir/artifacts/android"
mkdir -p "$artifact_dir"
artifact_apk="$artifact_dir/rdv-order-0.1.0-internal.apk"
cp "$repo_dir/android/app/build/outputs/apk/debug/app-debug.apk" "$artifact_apk"
"$build_tools/apksigner" verify --verbose --print-certs "$artifact_apk" > "$artifact_dir/apk-signature.txt"
"$build_tools/zipalign" -c -P 16 -v 4 "$artifact_apk" > "$artifact_dir/apk-alignment.txt"
"$build_tools/aapt" dump badging "$artifact_apk" > "$artifact_dir/apk-metadata.txt"
shasum -a 256 "$artifact_apk" > "$artifact_dir/SHA256SUMS.txt"
echo "$artifact_apk"
