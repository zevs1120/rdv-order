// Build-time only, shared with Android release staging. No phone/runtime dependency.
// COPY unchanged signed-APK bytes, ADD new bytes, gzip the instruction stream.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const BLOCK = 64;
const MAX = 50 * 1024 * 1024;
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const uint = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
function hash(data, start) {
  let value = 0;
  for (let i = start; i < start + BLOCK; i++) value = (Math.imul(value, 257) + data[i]) >>> 0;
  return value;
}
let power = 1;
for (let i = 1; i < BLOCK; i++) power = Math.imul(power, 257) >>> 0;

export function createApkDelta(base, target) {
  assert.ok(base.length > 0 && base.length <= MAX && target.length > 0 && target.length <= MAX);
  const index = new Map();
  for (let offset = 0; offset + BLOCK <= base.length; offset += BLOCK) {
    const key = hash(base, offset);
    const bucket = index.get(key) || [];
    // Bound collision work; missed matches only make the patch larger, never incorrect.
    if (bucket.length < 8) bucket.push(offset);
    index.set(key, bucket);
  }
  const parts = [Buffer.from('RDVDLT01'), uint(target.length),
    Buffer.from(sha256(base), 'hex'), Buffer.from(sha256(target), 'hex')];
  let position = 0;
  let literalStart = 0;
  let rolling = target.length >= BLOCK ? hash(target, 0) : 0;
  const literal = end => {
    if (end > literalStart) parts.push(Buffer.from([0]), uint(end - literalStart), target.subarray(literalStart, end));
  };
  while (position + BLOCK <= target.length) {
    const offset = (index.get(rolling) || []).find(candidate =>
      base.subarray(candidate, candidate + BLOCK).equals(target.subarray(position, position + BLOCK)));
    if (offset !== undefined) {
      let length = BLOCK;
      while (offset + length < base.length && position + length < target.length && base[offset + length] === target[position + length]) length++;
      literal(position);
      parts.push(Buffer.from([1]), uint(offset), uint(length));
      position += length;
      literalStart = position;
      if (position + BLOCK <= target.length) rolling = hash(target, position);
    } else {
      if (position + BLOCK < target.length) {
        rolling = (Math.imul((rolling - Math.imul(target[position], power)) >>> 0, 257) + target[position + BLOCK]) >>> 0;
      }
      position++;
    }
  }
  literal(target.length);
  parts.push(Buffer.from([255]));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

// Used at staging/distribution build time, not on a phone. No delta is published without exact reconstruction.
export function restoreApkDelta(base, patch) {
  assert.ok(base.length > 0 && base.length <= MAX && patch.length <= MAX);
  const raw = gunzipSync(patch, { maxOutputLength: MAX + 9_000_077 });
  assert.equal(raw.subarray(0, 8).toString(), 'RDVDLT01');
  const size = raw.readUInt32BE(8);
  assert.ok(size > 0 && size <= MAX);
  assert.equal(raw.subarray(12, 44).toString('hex'), sha256(base));
  const result = Buffer.alloc(size);
  let cursor = 76;
  let written = 0;
  let commands = 0;
  for (;;) {
    const op = raw[cursor++];
    if (op === 255) break;
    assert.ok(++commands <= 1_000_000 && (op === 0 || op === 1));
    const offset = op === 1 ? raw.readUInt32BE(cursor) : 0;
    if (op === 1) cursor += 4;
    const length = raw.readUInt32BE(cursor); cursor += 4;
    assert.ok(length > 0 && length <= size - written);
    if (op === 1) {
      assert.ok(length >= BLOCK && offset <= base.length - length);
      base.copy(result, written, offset, offset + length);
    } else {
      assert.ok(cursor + length <= raw.length);
      raw.copy(result, written, cursor, cursor + length); cursor += length;
    }
    written += length;
  }
  assert.equal(cursor, raw.length);
  assert.equal(written, size);
  assert.equal(sha256(result), raw.subarray(44, 76).toString('hex'));
  return result;
}
