import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createApkDelta, restoreApkDelta } from '../../distribution/site/apk-delta.mjs';

it('shares the Android fixture format and rejects corrupt or wrong-base patches', () => {
  const fixture = JSON.parse(readFileSync('android/app/src/test/resources/delta-fixture.json', 'utf8'));
  const base = Buffer.from(fixture.base, 'base64');
  const target = Buffer.from(fixture.target, 'base64');
  const patch = createApkDelta(base, target);
  expect(patch.equals(Buffer.from(fixture.patch, 'base64'))).toBe(true);
  expect(restoreApkDelta(base, patch).equals(target)).toBe(true);
  expect(() => restoreApkDelta(Buffer.from('wrong base'), patch)).toThrow();
  expect(() => restoreApkDelta(base, patch.subarray(0, patch.length - 5))).toThrow();
  for (const size of [1, 63, 64, 129]) {
    const small = Buffer.alloc(size, 9);
    expect(restoreApkDelta(base, createApkDelta(base, small)).equals(small)).toBe(true);
  }
});
