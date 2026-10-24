import assert from 'node:assert/strict';
import { legacyRelease } from '../scripts/verify-legacy-line.mjs';
const changelog = '# Changes\n\n## 2.5.1 · 2026-10-25\n\nPi original-resource release.\n';
assert.deepEqual(legacyRelease('2.5.1', changelog), { version: '2.5.1', tag: 'v2.5.1', latest: true, notes: 'Pi original-resource release.\n' });
for (const tag of ['legacy-v2.5.1', 'v2.5.0', 'v2.5.2']) assert.throws(() => legacyRelease('2.5.1', changelog, tag));
for (const version of ['2.4.3', '2.5.0', '2.5.1-preview.1', '2.5.01']) assert.throws(() => legacyRelease(version, changelog));
assert.throws(() => legacyRelease('2.5.2', changelog));
console.log('Pi release: stable version, exact tag and notes, historical version guard and latest=true passed.');
