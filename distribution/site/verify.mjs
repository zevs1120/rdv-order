import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const read = path => readFileSync(new URL(path, import.meta.url));
const release = JSON.parse(read('./public/release.json'));
assert.match(release.version, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(release.versionCode) && release.versionCode > 0);
assert.equal(release.file, `/releases/rdv-order-${release.version}.apk`);
assert.ok(Number.isSafeInteger(release.bytes) && release.bytes > 0 && release.bytes <= 50 * 1024 * 1024);
assert.match(release.sha256, /^[a-f0-9]{64}$/);
assert.ok(release.notes && typeof release.notes.zh === 'string' && typeof release.notes.en === 'string');
assert.ok(release.notes.zh.trim().length && release.notes.zh.length <= 600 && release.notes.en.trim().length && release.notes.en.length <= 600);
assert.match(release.file, /^\/releases\/rdv-order-\d+\.\d+\.\d+\.apk$/);
const apk = read('./public' + release.file);
assert.equal(apk.length, release.bytes, 'APK size changed');
assert.equal(createHash('sha256').update(apk).digest('hex'), release.sha256, 'APK checksum mismatch');
const page = read('./public/index.html').toString();
assert.ok(page.includes(`href="${release.file}"`), 'Download button points to wrong APK');
assert.ok(page.includes(`v${release.version}`), 'Page version differs from APK release');
assert.ok(page.includes(`Android ${release.minAndroid}+`), 'Minimum Android version differs');
assert.equal([...page.matchAll(/\sdownload="/g)].length, 1, 'Only the released ordering app may offer an APK');
const staff = page.match(/<section id="panel-staff"[\s\S]*?<\/section>/)?.[0];
assert.ok(staff && !/<a\b/.test(staff), 'The unfinished staff app must not offer a download');
assert.ok(staff.includes('data-zh="即将推出"'), 'Staff release status must be explicit');
for (const match of page.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  if (!match[1].endsWith('.apk')) read('./public' + match[1]);
}
for (const match of page.matchAll(/<[^>]+data-en="[^"]*"[^>]*>/g)) {
  assert.match(match[0], /data-zh="[^"]+"/, 'Every translated element needs Chinese text');
}
const config = JSON.parse(read('./vercel.json'));
assert.equal(config.rewrites.find(r => r.source === '/rdv-order.apk')?.destination, release.file);
assert.ok(config.headers.find(r => r.source === '/release.json')?.headers.some(h => h.key === 'Cache-Control' && h.value === 'no-store'), 'Update checks must not use stale CDN metadata');
console.log(`Verified RDV Order ${release.version}: APK checksum, size, page, assets, translations, staff placeholder and stable download URL.`);
