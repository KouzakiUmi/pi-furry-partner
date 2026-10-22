import assert from 'node:assert/strict';
import { createDesktopCompanion } from '../lib/dsh-companion.mjs';

let time = 0;
const make = () => createDesktopCompanion({ now: () => time, random: () => 0 });
let pet = make();
assert.equal(pet.tick(), null);
time = 45000;
assert.equal(pet.tick().kind, 'hello');
assert.equal(pet.tick({ busy: true, phase: 'running' }), null, 'work immediately interrupts autonomous greeting');
time += 100000;
assert.equal(pet.tick({ phase: 'waiting' }), null, 'no unsolicited actions during questions');
assert.equal(pet.tick({ reaction: 'listening' }), null, 'typing/listening takes precedence');
assert.equal(pet.tick({ phase: 'idle' }), null, 'no queued greeting immediately after work');
time += 21000;
assert.equal(pet.tick().kind, 'stretch');
assert.equal(pet.tick({ mode: 'off' }), null);

for (const option of [{visible:false}, {enabled:false}, {minimized:true}, {animation:false}, {demo:true}]) {
  pet = make(); time += 45001;
  assert.equal(pet.tick(option), null, JSON.stringify(option));
}

pet = make();
let triggered = false;
for (let i=0;i<8;i++) triggered = pet.stroke(i % 2 ? 30 : 0, {busy:true}) || triggered;
assert.equal(triggered, true, 'repeated head strokes trigger a pat');
assert.equal(pet.tick({busy:true,phase:'running'}).busy, true);
assert.match(pet.tick({busy:true,phase:'running'}).lines[1], /eye|done/);
time += 5300;
assert.equal(pet.tick({busy:true}), null);
assert.equal(pet.stroke(30), false, 'stroke cooldown');
pet.leave();
time += 9000;
assert.equal(pet.stroke(0), false);
assert.equal(pet.stroke(30,{allowed:false}), false);
assert.equal(pet.returned({awayMs:30000}), false);
assert.equal(pet.returned({awayMs:60001}), true);
assert.equal(pet.tick().kind, 'return');
pet.interrupt();
assert.equal(pet.returned({awayMs:60001}), false, 'focus churn cannot spam welcome-backs');
time += 301000;
assert.equal(pet.returned({awayMs:60001,allowed:false}), false);

pet = make(); time += 31*60000;
assert.equal(pet.tick().kind, 'rest');
console.log('DSH companion: idle scheduling, interruption, strokes, return cooldown and pause rules passed.');

time=0;const filmedPet=createDesktopCompanion({now:()=>time,random:()=>0,gestureDurations:()=>({wave:6583})});
time=45001;const hello=filmedPet.tick();assert.equal(hello.until-hello.startedAt,6583);
time+=6500;assert.equal(filmedPet.tick().kind,'hello');time+=83;assert.equal(filmedPet.tick(),null);
