#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${ANDROID_SERIAL:?Set ANDROID_SERIAL to an isolated emulator}"
fixtures="$repo_dir/android/app/build/update-test-assets"
mkdir -p "$fixtures"
cp "$repo_dir/android/app/build/outputs/apk/release/app-release.apk" "$fixtures/printer-release.apk"
python3 - "$repo_dir/android/app/build/outputs/mapping/release/mapping.txt" "$fixtures/printer-symbols.json" <<'PY'
import json, re, sys
mapping = dict(re.findall(r'^([^ #].*?) -> (.*?):$', open(sys.argv[1]).read(), re.M))
symbols = {
    'connector': 'com.rdv.order.data.XprinterLocalConnector',
    'continuation': 'kotlin.coroutines.Continuation',
    'emptyContext': 'kotlin.coroutines.EmptyCoroutineContext',
    'connectContinuation': 'com.rdv.order.data.XprinterLocalConnector$connect$1',
}
with open(sys.argv[2], 'w') as output:
    json.dump({key: mapping[value] for key, value in symbols.items()}, output)
PY
exec "$repo_dir/scripts/android/gradle.sh" :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.rdv.order.ReleasePrinterDiscoveryTest
