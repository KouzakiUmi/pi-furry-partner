import assert from 'node:assert/strict';
import { legacyRelease } from '../scripts/verify-legacy-line.mjs';
const changelog = '# Changes\n\n## 2.4.3 · 2026-10-25\n\nLegacy release.\n\n## 2.4.2 · older\n\nOld notes.\n';
assert.deepEqual(legacyRelease('2.4.3', changelog), { version: '2.4.3', tag: 'legacy-v2.4.3', latest: false, notes: 'Legacy release.\n' });
for (const tag of ['v2.4.3', 'legacy-v2.4.2', 'legacy-v2.5.0']) assert.throws(() => legacyRelease('2.4.3', changelog, tag));
for (const version of ['2.4.0', '2.4.1', '2.5.0', '2.4.3-preview.1', '2.4.03']) assert.throws(() => legacyRelease(version, changelog));
assert.throws(() => legacyRelease('2.4.4', changelog));
console.log('Legacy release isolation: exact version/tag/notes, stable 2.4.x only, no historical republish, and latest=false passed.');
