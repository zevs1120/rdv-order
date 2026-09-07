#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -z "${JAVA_HOME:-}" && -d "$repo_dir/.tools/zulu/Contents/Home" ]]; then
  export JAVA_HOME="$repo_dir/.tools/zulu/Contents/Home"
fi
if [[ -z "${ANDROID_HOME:-}" && -d "$repo_dir/.tools/android-sdk" ]]; then
  export ANDROID_HOME="$repo_dir/.tools/android-sdk"
fi
gradle_bin="$repo_dir/android/gradlew"
if [[ -x "$repo_dir/.tools/gradle-8.13/bin/gradle" ]]; then
  gradle_bin="$repo_dir/.tools/gradle-8.13/bin/gradle"
fi
exec "$gradle_bin" -p "$repo_dir/android" "$@"
