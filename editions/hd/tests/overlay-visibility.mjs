import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOverlayVisibility } from "../lib/overlay-visibility.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [], sharedPrototypeResults = [];
function host(initial = false) {
  const active = new Set(); let initialVisible = initial;
  const tui = {
    hasOverlay: () => initialVisible || [...active].some((handle) => !handle.hidden),
    showOverlay(bounds) {
      assert.equal(this,tui);
      const handle = {
        hidden: false,
        getBounds: () => active.has(handle) && !handle.hidden ? bounds : undefined,
        hide: () => active.delete(handle),
        setHidden: (hidden) => { handle.hidden = hidden; },
        isHidden: () => handle.hidden,
      };
      active.add(handle); return handle;
    },
  };
  return { tui, clearInitial: () => { initialVisible = false; } };
}

function sharedHosts() {
  const owner = {};
  Object.defineProperty(owner, "showOverlay", {
    configurable: true, enumerable: false, writable: true,
    value: function (bounds) {
      this.calls++;
      const handle = { getBounds: () => this.active.has(handle) ? bounds : undefined, hide: () => this.active.delete(handle) };
      this.active.add(handle); return handle;
    },
  });
  const makeHost = (id) => Object.assign(Object.create(owner), {
    terminal: Object.freeze({ id }), active: new Set(), calls: 0,
    hasOverlay() { return this.active.size > 0; },
  });
  return { owner, descriptor: Object.getOwnPropertyDescriptor(owner, "showOverlay"), hosts: [makeHost("A"), makeHost("B")] };
}

{
  const { tui } = host(), original = tui.showOverlay;
  const guard = createOverlayVisibility(tui); assert.notEqual(tui.showOverlay,original);
  const initialVersion = guard.version(); assert.equal(guard.version(), initialVersion);
  const above = tui.showOverlay({row:2,col:0,width:20,height:4});
  assert.ok(guard.version() > initialVersion, "Showing an overlay changes the Kitty retransmission key");
  assert.equal(guard.allows({row:20,column:0,width:16,height:2}),true);
  const intersect = tui.showOverlay({row:21,col:3,width:3,height:1});
  assert.equal(guard.allows({row:20,column:0,width:16,height:2}),false,"The extra six-band raster row must participate in occlusion");
  assert.equal(guard.allows({row:20,column:20,width:16,height:2}),true);
  intersect.hide();assert.equal(guard.allows({row:20,column:0,width:16,height:2}),true);
  const activeVersion = guard.version();
  above.hide();assert.equal(guard.allows({row:0,column:0,width:16,height:2}),true);
  assert.ok(guard.version() > activeVersion, "Hiding the final overlay changes the Kitty retransmission key");
  guard.dispose();guard.dispose();assert.equal(tui.showOverlay,original);assert.equal(guard.allows({row:0,column:0,width:1,height:1}),false);
  checks.push("Tracked public overlay bounds suppress only intersecting stripe footprints including their final-band overshoot; overlay transitions advance a stable Kitty retransmission key, hide restores visibility and disposal restores the original method");
}
{
  const { tui } = host(), guard = createOverlayVisibility(tui);
  const overlay = tui.showOverlay({ row: 20, col: 0, width: 12, height: 2 });
  const rect = { row: 20, column: 0, width: 12, height: 2 };
  assert.equal(guard.allows(rect), false);
  const hiddenVersion = guard.version();
  overlay.setHidden(true);
  assert.equal(guard.allows(rect), true, "A temporarily hidden overlay must not discard the handle or block the dock");
  overlay.setHidden(false);
  assert.ok(guard.version() > hiddenVersion, "Re-showing the same handle must invalidate image transport caches");
  assert.equal(guard.allows(rect), false, "The re-shown overlay must regain its occlusion bounds");
  overlay.hide(); assert.equal(guard.allows(rect), true);
  guard.dispose();
  checks.push("HD keeps a temporarily hidden overlay's public handle across setHidden(false), invalidates Kitty/Sixel caches on re-show and restores row masking");
}
{
  const active = new Set();
  const prior = { present: true, hidden: false };
  const tui = {
    hasOverlay: () => (prior.present && !prior.hidden) || [...active].some((handle) => !handle.hidden),
    showOverlay(bounds) {
      const handle = {
        hidden: false,
        getBounds: () => active.has(handle) && !handle.hidden ? bounds : undefined,
        hide: () => active.delete(handle),
        setHidden: (hidden) => { handle.hidden = hidden; },
        isHidden: () => handle.hidden,
      };
      active.add(handle);
      return handle;
    },
  };
  const guard = createOverlayVisibility(tui);
  const rect = { row: 30, column: 0, width: 16, height: 2 };
  assert.equal(guard.allows(rect), false, "An overlay that predates the guard fail-closes");
  const tracked = tui.showOverlay({ row: 1, col: 40, width: 4, height: 1 });
  assert.equal(guard.allows(rect), false, "A tracked disjoint overlay does not reveal the untracked one");
  prior.hidden = true;
  tracked.setHidden(true);
  assert.equal(tui.hasOverlay(), false);
  assert.equal(guard.allows(rect), true, "A fully hidden screen can show the dock");
  guard.version();
  prior.hidden = false;
  tracked.setHidden(false);
  assert.equal(guard.allows(rect), false, "Re-showing an untracked overlay beside a retained handle must still fail closed");
  prior.hidden = true;
  tracked.setHidden(true);
  guard.version();
  const duringHide = tui.showOverlay({ row: 2, col: 2, width: 2, height: 1 });
  prior.hidden = false;
  tracked.setHidden(false);
  assert.equal(guard.allows(rect), false, "showOverlay during the hide must not forget the untracked overlay");
  duringHide.hide();
  tracked.hide();
  prior.present = false;
  const later = tui.showOverlay({ row: 1, col: 40, width: 4, height: 1 });
  assert.equal(guard.allows(rect), false, "Removing the tracked handles is not proof the untracked overlay cannot return");
  later.hide();
  guard.dispose();
  checks.push("Temporary hiding keeps fail-closed uncertainty for an untracked overlay that returns with a retained disjoint handle");
}
{
  const { tui, clearInitial }=host(true), guard=createOverlayVisibility(tui);
  assert.equal(guard.allows(),true,"Anchor collection may proceed before final terminal-relative placement is known");
  assert.equal(guard.allows({row:30,column:0,width:16,height:2}),false);
  clearInitial();assert.equal(guard.allows({row:30,column:0,width:16,height:2}),true);
  tui.showOverlay({row:1,col:1,width:3,height:2});assert.equal(guard.allows({row:30,column:0,width:16,height:2}),false,"A pre-existing overlay can return without showOverlay, so later overlays stay fail-closed");
  guard.dispose();checks.push("Unknown overlays present before installation stay fail-closed after they leave the screen, because that is not proof they cannot return");
}
{
  let active=true;const tui={hasOverlay:()=>active};const guard=createOverlayVisibility(tui);
  assert.equal(guard.allows({row:20,column:0,width:16,height:2}),false);
  active=false;assert.equal(guard.allows({row:20,column:0,width:16,height:2}),true);guard.dispose();
  checks.push("Hosts without public overlay handles keep the conservative hide-during-overlay fallback");
}
{
  const { tui }=host(), guard=createOverlayVisibility(tui);
  for(let i=0;i<65;i++)tui.showOverlay({row:0,col:0,width:1,height:1});
  assert.equal(guard.allows({row:30,column:0,width:16,height:2}),false,"Overflowing the bounded 64-handle observer must fail closed");
  const foreign=function(){};tui.showOverlay=foreign;guard.dispose();assert.equal(tui.showOverlay,foreign);
  checks.push("The observer bounds tracking at 64 handles and preserves a foreign extension's later showOverlay takeover during disposal");
}

function scriptedHost(priorPresent = false) {
  const overlays = [];
  const prior = { present: priorPresent, hidden: false, visible: true, bounds: { row: 4, col: 1, width: 5, height: 2 } };
  const shown = (entry) => !entry.removed && !entry.hidden && entry.visible;
  const tui = {
    hasOverlay() { return (prior.present && !prior.hidden && prior.visible) || overlays.some(shown); },
    showOverlay(bounds) {
      const entry = { bounds: { row: bounds.row, col: bounds.col, width: bounds.width, height: bounds.height }, hidden: false, removed: false, visible: true };
      const handle = {
        isHidden: () => entry.hidden,
        getBounds: () => shown(entry) ? entry.bounds : undefined,
        setHidden(hidden) { entry.hidden = Boolean(hidden); },
        setVisible(visible) { entry.visible = Boolean(visible); },
        hide() { entry.removed = true; },
      };
      entry.handle = handle;
      overlays.push(entry);
      return handle;
    },
  };
  const visibleBounds = () => {
    const bounds = [];
    if (prior.present && !prior.hidden && prior.visible) bounds.push(prior.bounds);
    for (const entry of overlays) if (shown(entry)) bounds.push(entry.bounds);
    return bounds;
  };
  return { tui, prior, overlays, visibleBounds };
}
const rectOf = (bounds) => ({ row: bounds.row, column: bounds.col, width: bounds.width, height: bounds.height });
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

{
  const host = scriptedHost(false), guard = createOverlayVisibility(host.tui);
  const tracked = host.tui.showOverlay({ row: 10, col: 0, width: 8, height: 2 });
  tracked.setHidden(true);
  const created = host.tui.showOverlay({ row: 0, col: 20, width: 4, height: 1 });
  tracked.setHidden(false);
  assert.equal(guard.allows({ row: 10, column: 0, width: 8, height: 2 }), false, "A handle hidden across showOverlay must still occlude when shown again");
  assert.equal(guard.allows(rectOf(created.getBounds())), false);
  assert.equal(guard.allows({ row: 30, column: 0, width: 2, height: 1 }), true, "A rect disjoint from every visible overlay stays available");
  guard.dispose();
  checks.push("showOverlay during a temporary hide keeps the hidden handle, so the re-shown overlay still blocks its own rect");
}
{
  const host = scriptedHost(true), guard = createOverlayVisibility(host.tui);
  const tracked = host.tui.showOverlay({ row: 12, col: 8, width: 4, height: 1 });
  const rect = rectOf(host.prior.bounds);
  tracked.setHidden(true);
  host.prior.hidden = true;
  assert.equal(host.tui.hasOverlay(), false);
  guard.allows(rect);
  guard.version();
  const created = host.tui.showOverlay({ row: 0, col: 20, width: 3, height: 1 });
  created.hide();
  guard.version();
  guard.allows(rect);
  host.prior.hidden = false;
  assert.equal(guard.allows(rect), false, "Creating and removing an overlay during the hide must not reveal the untracked one");
  guard.dispose();
  checks.push("An untracked overlay hidden beside a retained handle stays fail-closed after a newer overlay is created and removed");
}
{
  const host = scriptedHost(false), guard = createOverlayVisibility(host.tui);
  const gated = host.tui.showOverlay({ row: 8, col: 2, width: 6, height: 2 });
  gated.setVisible(false);
  assert.equal(host.tui.hasOverlay(), false);
  host.tui.showOverlay({ row: 0, col: 30, width: 3, height: 1 });
  gated.setVisible(true);
  assert.equal(guard.allows({ row: 8, column: 2, width: 6, height: 2 }), false, "Pi's visible() option must keep the handle when another overlay is shown");
  guard.dispose();
  checks.push("A size-gated overlay is not retired by showOverlay and occludes again when visible() allows it");
}
{
  const host = scriptedHost(false), guard = createOverlayVisibility(host.tui);
  host.tui.showOverlay({ row: 3, col: 3, width: 4, height: 2 }).hide();
  host.tui.showOverlay({ row: 12, col: 0, width: 4, height: 1 });
  assert.equal(guard.allows({ row: 3, column: 3, width: 4, height: 2 }), true, "hide() is proof the overlay cannot return, so that rect can show an image");
  guard.dispose();
  checks.push("hide() drops the handle; a later disjoint overlay does not stay fail-closed for the removed rect");
}
{
  const host = scriptedHost(false), guard = createOverlayVisibility(host.tui);
  const oldRect = { row: 2, column: 2, width: 4, height: 2 };
  host.tui.showOverlay({ row: 2, col: 2, width: 4, height: 2 });
  host.overlays[0].removed = true;
  host.tui.showOverlay({ row: 14, col: 0, width: 3, height: 1 });
  assert.equal(guard.allows(oldRect), true, "Leaving the stack without hide() must not suppress unrelated images");
  host.overlays[0].removed = false;
  assert.equal(guard.allows(oldRect), false, "The same handle still occludes if that overlay becomes visible again");
  guard.dispose();
  checks.push("An overlay removed outside handle.hide() does not poison later images, and the retained handle still occludes if it returns");
}
{
  let steps = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const random = mulberry32(seed);
    const host = scriptedHost(random() < .5);
    const guard = createOverlayVisibility(host.tui);
    let disposed = false;
    for (let step = 0; step < 40 && !disposed; step++) {
      const roll = random();
      const live = host.overlays.filter((entry) => !entry.removed);
      if (roll < .25) host.tui.showOverlay({ row: Math.floor(random() * 20), col: Math.floor(random() * 40), width: 1 + Math.floor(random() * 8), height: 1 + Math.floor(random() * 4) });
      else if (roll < .45 && live.length) live[Math.floor(random() * live.length)].handle.setHidden(random() < .5);
      else if (roll < .6 && live.length) live[Math.floor(random() * live.length)].handle.hide();
      else if (roll < .75 && live.length) live[Math.floor(random() * live.length)].handle.setVisible(random() < .5);
      else if (roll < .85 && host.prior.present) host.prior.hidden = !host.prior.hidden;
      else if (roll < .93 && host.prior.present) host.prior.visible = !host.prior.visible;
      else if (roll < .97 && host.prior.present) host.prior.present = false;
      else if (roll >= .97) { guard.dispose(); disposed = true; }
      guard.version();
      for (const bounds of host.visibleBounds()) {
        assert.equal(guard.allows(rectOf(bounds)), false, `seed ${seed} step ${step} drew over a visible overlay`);
      }
      steps++;
    }
    if (!disposed) guard.dispose();
  }
  checks.push(`Random hide/show/showOverlay/remove/dispose sequences stayed fail-closed for every visible overlay over ${steps} steps`);
}

for (const firstIndex of [0, 1]) {
  const { owner, descriptor, hosts: [a, b] } = sharedHosts(), hosts = [a, b];
  const rect = { row: 20, column: 0, width: 16, height: 2 };
  const guards = [createOverlayVisibility(a)];
  const installed = Object.getOwnPropertyDescriptor(owner, "showOverlay").value;
  guards.push(createOverlayVisibility(b));
  assert.equal(Object.getOwnPropertyDescriptor(owner, "showOverlay").value, installed, "Observers sharing a public prototype must use one router instead of nesting wrappers");
  const aboveA = a.showOverlay({ row: 1, col: 0, width: 12, height: 2 });
  const crossingB = b.showOverlay({ row: 20, col: 0, width: 12, height: 2 });
  assert.equal(guards[0].allows(rect), true, "Terminal B's crossing overlay cannot enter terminal A's handle collection");
  assert.equal(guards[1].allows(rect), false);
  assert.equal(a.calls, 1); assert.equal(b.calls, 1, "The shared router invokes each native method exactly once");
  crossingB.hide();
  const aboveB = b.showOverlay({ row: 1, col: 0, width: 12, height: 2 });
  assert.equal(guards[1].allows(rect), true);
  const survivorIndex = 1 - firstIndex, survivor = hosts[survivorIndex], survivorGuard = guards[survivorIndex];
  guards[firstIndex].dispose(); guards[firstIndex].dispose();
  assert.equal(guards[firstIndex].allows(rect), false);
  assert.equal(Object.getOwnPropertyDescriptor(owner, "showOverlay").value, installed, "The remaining observer keeps the exact same router alive");
  const afterDispose = survivor.showOverlay({ row: 21, col: 2, width: 2, height: 1 });
  assert.equal(survivorGuard.allows(rect), false, "Disposing either observer first cannot stop the surviving observer from tracking new handles");
  afterDispose.hide(); assert.equal(survivorGuard.allows(rect), true);
  const foreignTerminal = hosts[firstIndex].showOverlay({ row: 20, col: 0, width: 16, height: 2 });
  assert.equal(survivorGuard.allows(rect), true, "A disposed terminal's later overlays cannot affect the surviving terminal");
  foreignTerminal.hide();
  survivorGuard.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(owner, "showOverlay"), descriptor, "The final observer restores the exact original value and descriptor flags in either disposal order");
  aboveA.hide(); aboveB.hide();
  const fresh = createOverlayVisibility(a), visible = a.showOverlay({ row: 1, col: 0, width: 2, height: 1 });
  assert.equal(fresh.allows(rect), true, "A later installation must not reuse an inert router after all previous observers were removed");
  visible.hide(); fresh.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(owner, "showOverlay"), descriptor);
  sharedPrototypeResults.push({ disposeOrder: firstIndex ? ["B", "A"] : ["A", "B"], oneSharedRouter: true,
    noCrossTerminalCapture: true, survivorTracksNewHandles: true, exactDescriptorRestored: true, cleanReinstall: true });
}
checks.push("Two terminals sharing one public prototype use one router, isolate their overlay handles and restore the exact descriptor after A/B or B/A disposal; the remaining observer and later reinstall both work");

{
  const { owner, descriptor, hosts: [a, b] } = sharedHosts();
  const guardA = createOverlayVisibility(a), guardB = createOverlayVisibility(b);
  const foreign = function () { return "foreign extension"; };
  const foreignDescriptor = { ...descriptor, value: foreign, writable: false };
  Object.defineProperty(owner, "showOverlay", foreignDescriptor);
  guardA.dispose(); guardB.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(owner, "showOverlay"), foreignDescriptor, "Shared-router cleanup must preserve another extension's later prototype takeover and descriptor flags");
  assert.equal(a.showOverlay(), "foreign extension");
  checks.push("Disposing all shared-prototype observers preserves a foreign extension's later prototype method and descriptor attributes");
}
const report={testedAt:new Date().toISOString(),modelRequests:0,passed:true,verification:"Product overlay visibility controller using public handle/getBounds semantics, shared prototype ownership and two independent terminal receivers, without native-window automation",checks,sharedPrototypeResults};
await writeFile(join(root,"tests/overlay-visibility-validation.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
