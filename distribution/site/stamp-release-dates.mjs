// Run during release staging, before committing public download metadata.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
for (const name of ['release.json', 'staff-release.json']) {
  const file = new URL(`./public/${name}`, import.meta.url);
  const release = JSON.parse(readFileSync(file));
  if (release.status === 'unavailable') continue;
  assert.match(release.file, /^\/releases\/rdv-(?:order|team)-\d+\.\d+\.\d+\.apk$/);
  const bytes = readFileSync(new URL(`./public${release.file}`, import.meta.url));
  assert.equal(bytes.length, release.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), release.sha256);
  if (release.releaseDateSha256 === release.sha256 && /^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate)) continue;
  release.releaseDate = today;
  release.releaseDateSha256 = release.sha256;
  writeFileSync(file, JSON.stringify(release, null, 2) + '\n');
  console.log(`${release.name}: release date ${today}`);
}
