import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
assert.ok(pkg.files && !pkg.files.some(path => path.startsWith('editions')));
for (const path of ['index.ts','lib/activity.mjs','lib/mascot-autocomplete.mjs']) {
  assert.ok(!/editions\/hd|hd\/pi-adapter/.test(readFileSync(new URL(path, root), 'utf8')));
}
if (existsSync(new URL('editions/hd/package.json', root))) {
  const hd = new URL('editions/hd/', root);
  const config = JSON.parse(readFileSync(new URL('build/editions.json', hd)));
  assert.equal(config.releaseLine, 'hd');
  assert.equal(config.platforms.pi.artifactPrefix, 'pi-furry-partner-hd');
  assert.ok(existsSync(new URL('lib/hd/pi-adapter.mjs', hd)));
  assert.ok(!readFileSync(new URL('index.ts', hd), 'utf8').includes('../../lib/'));
}
console.log('Unified repository: isolated original/HD entries, package roots and release configuration passed.');
