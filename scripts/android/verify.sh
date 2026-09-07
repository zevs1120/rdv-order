#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node "$repo_dir/scripts/android/sync-resources.mjs" --check
tasks=(:app:testDebugUnitTest :app:lintDebug :app:assembleDebug)
if [[ "${1:-}" == "--device" ]]; then
  : "${ANDROID_SERIAL:?Set ANDROID_SERIAL to the isolated test device; this installs and runs fixture tests.}"
  tasks+=(:app:connectedDebugAndroidTest)
elif [[ $# -gt 0 ]]; then
  echo 'Usage: verify.sh [--device]' >&2
  exit 2
fi
exec "$repo_dir/scripts/android/gradle.sh" "${tasks[@]}"
