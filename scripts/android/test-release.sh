#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${ANDROID_SERIAL:?Set ANDROID_SERIAL to an isolated emulator}"
fixtures="$repo_dir/android/app/build/update-test-assets"
mkdir -p "$fixtures"
cp "$repo_dir/distribution/site/public/releases/rdv-order-0.1.2.apk" "$fixtures/update-old.apk"
cp "$repo_dir/android/app/build/outputs/apk/release/app-release.apk" "$fixtures/update-next.apk"
cp "$repo_dir/distribution/site/public/release.json" "$fixtures/update-release.json"
exec "$repo_dir/scripts/android/gradle.sh" :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.rdv.order.UpdatePackageTest
