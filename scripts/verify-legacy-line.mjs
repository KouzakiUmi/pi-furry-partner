import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function legacyRelease(version, changelog, tag = `v${version}`) {
  assert.match(version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/, 'Pi requires a stable version');
  const [major, minor, patch] = version.split('.').map(Number);
  assert.ok(major > 2 || (major === 2 && (minor > 5 || (minor === 5 && patch >= 1))), 'Do not republish historical Pi versions');
  assert.equal(tag, `v${version}`, 'Tag must match the Legacy package version');
  const section = changelog.split(/^## /m).find(text => text.startsWith(`${version} · `));
  assert.ok(section, 'Missing release notes for the package version');
  return { version, tag, latest: true, notes: section.slice(section.indexOf('\n') + 1).trim() + '\n' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'pi-furry-partner');
  assert.ok(pkg.pi?.extensions?.includes('./index.ts'));
  assert.ok(!pkg.dsh, 'Legacy must not ship a DSH package');
  for (const name of ['Hi-Res', 'assets/animated', 'lib/approved-motion.mjs', 'lib/build-profile.mjs', 'lib/dsh-bridge.mjs', 'cordis.patch.yml']) {
    assert.ok(!existsSync(resolve(root, name)), `Cross-line runtime found: ${name}`);
  }
  const tagIndex = process.argv.indexOf('--tag');
  const plan = legacyRelease(pkg.version, readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), tagIndex < 0 ? undefined : process.argv[tagIndex + 1]);
  const notesIndex = process.argv.indexOf('--notes-file');
  if (notesIndex >= 0) writeFileSync(resolve(process.argv[notesIndex + 1]), plan.notes);
  console.log(JSON.stringify({ passed: true, version: plan.version, tag: plan.tag, latest: plan.latest }));
}
