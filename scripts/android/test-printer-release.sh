#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${ANDROID_SERIAL:?Set ANDROID_SERIAL to an isolated emulator}"
fixtures="$repo_dir/android/app/build/update-test-assets"
mkdir -p "$fixtures"
cp "$repo_dir/android/app/build/outputs/apk/release/app-release.apk" "$fixtures/printer-release.apk"
python3 - "$repo_dir/android/app/build/outputs/mapping/release/mapping.txt" "$fixtures/printer-symbols.json" <<'PY'
import json, re, sys
lines = open(sys.argv[1]).read().splitlines()
owner = None
for line in lines:
    match = re.match(r'^([^ #].*?) -> (.*?):$', line)
    if match: owner = match.group(2)
    if 'com.rdv.order.data.LanDiscovery.discover(' in line:
        symbols = {'discovery': owner, 'method': line.split(' -> ')[1]}
        break
else:
    raise RuntimeError('Missing release discovery method')
with open(sys.argv[2], 'w') as output:
    json.dump(symbols, output)
PY
exec "$repo_dir/scripts/android/gradle.sh" :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.rdv.order.ReleasePrinterDiscoveryTest
