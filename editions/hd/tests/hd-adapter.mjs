import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createPiHdActivity, createPiHdMotionPlayer, piHdStaticFrame } from '../lib/hd/pi-adapter.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';

const { catalog, data } = approvedMotionFixture();
let clock = 0;
const activity = createPiHdActivity({ now: () => clock, gapNow: () => clock, random: () => 0 });
const player = createPiHdMotionPlayer({ catalog, now: () => clock, loadIndexed: path => data[path] });
const paint = () => {
  const snapshot = activity.snapshot(), selection = player.sample(snapshot);
  if (selection) player.indexedFrame(selection);
  return { snapshot, selection };
};
activity.start({ wake: false });
assert.equal(activity.handle('turn/start'), false);
assert.equal(activity.snapshot().busy, false, 'DSH transport cannot start a Pi turn');
activity.handle('agent_start');
activity.handle('tool_execution_start', { toolCallId: 'read', toolName: 'read' });
assert.equal(paint().selection.clipId, 'watch');
clock = 1800; paint();
activity.handle('tool_execution_end', { toolCallId: 'read' });
const ended = paint();
clock = 2100;
assert.equal(activity.handle('message_update', { assistantMessageEvent: { type: 'toolcall_delta', partial: { content: [{ type: 'toolCall', id: 'private', name: 'bash', arguments: { command: 'SECRET' } }] } } }), false);
assert.equal(paint().selection.playbackEpoch, ended.selection.playbackEpoch);
assert.equal(activity.snapshot().toolCount, 0);
assert.ok(!JSON.stringify(activity.snapshot()).includes('SECRET'));
clock = 3800; assert.equal(paint().selection.clipId, 'think');
activity.handle('tool_execution_start', { toolCallId: 'work', toolName: 'bash' });
assert.equal(paint().selection.clipId, 'work-enter');
activity.handle('ui_prompt_start');
assert.equal(paint().snapshot.awaitingUser, true);
assert.ok(!['work', 'work-enter', 'work-exit'].includes(paint().selection?.clipId), 'User prompt interrupts keyboard cleanup immediately');
activity.handle('session_shutdown');
assert.equal(activity.snapshot().busy, false);
player.dispose();

const source = { width: 2, height: 1, transparentIndex: 0, palette: [[0,0,0],[255,255,255]], ids: { 'idle-open': 0, watch: 1 }, frames: [{ id: 'idle-open', pixels: [0,1] }, { id: 'watch', pixels: [1,0] }] };
const before = JSON.stringify(source);
const staticPose = piHdStaticFrame(source, 1, { phase: 'reading' });
assert.equal(staticPose.frame.id, 'watch');
assert.deepEqual(staticPose.frame.pixels, [1,0]);
assert.equal(staticPose.sheet.frames.length, 1);
assert.equal(staticPose.nextInMs, Infinity);
assert.equal(JSON.stringify(source), before, 'Fallback preserves the authored pose without deformation');
const root = new URL('../', import.meta.url);
for (const path of ['lib/activity.mjs', 'lib/approved-motion.mjs', 'lib/dsh-bridge.mjs']) assert.equal(existsSync(new URL(path, root)), false, path);
const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
assert.ok(pkg.files.includes('lib/hd/*.mjs'), 'npm installs must include the HD-owned state/player/adapter');
assert.ok(!pkg.files.includes('lib/motion.mjs') && !pkg.files.includes('lib/*.mjs'), 'The former sprite player is not an HD runtime file');
const visited = new Set();
function visit(url) {
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const source = readFileSync(url, 'utf8');
  for (const [, name] of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    const dependency = new URL(name, url);
    assert.ok(!/\/lib\/(?:activity|approved-motion|motion)\.mjs$/.test(dependency.pathname), dependency.href);
    assert.ok(!/legacy|dsh-bridge/.test(name), name);
    if (/\.(?:mjs|ts)$/.test(dependency.pathname)) visit(dependency);
  }
}
visit(new URL('index.ts', root));
console.log('Pi HD adapter: native events, no DSH/Legacy composition, unchanged gap clock, urgent prompt, shutdown, authored static fallback and npm boundary passed.');
