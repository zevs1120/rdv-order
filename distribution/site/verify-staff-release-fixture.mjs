import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const candidate = resolve(process.argv[2] || '');
assert.ok(process.argv[2] && existsSync(candidate), 'Pass the real candidate APK path as the only argument.');
const outputMetadata = JSON.parse(readFileSync(join(dirname(candidate), 'output-metadata.json')));
const output = outputMetadata.elements?.find(element => element.outputFile === basename(candidate));
assert.ok(output, 'Candidate APK is not declared by its output-metadata.json.');
assert.equal(outputMetadata.applicationId, 'com.rdv.staff');
assert.match(output.versionName, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(output.versionCode) && output.versionCode > 0);
assert.equal(outputMetadata.minSdkVersionForDexing, 26);
const site = new URL('.', import.meta.url).pathname;
const fixture = mkdtempSync(join(tmpdir(), 'rdv-team-release-'));
try {
  // Copy only public inputs; never duplicate local Vercel credentials/config caches.
  cpSync(join(site, 'public'), join(fixture, 'public'), { recursive: true });
  copyFileSync(join(site, 'verify.mjs'), join(fixture, 'verify.mjs'));
  copyFileSync(join(site, 'vercel.json'), join(fixture, 'vercel.json'));
  const bytes = statSync(candidate).size;
  const sha256 = createHash('sha256').update(readFileSync(candidate)).digest('hex');
  const file = `/releases/rdv-team-${output.versionName}.apk`;
  copyFileSync(candidate, join(fixture, 'public', file));
  writeFileSync(join(fixture, 'public', 'staff-release.json'), `${JSON.stringify({
    name: 'RDV Team', status: 'available', version: output.versionName, versionCode: output.versionCode, minAndroid: '8.0', packageName: outputMetadata.applicationId, file, bytes, sha256,
    notes: { zh: '修复已知问题，优化使用体验。', en: 'Bug fixes and experience improvements.' }
  }, null, 2)}\n`);
  const configPath = join(fixture, 'vercel.json');
  const config = JSON.parse(readFileSync(configPath));
  config.rewrites.push({ source: '/rdv-team.apk', destination: file });
  config.headers.push({ source: '/rdv-team.apk', headers: [{ key: 'Content-Type', value: 'application/vnd.android.package-archive' }, { key: 'Content-Disposition', value: 'attachment; filename="rdv-team.apk"' }, { key: 'Cache-Control', value: 'no-store' }] });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = spawnSync(process.execPath, ['verify.mjs'], { cwd: fixture, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  console.log(`Verified isolated available RDV Team fixture against ${bytes} real candidate bytes.`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
