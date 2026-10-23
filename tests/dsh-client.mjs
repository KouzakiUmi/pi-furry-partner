import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEncodedSheet } from "../lib/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let loadedModuleEntry = null;
globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  addEventListener() {},
  removeEventListener() {},
  __ModuleLoader__: {
    load(entry) {
      loadedModuleEntry = entry;
    },
  },
};

const mockReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children };
  },
  useSyncExternalStore(_sub, getSnap) {
    return getSnap();
  },
  useState(init) {
    const val = typeof init === "function" ? init() : init;
    return [val, () => {}];
  },
  useRef(init) {
    return { current: init };
  },
  useEffect() {},
};

await import(pathToFileURL(join(root, "lib/client.js")).href);
assert.ok(loadedModuleEntry, "window.__ModuleLoader__.load was called");
assert.equal(loadedModuleEntry.id, "pi-furry-partner");

const clientPlugin = loadedModuleEntry.factory((mod) => {
  if (mod === "react") return mockReact;
  throw new Error(`Unexpected require: ${mod}`);
});

assert.equal(clientPlugin.name, "pi-furry-partner/client");
assert.deepEqual(clientPlugin.inject, ["slots"]);
assert.equal(typeof clientPlugin.apply, "function");

// Test MascotController with mock fetch serving Host sheet and config
let hostConfig = {
  name: "呜咪",
  subtitle: "你的工作搭档",
  enabled: true,
  heroMark: true,
  composerPill: true,
  animation: true,
  persona: false,
  style: "umi-pixel",
  size: "normal",
  language: "zh-CN",
};

const mockFetch = async (url, init = {}) => {
  const urlStr = String(url);
  if (urlStr.startsWith("/api/furry-partner/sheet")) {
    return new Response(JSON.stringify(loadEncodedSheet("umi-pixel")), { status: 200 });
  }
  if (urlStr.startsWith("/api/furry-partner/config")) {
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      hostConfig = { ...hostConfig, ...body };
    }
    return new Response(JSON.stringify(hostConfig), { status: 200 });
  }
  return new Response("Not Found", { status: 404 });
};

let fakeClock = 5000;
const controller = clientPlugin.createMascotController({
  fetchImpl: mockFetch,
  now: () => fakeClock,
});

// Before ensureSheet resolves, seed sheet provides immediate frame 0 visual!
const initialSnap = controller.getSnapshot();
assert.ok(initialSnap.visual, "Seed sheet provides immediate visual frame on frame 0");
assert.equal(initialSnap.visual.sheet.width, 240, 'The default illustration seed never flashes the unrelated old pixel character');
const offlineSeed = clientPlugin.createMascotController({ fetchImpl: async () => new Response('Unavailable', { status: 404 }), now: () => fakeClock });
offlineSeed.applySettingsLocal({ style: 'umi-pixel' });
assert.equal(offlineSeed.getSnapshot().visual.sheet.width, 240, 'Historical pixel settings use the sole illustration seed offline');
assert.equal(offlineSeed.getSnapshot().settings.style, "umi");
assert.equal(offlineSeed.getSnapshot().visual.sheet.motion?.approvedWholeFrames, true);
offlineSeed.dispose();

await controller.init();
assert.equal(controller.getSnapshot().settings.style, "umi");
assert.equal(controller.getSnapshot().styleLoaded, true);

// Test bindDshRuntime slot registrations, sessions service, and /mascot commandUi
const registeredSlots = new Map();
let registeredCommand = null;
const eventSubscribers = new Set();

const mockCtx = {
  effect(fn) {
    fn();
  },
  slots: {
    inject(_slotName, fn) {
      fn();
    },
    register(spec, renderFn) {
      const key = `${spec.name}:${spec.id || spec.key || "single"}`;
      registeredSlots.set(key, { spec, renderFn });
      return () => registeredSlots.delete(key);
    },
  },
  inject(deps, cb) {
    const scope = {
      effect(fn) {
        fn();
      },
      sessions: {
        list: {
          getSnapshot: () => ({ activeId: "sess-dsh-1" }),
          subscribe: () => () => {},
        },
        binding: () => ({
          eventSource: {
            subscribe(fn) {
              eventSubscribers.add(fn);
              return () => eventSubscribers.delete(fn);
            },
          },
          session: {
            getSnapshot: () => ({ id: "sess-dsh-1", status: "idle" }),
            subscribe: () => () => {},
          },
        }),
      },
      commandUi: {
        register(contrib) {
          registeredCommand = contrib;
          return () => {
            registeredCommand = null;
          };
        },
      },
    };
    cb(scope);
  },
};

const components = clientPlugin.createMascotComponents(mockReact, controller);
clientPlugin.bindDshRuntime(mockCtx, mockReact, controller, components);

assert.ok(registeredSlots.has("shell.overlay:furry-partner-overlay"), "shell.overlay registered");
assert.equal([...registeredSlots.keys()].some(key=>key.startsWith('conversation.input.')),false,'No composer controls or placeholder slots remain');
assert.equal(components.ComposerMascotPill,undefined,'Retired composer component is absent');
assert.ok(registeredSlots.has("settings.section:furry-partner"), "settings.section registered");
assert.ok(registeredSlots.has("plugins.bundle.config:pi-furry-partner"), "plugins.bundle.config registered");
assert.ok(registeredSlots.has("conversation.hero.brand.mark:single"), "conversation.hero.brand.mark registered");
assert.ok(registeredCommand, "/mascot commandUi registered");
assert.equal(registeredCommand.name, "mascot");
assert.equal(registeredCommand.ui.kind, "popupSelect");

// Toggling heroMark off dynamically unregisters conversation.hero.brand.mark
await controller.updateSettings({ heroMark: false });
assert.equal(
  registeredSlots.has("conversation.hero.brand.mark:single"),
  false,
  "Disabling heroMark releases conversation.hero.brand.mark slot"
);
await controller.updateSettings({ heroMark: true });
assert.equal(
  registeredSlots.has("conversation.hero.brand.mark:single"),
  true,
  "Re-enabling heroMark re-registers conversation.hero.brand.mark slot"
);

// Test /mascot commandUi options & onSelect
const options = await registeredCommand.ui.options({}, new AbortController().signal);
assert.ok(options.some((o) => o.id === "poke"));
assert.ok(options.some((o) => o.id === "persona"));
assert.ok(options.some((o) => o.id === "style:umi"));
assert.deepEqual(options.filter((o) => o.id.startsWith("style:")).map((o) => o.id), ["style:umi"]);
assert.ok(options.find((o) => o.id === "style:umi").label.endsWith("插画"));
assert.equal(options.some((o) => o.id === "style:umi-pixel"), false);
assert.ok(options.some((o) => o.id === "zoom-in"));
assert.ok(options.some((o) => o.id === "zoom-out"));

await registeredCommand.ui.onSelect({ id: "persona" }, {});
assert.equal(controller.getSnapshot().settings.persona, true);
assert.equal(hostConfig.persona, true, "Persona toggle synced to Host");

await registeredCommand.ui.onSelect({ id: "zoom-in" }, {});
assert.equal(controller.getSnapshot().settings.scale, 1.15);
assert.equal(hostConfig.scale, 1.15, "Scale synced to Host");
assert.equal(clientPlugin.resolveMascotPixels(controller.getSnapshot().settings), Math.round(196 * 1.15));

await controller.setScale(1.5, { persist: true });
assert.equal(controller.getSnapshot().settings.scale, 1.5);
assert.equal(clientPlugin.resolveMascotPixels(controller.getSnapshot().settings), 294);

await registeredCommand.ui.onSelect({ id: "poke" }, {});
assert.equal(controller.getSnapshot().snapshot.reaction, "poked");

// Test root session event forwarding
fakeClock += 2000;
for (const sub of eventSubscribers) {
  sub({ sessionId: "sess-dsh-1", type: "turn/start", data: {} });
}
assert.equal(controller.getSnapshot().snapshot.phase, "thinking");

for (const sub of eventSubscribers) {
  sub({ sessionId: "sess-dsh-1", type: "turn/end", data: { reason: { kind: "complete" } } });
}
assert.equal(controller.getSnapshot().snapshot.phase, "success");

// Render components to verify VDOM structure without errors
const overlayVdom = components.FloatingMascotOverlay({});
assert.equal(overlayVdom.props.className, "furry-dsh-overlay-root");
const overlayJson = JSON.stringify(overlayVdom);
const petNode = overlayVdom.children.find(node => node?.props?.className?.split(" ").includes("furry-dsh-pet"));
assert.ok(petNode?.props.onPointerCancel, "Pointer cancellation has a local recovery handler");
let pokeCount = 0;
const realPoke = controller.poke;
controller.poke = () => { pokeCount++; };
petNode.props.onPointerDown({ button: 0, pointerId: 7, clientX: 100, clientY: 100, currentTarget: { setPointerCapture() {} } });
petNode.props.onPointerCancel();
petNode.props.onPointerUp({ pointerId: 7 });
assert.equal(pokeCount, 0, "Cancelled drag cannot become a phantom poke or leave the pointer armed");
petNode.props.onPointerDown({ button: 0, pointerId: 8, clientX: 100, clientY: 100, currentTarget: { setPointerCapture() {} } });
petNode.props.onPointerUp({ pointerId: 8 });
assert.equal(pokeCount, 1, "A fresh click works immediately after cancelled drag");
controller.poke = realPoke;
assert.ok(!overlayJson.includes("furry-dsh-emote"), "TUI emote badge ('我在呢') is removed from desktop pet");
assert.ok(!overlayJson.includes("furry-dsh-toolbar"), "Bottom toolbar is moved to right-click context menu");
assert.ok(overlayJson.includes("furry-dsh-resize-handle"), "Corner resize handle is present");

const heroVdom = components.HeroMascotMark({ size: 34 });
assert.match(heroVdom.props.className, /furry-dsh-hero-mark/);
const settingsVdom = components.MascotSettingsPage();
assert.equal(settingsVdom.props.className, "furry-dsh-settings");
assert.ok(!JSON.stringify(settingsVdom).includes('composerPill'),'No dead composer setting remains');


// Modern DSH observable runtime: callbacks invalidate snapshots rather than carrying events.
{
  const observable = value => {
    const listeners = new Set();
    return { getSnapshot: () => value,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      set(next) { value = next; for (const fn of listeners) fn(); },
      count: () => listeners.size };
  };
  const modern = clientPlugin.createMascotController({ fetchImpl: mockFetch, now: () => fakeClock });
  const lifecycle = [];
  const session = observable({ sessionId: 'modern', running: false });
  const events = observable({ revision: 0, entries: [], change: { kind: 'replace', entries: [] } });
  const list = observable({ byId: { modern: { id: 'modern', retainedBy: { mainView: 1 } } } });
  const binding = { session, eventSource: events };
  const effect = fn => { const off = fn(); if (typeof off === 'function') lifecycle.push(off); };
  const ctx = { effect, slots: { register: () => () => {}, inject() {} },
    inject(deps, cb) { if (deps.length === 1 && deps[0] === 'sessions')
      cb({ sessions: { list, binding: () => binding }, effect }); } };
  clientPlugin.bindDshRuntime(ctx, mockReact, modern, clientPlugin.createMascotComponents(mockReact, modern));
  session.set({ sessionId: 'modern', running: true });
  assert.equal(modern.getSnapshot().snapshot.phase, 'thinking');
  let seq = 0;
  const emit = (type, data) => {
    const entry = { type: 'event', event: { type, data, seq: ++seq } };
    events.set({ revision: seq, entries: [...events.getSnapshot().entries, entry],
      change: { kind: 'append', entries: [entry] } });
  };
  emit('tool/call', { callId: 'read', name: 'read_file', arguments: '{"path":"README.md"}' });
  assert.equal(modern.getSnapshot().snapshot.phase, 'reading', 'Compiled client follows snapshot event windows');
  emit('tool/result', { message: { toolCallId: 'read' } });
  emit('tool/call', { callId: 'exec', name: 'run_command', arguments: '{}' });
  assert.equal(modern.getSnapshot().snapshot.phase, 'running');
  emit('turn/end', { reason: { kind: 'completed' } });
  assert.equal(modern.getSnapshot().snapshot.phase, 'success');
  lifecycle.reverse().forEach(off => off());
  assert.equal(events.count(), 0);
  assert.equal(session.count(), 0);
  assert.equal(list.count(), 0);
  modern.dispose();
}

controller.dispose();
