import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function legacyRelease(version, changelog, tag = `legacy-v${version}`) {
  assert.match(version, /^2\.4\.(?:0|[1-9]\d*)$/, 'Legacy requires a stable 2.4.x version');
  assert.ok(Number(version.split('.')[2]) >= 2, 'Do not republish historical 2.4.0/2.4.1');
  assert.equal(tag, `legacy-v${version}`, 'Tag must match the Legacy package version');
  const section = changelog.split(/^## /m).find(text => text.startsWith(`${version} · `));
  assert.ok(section, 'Missing release notes for the package version');
  return { version, tag, latest: false, notes: section.slice(section.indexOf('\n') + 1).trim() + '\n' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'pi-furry-partner');
  assert.ok(pkg.pi?.extensions?.includes('./index.ts'));
  assert.ok(!pkg.dsh, 'Legacy must not ship a DSH package');
  for (const name of ['lib/approved-motion.mjs', 'lib/build-profile.mjs', 'lib/dsh-bridge.mjs', 'cordis.patch.yml']) {
    assert.ok(!existsSync(resolve(root, name)), `Cross-line runtime found: ${name}`);
  }
  const tagIndex = process.argv.indexOf('--tag');
  const plan = legacyRelease(pkg.version, readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8'), tagIndex < 0 ? undefined : process.argv[tagIndex + 1]);
  const notesIndex = process.argv.indexOf('--notes-file');
  if (notesIndex >= 0) writeFileSync(resolve(process.argv[notesIndex + 1]), plan.notes);
  console.log(JSON.stringify({ passed: true, version: plan.version, tag: plan.tag, latest: plan.latest }));
}
