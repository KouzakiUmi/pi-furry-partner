import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apply,
  CONFIG_PATH,
  TITLE_IMAGE_PATH,
  GESTURE_PATH,
  loadHiResFrame,
  formatDshPersonaPrompt,
  HIRES_FRAME_PATH,
  HIRES_MANIFEST_PATH,
  inject,
  loadEncodedSheet,
  name,
  SHEET_PATH,
  sanitizeDshSettings,
} from "../lib/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "work");

// 1. Validate package.json and cordis.patch.yml DSH contracts
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const patchYml = await readFile(join(root, "cordis.patch.yml"), "utf8");
assert.equal(name, "pi-furry-partner");
assert.deepEqual(inject, ["systemPrompt"]);
assert.equal(pkg.main, "./lib/index.js");
assert.equal(pkg.exports["."], "./lib/index.js");
assert.equal(pkg.exports["./client"], "./lib/client.js");
assert.equal(pkg.dsh.manifestVersion, 1);
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.equal(pkg.dsh.client.platform, "web");
assert.match(patchYml, /name:\s*pi-furry-partner/);

// 2. Validate on-demand sprite sheet encoding and frame augmentation
const umiSheet = loadEncodedSheet("umi");
assert.equal(umiSheet.style, "umi");
assert.equal(umiSheet.width, 240);
assert.equal(umiSheet.height, 240);
assert.ok(umiSheet.ids.poke !== undefined, "umi sheet includes poke frame");
assert.ok(umiSheet.ids.watch !== undefined, "umi sheet includes watch frames");
assert.ok(umiSheet.ids.listen !== undefined, "umi sheet includes listen frames");
assert.ok(umiSheet.ids.search !== undefined, "umi sheet includes search frames");
assert.equal(typeof umiSheet.frames[0].pixels, "string");
assert.equal(Buffer.from(umiSheet.frames[0].pixels, "base64").length, 240 * 240 * (umiSheet.pixelsEncoding==='u16le'?2:1));

const migratedSheet = loadEncodedSheet("umi-pixel");
assert.equal(migratedSheet, umiSheet, "Old pixel preferences no longer require a pixel asset bank");
for (const legacy of ["illustration", "pixel", "wumi", "wumi-pixel", "umi-pixel"]) {
  assert.equal(sanitizeDshSettings({ style: legacy }).style, "umi");
  assert.equal(loadEncodedSheet(legacy), umiSheet, "Every historical style input migrates to illustration");
}

// 3. Validate DSH persona prompt adaptation (zh-CN and en)
const zhPersona = formatDshPersonaPrompt("zh-CN");
assert.match(zhPersona, /DeepSeek Harness \(DSH\) 里的陪伴型编程伙伴/);
assert.doesNotMatch(zhPersona, /Pi 里的陪伴型编程伙伴/);

const enPersona = formatDshPersonaPrompt("en");
assert.match(enPersona, /inside DeepSeek Harness \(DSH\)/);
assert.doesNotMatch(enPersona, /inside Pi\b/);

// 4. Validate Host routes (/api/furry-partner/sheet, /api/furry-partner/config, /api/furry-partner/hires/*) and system-prompt/assemble
const scratch = await mkdtemp(join(work, "dsh-host-"));
try {
  const tempConfigPath = join(scratch, "config.json");
  await writeFile(
    tempConfigPath,
    JSON.stringify({ layout: "editor", renderer: "sixel", persona: false, style: "umi", language: "zh-CN" }),
    "utf8"
  );

  const routes = new Map();
  const hooks = new Map();
  let settingsConfigured = null;

  const mockCtx = {
    fiber: { id: "test-fiber" },
    inject(deps, callback) {
      const scope = {
        effect(fn) {
          fn();
        },
        settings: {
          configure(opts) {
            settingsConfigured = opts;
          },
        },
        connection: {
          fetch: {
            register(spec) {
              routes.set(spec.path, spec);
              return () => routes.delete(spec.path);
            },
          },
        },
      };
      callback(scope);
    },
    on(eventName, handler) {
      hooks.set(eventName, handler);
    },
  };

  apply(mockCtx, { configPath: tempConfigPath });
  assert.deepEqual(settingsConfigured, { auto: false });
  assert.ok(routes.has(SHEET_PATH), "Sheet route registered");
  assert.ok(routes.has(GESTURE_PATH), 'Single reviewed clip route registered');
  assert.ok(routes.has(TITLE_IMAGE_PATH),'Independent title image route registered');
  const titleRes=await routes.get(TITLE_IMAGE_PATH).fetch(new Request(`http://localhost${TITLE_IMAGE_PATH}?variant=static`));
  assert.equal(titleRes.status,200);assert.equal(titleRes.headers.get('content-type'),'image/png');
  const titleBytes=Buffer.from(await titleRes.arrayBuffer());
  assert.deepEqual(titleBytes,await readFile(join(root,'assets/branding/umi-title.png')),'Original branding PNG is served without recoding');
  const cachedTitle=await routes.get(TITLE_IMAGE_PATH).fetch(new Request(`http://localhost${TITLE_IMAGE_PATH}?variant=static`,{headers:{'if-none-match':titleRes.headers.get('etag')}}));
  assert.equal(cachedTitle.status,304);
  const unsafeTitle=await routes.get(TITLE_IMAGE_PATH).fetch(new Request(`http://localhost${TITLE_IMAGE_PATH}?variant=../secrets`));
  assert.equal(unsafeTitle.status,404);
  const unsafeGesture = await routes.get(GESTURE_PATH).fetch(new Request(`http://localhost${GESTURE_PATH}?action=../cry`));
  assert.equal(unsafeGesture.status,404);
  assert.equal(loadHiResFrame('gesture-../cry','gesture-cry-000'),null);
  assert.equal(loadHiResFrame('gesture-shy','../000'),null);
  assert.equal(Object.keys(umiSheet.ids).some(id=>id.startsWith('gesture-')),false,'Base API never aggregates video pixels');
  assert.ok(routes.has(HIRES_MANIFEST_PATH), "Hi-Res manifest route registered");
  assert.ok(routes.has(HIRES_FRAME_PATH), "Hi-Res frame route registered");
  assert.ok(routes.has(CONFIG_PATH), "Config route registered");
  assert.ok(hooks.has("system-prompt/assemble"), "system-prompt/assemble hook registered");

  // GET /api/furry-partner/hires/manifest
  const hiResManifestRes = await routes.get(HIRES_MANIFEST_PATH).fetch(new Request(`http://localhost${HIRES_MANIFEST_PATH}`));
  assert.equal(hiResManifestRes.status, 200);
  const hiResManifest = await hiResManifestRes.json();
  assert.equal(hiResManifest.width, 640);
  assert.equal(hiResManifest.height, 640);
  assert.equal(hiResManifest.alpha, "continuous A8 preserved");
  assert.ok(hiResManifest.poses.includes("idle-open"));
  assert.ok(hiResManifest.poses.includes("listen"));
  assert.ok(hiResManifest.poses.includes("poke"));
  assert.equal(hiResManifest.animations.watch.clips.running.fps, 24);
  assert.equal(hiResManifest.animations.search.clips.searching.fps, 24);

  // GET /api/furry-partner/hires/frame?kind=poses&id=idle-open
  const hiResFrameRes = await routes.get(HIRES_FRAME_PATH).fetch(
    new Request(`http://localhost${HIRES_FRAME_PATH}?kind=poses&id=idle-open`)
  );
  assert.equal(hiResFrameRes.status, 200);
  assert.equal(hiResFrameRes.headers.get("content-type"), "image/webp");
  const webpBytes = new Uint8Array(await hiResFrameRes.arrayBuffer());
  assert.ok(webpBytes.length > 1000, "Returns valid 640x640 WebP payload");

  // GET /api/furry-partner/sheet?style=umi-pixel
  const sheetRes = await routes.get(SHEET_PATH).fetch(new Request(`http://localhost${SHEET_PATH}?style=umi-pixel`));
  assert.equal(sheetRes.status, 200);
  const fetchedSheet = await sheetRes.json();
  assert.equal(fetchedSheet.style, "umi");
  assert.equal(fetchedSheet.width, 240);

  // When persona is false, system-prompt/assemble leaves sections untouched
  const assembleHook = hooks.get("system-prompt/assemble");
  const baseAssembled = {
    sections: [
      { name: "harness:identity", text: "You are an AI agent." },
      { name: "deployment:persona-suffix", text: "Workspace: /repo" },
    ],
  };
  const untouched = await assembleHook(null, null, async () => baseAssembled);
  assert.equal(untouched.sections.length, 2);

  // POST /api/furry-partner/config to enable persona and switch language
  const postRes = await routes.get(CONFIG_PATH).fetch(
    new Request(`http://localhost${CONFIG_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona: true, style: "umi-pixel", size: "large", language: "zh-CN" }),
    })
  );
  assert.equal(postRes.status, 200);
  const updatedConfig = await postRes.json();
  assert.equal(updatedConfig.persona, true);
  assert.equal(updatedConfig.style, "umi");
  assert.equal(updatedConfig.size, "large");

  // Verify Pi-specific keys in config.json were preserved!
  const savedDisk = JSON.parse(await readFile(tempConfigPath, "utf8"));
  assert.equal(savedDisk.layout, "editor");
  assert.equal(savedDisk.renderer, "sixel");
  assert.equal(savedDisk.persona, true);
  assert.equal(savedDisk.dshSize, "large");

  // Now system-prompt/assemble injects furry-partner:persona right before deployment:persona-suffix
  const withPersona = await assembleHook(null, null, async () => baseAssembled);
  assert.equal(withPersona.sections.length, 3);
  assert.equal(withPersona.sections[1].name, "furry-partner:persona");
  assert.match(withPersona.sections[1].text, /DeepSeek Harness \(DSH\) 里的陪伴型编程伙伴/);
  assert.equal(withPersona.sections[2].name, "deployment:persona-suffix");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
