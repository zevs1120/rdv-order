// Stage one verified, immutable production APK and its download metadata in a single Git deployment.
import { readFileSync, writeFileSync, copyFileSync, constants, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  assert.ok(index >= 0 && index + 1 < args.length, `Usage: npm run android:stage-release -- --zh <更新内容> --en <What's new>`);
  return args[index + 1].trim();
};
const notes = { zh: option('--zh'), en: option('--en') };
assert.ok(args.length === 4 && notes.zh.length >= 1 && notes.zh.length <= 600 && notes.en.length >= 1 && notes.en.length <= 600,
  'Update details must be one Chinese and one English message, each up to 600 characters');
const site = path.join(root, 'distribution/site');
const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const metadata = JSON.parse(readFileSync(path.join(path.dirname(apk), 'output-metadata.json'))).elements[0];
const current = JSON.parse(readFileSync(path.join(site, 'public/release.json')));
const env = { ...process.env, JAVA_HOME: process.env.JAVA_HOME || path.join(root, '.tools/zulu/Contents/Home') };
const sdk = process.env.ANDROID_HOME || path.join(root, '.tools/android-sdk');
const run = (tool, args) => execFileSync(path.join(sdk, 'build-tools/35.0.0', tool), args, { env, encoding: 'utf8' });
const cert = file => run('apksigner', ['verify', '--print-certs', file]).match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/)?.[1];
const badging = run('aapt', ['dump', 'badging', apk]);
assert.match(metadata.versionName, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(metadata.versionCode) && metadata.versionCode > current.versionCode, 'Release versionCode must increase');
assert.ok(badging.includes(`package: name='com.rdv.order' versionCode='${metadata.versionCode}' versionName='${metadata.versionName}'`), 'APK identity/version mismatch');
assert.match(badging, /sdkVersion:'26'/);
assert.match(badging, /targetSdkVersion:'36'/);
const previousCert = cert(path.join(site, 'public', current.file));
assert.ok(previousCert && cert(apk) === previousCert, 'Production signing certificate changed');
run('zipalign', ['-c', '-P', '16', '4', apk]);
const bytes = readFileSync(apk);
const release = { ...current, version: metadata.versionName, versionCode: metadata.versionCode,
  file: `/releases/rdv-order-${metadata.versionName}.apk`, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), notes };
assert.ok(release.bytes <= 50 * 1024 * 1024, 'APK exceeds updater size bound');
const destination = path.join(site, 'public', release.file);
assert.ok(!existsSync(destination), 'Never overwrite a versioned APK');
const pagePath = path.join(site, 'public/index.html');
const oldPage = readFileSync(pagePath, 'utf8');
assert.ok(oldPage.includes(current.file) && oldPage.includes(`v${current.version}`));
const page = oldPage.replaceAll(path.basename(current.file), path.basename(release.file))
  .replaceAll(`v${current.version}`, `v${release.version}`)
  .replace(/(<p class="release">[^<]+<span>·<\/span> )[0-9.]+ MB/, `$1${(release.bytes / 1024 / 1024).toFixed(2)} MB`);
const configPath = path.join(site, 'vercel.json');
const configText = readFileSync(configPath, 'utf8');
assert.equal(JSON.parse(configText).rewrites.find(rule => rule.source === '/rdv-order.apk').destination, current.file);
copyFileSync(apk, destination, constants.COPYFILE_EXCL);
writeFileSync(pagePath, page);
writeFileSync(configPath, configText.replaceAll(current.file, release.file));
writeFileSync(path.join(site, 'public/release.json'), JSON.stringify(release, null, 2) + '\n');
console.log(`Staged ${release.version} (${release.versionCode}), ${release.bytes} bytes, SHA-256 ${release.sha256}`);
console.log('Run node distribution/site/verify.mjs and commit APK + metadata together before deploying.');
