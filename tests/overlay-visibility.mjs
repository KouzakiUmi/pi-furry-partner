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
    hasOverlay: () => initialVisible || active.size > 0,
    showOverlay(bounds) {
      assert.equal(this,tui);
      const handle = { getBounds: () => active.has(handle) ? bounds : undefined, hide: () => active.delete(handle) };
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
  const above = tui.showOverlay({row:2,col:0,width:20,height:4});
  assert.equal(guard.allows({row:20,column:0,width:16,height:2}),true);
  const intersect = tui.showOverlay({row:21,col:3,width:3,height:1});
  assert.equal(guard.allows({row:20,column:0,width:16,height:2}),false,"The extra six-band raster row must participate in occlusion");
  assert.equal(guard.allows({row:20,column:20,width:16,height:2}),true);
  intersect.hide();assert.equal(guard.allows({row:20,column:0,width:16,height:2}),true);
  above.hide();assert.equal(guard.allows({row:0,column:0,width:16,height:2}),true);
  guard.dispose();guard.dispose();assert.equal(tui.showOverlay,original);assert.equal(guard.allows({row:0,column:0,width:1,height:1}),false);
  checks.push("Tracked public overlay bounds suppress only intersecting stripe footprints including their final-band overshoot; hide restores visibility and disposal restores the original method");
}
{
  const { tui, clearInitial }=host(true), guard=createOverlayVisibility(tui);
  assert.equal(guard.allows(),true,"Anchor collection may proceed before final terminal-relative placement is known");
  assert.equal(guard.allows({row:30,column:0,width:16,height:2}),false);
  clearInitial();assert.equal(guard.allows({row:30,column:0,width:16,height:2}),true);
  tui.showOverlay({row:1,col:1,width:3,height:2});assert.equal(guard.allows({row:30,column:0,width:16,height:2}),true);
  guard.dispose();checks.push("Unknown overlays present before installation fail closed until they disappear, then newly tracked nonintersecting overlays allow animation");
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
