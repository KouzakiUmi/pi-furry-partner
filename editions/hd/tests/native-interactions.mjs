import assert from 'node:assert/strict';
import { createActivity } from '../lib/hd/activity.mjs';
import { createApprovedMotionPlayer } from '../lib/hd/player.mjs';
import { approvedMotionFixture } from './approved-motion-fixture.mjs';
import { addNativeInteractionClips } from './native-interaction-fixture.mjs';
const { catalog, data } = approvedMotionFixture(); await addNativeInteractionClips(catalog, data);
function setup() {
  let time = 0;
  const activity = createActivity({ now: () => time, gapNow: () => time, random: () => 0,
    interactionClips: () => catalog.clips });
  const player = createApprovedMotionPlayer({ catalog, now: () => time, minimumActionMs: 1200,
    loadIndexed: path => data[path], onInteractionPresented: epoch => activity.markInteractionPresented(epoch) });
  const at = n => { time = n; return activity.snapshot(); };
  const paint = n => { const s = at(n), selected = player.sample(s, { time, animate: true }); const frame = player.indexedFrame(selected, 'umi'); return { s, selected, frame }; };
  return { activity, player, at, paint };
}
{
  const { activity, player, at, paint } = setup(); activity.start({ wake: true });
  assert.equal(at(0).interaction.id, 'wave'); assert.notEqual(at(0).bubble, 'z · z');
  assert.equal(at(1000).interaction.elapsedMs, 0, 'Cold source has not silently advanced before presentation');
  let v = paint(1000); assert.equal(v.selected.clipId, 'wave'); assert.equal(v.selected.frame.sourceFrame, 0); assert.equal(v.selected.loop, false);
  v = paint(1000 + 4417); assert.equal(v.selected.clipId, 'wave'); assert.equal(v.selected.frame.sourceFrame, 106);
  assert.equal(at(5457).interaction.remainingMs, 1); assert.equal(at(5458).interaction, null); assert.equal(at(5458).phase, 'idle'); player.dispose();
}
{
  const { activity, player, at, paint } = setup(); activity.start({ wake: true });
  assert.equal(at(1200).interaction, null); assert.equal(at(1200).phase, 'idle');
  assert.equal(paint(2000).selected?.clipId.startsWith('idle'), true, 'Expired cold welcome cannot revive when frames arrive'); player.dispose();
}
{
  const { activity, player, paint, at } = setup(); activity.start({ wake: false }); let last;
  for (let i = 0; i < 4; i++) {
    const t = i * 5000; at(t); assert.equal(activity.poke(), true);
    // Stage one: the authored poke pose owns the first beat, no clip yet.
    let s = at(t); assert.equal(s.interaction, null); assert.equal(s.reaction, 'poked'); assert.equal(s.face, 'poke');
    assert.equal(paint(t).selected, null, 'The pose beat holds the authored cel instead of a clip');
    assert.equal(activity.isPoked(), true);
    // Stage two: one short situational segment, never the whole authored period.
    s = at(t + 1200); const id = s.interaction.id;
    assert.notEqual(id, last); last = id; assert.equal(s.pokeContext, 'idle'); assert.equal(s.phase, 'idle');
    const originalEpoch = s.interaction.epoch; activity.poke(); assert.equal(at(t + 1400).interaction.epoch, originalEpoch, 'Repeated clicks never reset or queue a response');
    let v = paint(t + 1200); assert.equal(v.selected.clipId, id); assert.equal(v.selected.loop, false);
    v = paint(t + 2350); assert.ok(v.selected.frame.sourceFrame > 0, 'The situational segment advances inside the clip');
    assert.equal(at(t + 2400).interaction, null); assert.equal(activity.isPoked(), false);
  }
  at(25000); activity.handle('agent_start'); activity.handle('tool_execution_start', { toolCallId: 'read', toolName: 'read' }); activity.poke(); let s = at(25000);
  assert.equal(s.interaction, null); assert.equal(s.reaction, 'poked'); assert.equal(s.pokeContext, 'busy');
  s = at(25000 + 1200); assert.ok(['head-shake', 'ear-flick'].includes(s.interaction.id)); assert.equal(s.phase, 'reading'); assert.equal(s.toolCount, 1);
  activity.handle('ui_prompt_start'); assert.equal(at(25000 + 1200).interaction, null); activity.poke(); s = at(25000 + 1200);
  assert.equal(s.interaction, null); assert.equal(s.reaction, 'poked');
  s = at(25000 + 2400); assert.equal(s.pokeContext, 'waiting'); assert.ok(['head-shake', 'ear-flick'].includes(s.interaction.id)); assert.equal(s.awaitingUser, true); player.dispose();
}
for (const [type, event] of [
  ['agent_start', {}], ['message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'answer' } }],
  ['ui_prompt_start', {}], ['session_before_compact', {}], ['session_shutdown', {}],
  ['agent_before_settle', { outcome: 'completed' }], ['agent_settled', { aborted: true }],
]) {
  const { activity, player, at, paint } = setup(); activity.start({ wake: false }); activity.poke(); paint(0); activity.handle(type, event);
  assert.equal(at(10).interaction, null, `${type} immediately owns the display`); assert.equal(activity.isPoked(), false, `${type} ends the poke pose stage`);
  assert.equal(at(10000).interaction, null, `${type} cannot resurrect a cancelled local event`); player.dispose();
}
{
  const { activity, player, paint, at } = setup(); activity.start({ isBusy: true, wake: false }); activity.handle('tool_execution_start', { toolCallId: 'bash', toolName: 'bash' }); activity.poke(); paint(0);
  activity.handle('tool_execution_end', { toolCallId: 'bash', isError: true }); assert.equal(at(10).interaction, null); assert.equal(at(10).reaction, 'error'); player.dispose();
}
{
  const { activity, player, paint, at } = setup(); activity.start({ wake: true }); paint(0);
  assert.equal(activity.noteTyping(), true); assert.equal(at(20).interaction, null); assert.equal(at(20).reaction, 'listening'); player.dispose();
}
{
  // A real tool run owns the display during either poke stage.
  const { activity, player, at } = setup(); activity.start({ wake: false });
  at(0); activity.poke(); assert.equal(at(0).reaction, 'poked');
  activity.handle('tool_execution_start', { toolCallId: 'read', toolName: 'read' });
  assert.equal(at(10).reaction, undefined, 'A tool run ends the pose stage'); assert.equal(activity.isPoked(), false);
  at(2000); activity.poke(); at(3200);
  assert.ok(at(4400).interaction, 'The situational segment starts after presentation');
  activity.handle('tool_execution_start', { toolCallId: 'bash', toolName: 'bash' });
  assert.equal(at(4410).interaction, null, 'A tool run ends the situational segment'); assert.equal(activity.isPoked(), false); player.dispose();
}
{
  // The pose stage counts from its first actual sample, not from the click.
  const { activity, player, at } = setup(); activity.start({ wake: false });
  at(0); activity.poke();
  assert.equal(at(5000).reaction, 'poked', 'An unpresented pose does not expire');
  assert.equal(at(5000).interaction, null);
  assert.equal(at(6199).interaction, null, 'The segment waits for a full pose beat');
  assert.ok(at(6200).interaction, 'The segment starts 1200ms after first presentation'); player.dispose();
}
console.log('Native welcome/poke: accepted 107-frame4458ms sources, first-visible clock, finite cold wait, two-stage poke pose then one short situational segment, context diversity/no backlog, truthful task state and priority interrupts passed.');
