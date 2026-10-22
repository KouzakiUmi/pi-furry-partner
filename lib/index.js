// DeepSeek Harness (DSH) Host plugin entry for pi-furry-partner (Umi / 呜咪).
// Serves on-demand reaction sprite sheets, persists shared mascot preferences,
// and optionally injects Umi's character voice into system-prompt/assemble.

import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_STYLES as STYLES, normalizeDshStyle as normalizeStyle, styleAssetDirectory } from "./styles.mjs";
import { withPokeFrame } from "./poke.mjs";
import { withWatchFrames } from "./watch.mjs";
import { withListenFrames } from "./listen.mjs";
import { withSearchFrames } from "./search.mjs";
import { withGestureVideoFrames, isGestureVideoId, GESTURE_VIDEO_IDS, normalizeGestureVideoCatalog, reviewedHiResGesture } from "./gesture-video.mjs";
import { withExpressionFrames } from "./expressions.mjs";
import { normalizeLanguage, resolveLanguage, personaFilename } from "./language.mjs";
import { FULL_ANIMATION_EDITION } from "./build-profile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const defaultConfigPath = join(rootDir, "config.json");

export const name = "pi-furry-partner";
export const inject = ["systemPrompt"];
export const SHEET_PATH = "/api/furry-partner/sheet";
export const GESTURE_PATH = "/api/furry-partner/gesture";
export const TITLE_IMAGE_PATH = "/api/furry-partner/branding/title";
export const CONFIG_PATH = "/api/furry-partner/config";
export const HIRES_MANIFEST_PATH = "/api/furry-partner/hires/manifest";
export const HIRES_FRAME_PATH = "/api/furry-partner/hires/frame";
export const ANIMATED_CATALOG_PATH = "/api/furry-partner/animated/catalog";
export const ANIMATED_ASSET_PATH = "/api/furry-partner/animated/asset";
export const DSH_SIZES = Object.freeze(["small", "normal", "large", "xlarge"]);
export const DSH_BUBBLE_MODES = Object.freeze(["auto", "always", "off"]);

const DEFAULT_DSH_SETTINGS = Object.freeze({
  name: "呜咪",
  subtitle: "你的工作搭档",
  enabled: true,
  heroMark: true,
  animation: true,
  persona: false,
  style: "umi",
  size: "normal",
  scale: 1,
  bubbleMode: "auto",
  companionship: "gentle",
  language: "auto",
});

const encodedSheetCache = new Map();
const encodedGestureCache = new Map();
let cachedHiResManifest = null;
const cachedHiResFrames = new Map();

function cleanText(value, maxLen = 120) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim().slice(0, maxLen);
}

function clampScale(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.max(0.4, Math.min(3.0, num)) * 100) / 100;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const animatedRoot = join(rootDir, 'assets', 'animated');
let cachedAnimatedCatalog = null;
const animatedAssetLists = new WeakMap();
export function loadAnimatedCatalog(directory = animatedRoot) {
  if (!FULL_ANIMATION_EDITION) throw new Error('Complete animation is disabled for this build edition');
  if (directory === animatedRoot && cachedAnimatedCatalog) return cachedAnimatedCatalog;
  const data = readJsonFile(join(directory, 'catalog.json'));
  if (data?.schemaVersion !== 1 || typeof data.revision !== 'string' || !data.revision ||
      data.logicalCanvas?.width !== 640 || data.logicalCanvas?.height !== 640 ||
      !data.clips || typeof data.clips !== 'object') throw new Error('Invalid approved motion catalog');
  if (directory === animatedRoot) cachedAnimatedCatalog = data;
  return data;
}
export function loadAnimatedAsset(assetPath, revision, directory = animatedRoot) {
  const value = String(assetPath || '');
  if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(?:json|webp|uix\.gz)$/.test(value)) return null;
  const catalog = loadAnimatedCatalog(directory);
  if (revision && revision !== catalog.revision) return null;
  let permitted = animatedAssetLists.get(catalog);
  if (!permitted) {
    permitted = new Set();
    for (const clip of Object.values(catalog.clips)) {
      if (clip?.qa?.accepted !== true) continue;
      for (const entry of Object.values(clip.indexed || {})) if (typeof entry.file === 'string') permitted.add(entry.file);
      for (const frame of clip.hires?.frames || []) permitted.add(`${clip.hires.baseUrl}${frame.file}`);
    }
    animatedAssetLists.set(catalog, permitted);
  }
  if (!permitted.has(value)) return null;
  const root = realpathSync(directory), target = realpathSync(resolve(directory, value));
  const within = relative(root, target);
  if (isAbsolute(within) || within === '..' || within.startsWith('..\\') || within.startsWith('../')) return null;
  const bytes = readFileSync(target);
  // Deliberately no Content-Encoding: fetch.arrayBuffer receives stored gzip bytes.
  return { bytes, contentType: value.endsWith('.webp') ? 'image/webp'
      : value.endsWith('.uix.gz') ? 'application/gzip' : 'application/json; charset=utf-8',
    etag: `"${createHash('sha256').update(bytes).digest('hex')}"`, revision: catalog.revision };
}

// Independently reviewed branding media. Never reads agent/desktop-pet state.
function isAnimatedBranding(bytes, filename) {
  if (filename.endsWith('.webp')) {
    if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return false;
    let count = 0, animation = false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
      if (offset + 8 + size > bytes.length) return false;
      if (type === 'ANIM') animation = true;
      if (type === 'ANMF') count++;
      offset += 8 + size + (size % 2);
    }
    return animation && count >= 2;
  }
  if (!['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) || bytes.length < 14) return false;
  let offset = 13 + (bytes[10] & 0x80 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0), count = 0;
  const skipBlocks = () => {
    while (offset < bytes.length) { const size = bytes[offset++]; if (!size) return true; offset += size; }
    return false;
  };
  while (offset < bytes.length) {
    const block = bytes[offset++];
    if (block === 0x3b) return count >= 2;
    if (block === 0x21) { offset++; if (!skipBlocks()) return false; }
    else if (block === 0x2c) {
      if (offset + 9 > bytes.length) return false;
      const packed = bytes[offset + 8]; offset += 9;
      if (packed & 0x80) offset += 3 * (2 ** ((packed & 7) + 1));
      offset++; if (!skipBlocks()) return false; count++;
    } else return false;
  }
  return false;
}

export function loadTitleBranding(variant = 'auto', directory = join(rootDir, 'assets', 'branding')) {
  if (!['auto', 'static'].includes(variant)) return null;
  const result = (bytes, contentType, animated = false) => ({ bytes, contentType, animated,
    etag: `"${createHash('sha256').update(bytes).digest('hex')}"` });
  if (variant === 'auto') {
    try {
      const metadata = readJsonFile(join(directory, 'title.json'));
      const clip = metadata?.animation;
      if (metadata.schemaVersion === 1 && clip?.qa?.accepted === true &&
          ['umi-title-wave.webp', 'umi-title-wave.gif'].includes(clip.file) && /^[a-f0-9]{64}$/.test(clip.sha256)) {
        const bytes = readFileSync(join(directory, clip.file));
        if (createHash('sha256').update(bytes).digest('hex') === clip.sha256 && isAnimatedBranding(bytes, clip.file)) {
          return result(bytes, clip.file.endsWith('.webp') ? 'image/webp' : 'image/gif', true);
        }
      }
    } catch { /* Missing/rejected/corrupt animation always keeps the original PNG. */ }
  }
  const bytes = readFileSync(join(directory, 'umi-title.png'));
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return null;
  return result(bytes, 'image/png');
}

export function loadHiResManifest() {
  if (cachedHiResManifest) return cachedHiResManifest;
  const manifestPath = join(rootDir, "assets", "hires", "umi", "manifest.json");
  const raw = readJsonFile(manifestPath);
  const gestures = {};
  for (const [id, clip] of Object.entries(raw.animations?.gestures || {})) {
    if (reviewedHiResGesture(id, clip)) gestures[id] = clip;
  }
  cachedHiResManifest = { ...raw, animations: { ...raw.animations, gestures } };
  return cachedHiResManifest;
}

export function loadHiResFrame(kind = "poses", id = "idle-open") {
  const safeKind = ["poses", "watch", "search", ...GESTURE_VIDEO_IDS.map(id => `gesture-${id}`)].includes(kind) ? kind : null;
  const safeId = /^[a-z0-9-]+$/i.test(String(id || "")) ? String(id) : null;
  if (!safeKind || !safeId) return null;
  if (safeKind.startsWith('gesture-')) {
    const clip = loadHiResManifest().animations?.gestures?.[safeKind.slice(8)];
    if (!clip || !clip.ids.includes(safeId)) return null;
  }
  const cacheKey = `${safeKind}/${safeId}`;
  if (cachedHiResFrames.has(cacheKey)) {
    const hit = cachedHiResFrames.get(cacheKey); cachedHiResFrames.delete(cacheKey); cachedHiResFrames.set(cacheKey, hit); return hit;
  }
  const filePath = join(rootDir, "assets", "hires", "umi", safeKind, `${safeId}.webp`);
  const bytes = readFileSync(filePath);
  if (cachedHiResFrames.size >= 96) {
    cachedHiResFrames.delete(cachedHiResFrames.keys().next().value);
  }
  cachedHiResFrames.set(cacheKey, bytes);
  return bytes;
}

export function loadEncodedSheet(styleInput = "umi") {
  const style = normalizeStyle(styleInput) || "umi";
  if (encodedSheetCache.has(style)) return encodedSheetCache.get(style);

  const directory = join(rootDir, "assets", "reactions", styleAssetDirectory(style));
  const base = readJsonFile(join(directory, "reaction-sheet.json"));
  let augmented = base;
  try { augmented = withPokeFrame(augmented, readJsonFile(join(directory, "poke-patch.json"))); } catch { /* Optional */ }
  try { augmented = withWatchFrames(augmented, readJsonFile(join(directory, "watch-frames.json"))); } catch { /* Optional */ }
  try { augmented = withListenFrames(augmented, readJsonFile(join(directory, "listen-frames.json"))); } catch { /* Optional */ }
  try { augmented = withSearchFrames(augmented, readJsonFile(join(directory, "search-frames.json"))); } catch { /* Optional */ }
  try { augmented = withExpressionFrames(augmented, readJsonFile(join(directory, "expression-frames.json"))); } catch { /* Optional */ }
  let gestureCatalog = normalizeGestureVideoCatalog(null);
  try { gestureCatalog = normalizeGestureVideoCatalog(readJsonFile(join(directory, 'gesture-videos.json'))); } catch { /* Optional metadata. */ }

  const encoded = {
    schemaVersion: augmented.schemaVersion ?? 1,
    style,
    approvedStaticRevision: augmented.approvedStaticRevision,
    width: augmented.width,
    height: augmented.height,
    transparentIndex: augmented.transparentIndex ?? 0,
    palette: augmented.palette,
    pixelsEncoding: augmented.palette.length > 256 ? 'u16le' : 'u8',
    ids: augmented.ids,
    motion: augmented.motion,
    gestureCatalog,
    frames: augmented.frames.map(({ id, pixels }) => ({
      id,
      pixels: encodePixels(pixels,augmented.palette.length > 256),
    })),
  };
  encodedSheetCache.set(style, encoded);
  return encoded;
}

export function loadEncodedGesture(styleInput = "umi", action) {
  if (!isGestureVideoId(action)) return null;
  const style = normalizeStyle(styleInput) || 'umi';
  const key = `${style}/${action}`;
  if (encodedGestureCache.has(key)) {
    const hit = encodedGestureCache.get(key); encodedGestureCache.delete(key); encodedGestureCache.set(key, hit); return hit;
  }
  const encodedBase = loadEncodedSheet(style);
  const metadata = encodedBase.gestureCatalog?.clips?.[action];
  if (!metadata) return null;
  // Validation only needs base dimensions and its exact palette prefix. Do not
  // decode the watch/search/base frames just to serve one independent clip.
  const base = { width: encodedBase.width, height: encodedBase.height, palette: encodedBase.palette, ids: {}, frames: [], motion: {} };
  const directory = join(rootDir, 'assets', 'reactions', styleAssetDirectory(style));
  let raw;
  try { raw = readJsonFile(join(directory, `gesture-${action}-frames.json`)); } catch { return null; }
  if (raw?.action !== action) return null;
  const sheet = withGestureVideoFrames(base, raw, metadata);
  if (sheet === base) return null;
  const wide = sheet.palette.length > 256;
  const result = { action, style, width: sheet.width, height: sheet.height, palette: sheet.palette,
    qa: { accepted: true }, sequence: sheet.motion.gestureVideos[action].sequence,
    pixelsEncoding: wide ? 'u16le' : 'u8', frames: sheet.frames.map(f => ({ id: f.id, pixels: encodePixels(f.pixels, wide) })) };
  encodedGestureCache.set(key, result);
  while (encodedGestureCache.size > 2) encodedGestureCache.delete(encodedGestureCache.keys().next().value);
  return result;
}

function encodePixels(pixels,wide) {
  if (!wide) return Buffer.from(pixels).toString('base64');
  const bytes=Buffer.alloc(pixels.length*2);
  for(let i=0;i<pixels.length;i++)bytes.writeUInt16LE(pixels[i],i*2);
  return bytes.toString('base64');
}

export function formatDshPersonaPrompt(language = "auto") {
  const filename = personaFilename(language);
  const raw = readFileSync(join(rootDir, "prompts", filename), "utf8").trim();
  return raw
    .replaceAll("Pi 里的陪伴型编程伙伴", "DeepSeek Harness (DSH) 里的陪伴型编程伙伴")
    .replaceAll("inside Pi", "inside DeepSeek Harness (DSH)");
}

export function sanitizeDshSettings(input = {}, base = DEFAULT_DSH_SETTINGS) {
  const next = { ...base };
  if (!input || typeof input !== "object") return next;
  for (const key of ["enabled", "heroMark", "animation", "persona"]) {
    if (typeof input[key] === "boolean") next[key] = input[key];
  }
  for (const key of ["name", "subtitle"]) {
    if (typeof input[key] === "string") {
      const cleaned = cleanText(input[key]);
      if (cleaned) next[key] = cleaned;
    }
  }
  if (["off", "gentle", "lively"].includes(input.companionship)) next.companionship = input.companionship;
  const style = normalizeStyle(input.style);
  if (style) next.style = style;
  if (DSH_SIZES.includes(input.size)) {
    next.size = input.size;
  } else if (input.dshSize && DSH_SIZES.includes(input.dshSize)) {
    next.size = input.dshSize;
  }
  const scale = clampScale(input.scale);
  if (scale !== null) next.scale = scale;
  if (DSH_BUBBLE_MODES.includes(input.bubbleMode)) next.bubbleMode = input.bubbleMode;
  const language = normalizeLanguage(input.language);
  if (language) next.language = language;
  return next;
}

export function readHostSettings(configPath = defaultConfigPath) {
  try {
    const raw = readJsonFile(configPath);
    return sanitizeDshSettings(raw, DEFAULT_DSH_SETTINGS);
  } catch {
    return { ...DEFAULT_DSH_SETTINGS };
  }
}

export function writeHostSettings(patch = {}, configPath = defaultConfigPath) {
  let existing = {};
  try {
    const parsed = readJsonFile(configPath);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed;
  } catch { /* Ignore missing or invalid config file */ }
  const current = sanitizeDshSettings(existing, DEFAULT_DSH_SETTINGS);
  const updated = sanitizeDshSettings(patch, current);
  const toSave = {
    ...existing,
    name: updated.name,
    subtitle: updated.subtitle,
    enabled: updated.enabled,
    heroMark: updated.heroMark,
    animation: updated.animation,
    persona: updated.persona,
    style: updated.style,
    dshSize: updated.size,
    scale: updated.scale,
    bubbleMode: updated.bubbleMode,
    companionship: updated.companionship,
    language: updated.language,
  };
  if (existing.size === undefined || DSH_SIZES.includes(existing.size)) {
    toSave.size = updated.size;
  }
  try {
    writeFileSync(configPath, `${JSON.stringify(toSave, null, 2)}\n`, "utf8");
  } catch { /* Read-only filesystem fallback: keep in-memory state */ }
  return updated;
}

function jsonResponse(payload, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

export function apply(ctx, config = {}) {
  const customConfigPath = typeof config?.configPath === "string" ? config.configPath : defaultConfigPath;
  let settings = sanitizeDshSettings(config, readHostSettings(customConfigPath));

  if (typeof ctx.inject === "function") {
    ctx.inject(["settings"], (scope) => {
      if (typeof scope.settings?.configure !== "function") return;
      scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber), "furry-partner: custom settings section");
    });

    ctx.inject(["connection"], (scope) => {
      if (typeof scope.connection?.fetch?.register !== "function") return;
      scope.effect(() => scope.connection.fetch.register({
        path: SHEET_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: (req) => {
          try {
            const url = new URL(req?.url || SHEET_PATH, "http://localhost");
            const requestedStyle = normalizeStyle(url.searchParams.get("style")) || settings.style || "umi";
            const sheet = loadEncodedSheet(requestedStyle);
            return jsonResponse(sheet, 200, "public, max-age=3600");
          } catch (error) {
            return jsonResponse({ error: String(error?.message || "Sheet load failed") }, 500);
          }
        },
      }), "furry-partner: sprite sheet route");

      scope.effect(() => scope.connection.fetch.register({
        path: GESTURE_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: (req) => {
          try {
            const url = new URL(req?.url || GESTURE_PATH, 'http://localhost');
            const clip = loadEncodedGesture(url.searchParams.get('style') || settings.style, url.searchParams.get('action'));
            return clip ? jsonResponse(clip, 200, 'public, max-age=3600') : jsonResponse({ error: 'Reviewed gesture not found' }, 404);
          } catch { return jsonResponse({ error: 'Reviewed gesture not found' }, 404); }
        },
      }), "furry-partner: single gesture route");

      scope.effect(() => scope.connection.fetch.register({
        path: TITLE_IMAGE_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: (req) => {
          try {
            const url = new URL(req?.url || TITLE_IMAGE_PATH, 'http://localhost');
            const branding = loadTitleBranding(url.searchParams.get('variant') || 'auto');
            if (!branding) return jsonResponse({ error: 'Title image not found' }, 404);
            const headers = { 'content-type': branding.contentType, 'cache-control': 'no-cache', etag: branding.etag,
              'x-content-type-options': 'nosniff' };
            if (req?.headers?.get?.('if-none-match') === branding.etag) return new Response(null, { status: 304, headers });
            return new Response(branding.bytes, { status: 200, headers });
          } catch { return jsonResponse({ error: 'Title image not found' }, 404); }
        },
      }), "furry-partner: independent title image route");

      scope.effect(() => scope.connection.fetch.register({
        path: HIRES_MANIFEST_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: () => {
          try {
            return jsonResponse(loadHiResManifest(), 200, "public, max-age=3600");
          } catch (error) {
            return jsonResponse({ error: String(error?.message || "Hi-Res manifest load failed") }, 500);
          }
        },
      }), "furry-partner: hires manifest route");

      scope.effect(() => scope.connection.fetch.register({
        path: HIRES_FRAME_PATH,
        methods: ["GET"],
        requestBody: "buffered",
        fetch: (req) => {
          try {
            const url = new URL(req?.url || HIRES_FRAME_PATH, "http://localhost");
            const kind = url.searchParams.get("kind") || "poses";
            const id = url.searchParams.get("id") || "idle-open";
            const bytes = loadHiResFrame(kind, id);
            if (!bytes) return jsonResponse({ error: "Frame not found" }, 404);
            return new Response(bytes, {
              status: 200,
              headers: {
                "content-type": "image/webp",
                "cache-control": "public, max-age=31536000, immutable",
              },
            });
          } catch {
            return jsonResponse({ error: "Frame not found" }, 404);
          }
        },
      }), "furry-partner: hires frame route");

      scope.effect(() => scope.connection.fetch.register({
        path: ANIMATED_CATALOG_PATH, methods: ['GET'], requestBody: 'buffered',
        fetch: () => {
          try { return jsonResponse(loadAnimatedCatalog(), 200, 'no-cache'); }
          catch { return jsonResponse({ error: 'Approved motion pack not available' }, 404); }
        },
      }), 'furry-partner: approved motion catalog route');
      scope.effect(() => scope.connection.fetch.register({
        path: ANIMATED_ASSET_PATH, methods: ['GET'], requestBody: 'buffered',
        fetch: req => {
          try {
            const url = new URL(req?.url || ANIMATED_ASSET_PATH, 'http://localhost');
            const version = url.searchParams.get('v');
            const asset = loadAnimatedAsset(url.searchParams.get('path'), version);
            if (!asset) return jsonResponse({ error: 'Approved motion asset not found' }, 404);
            const headers = { 'content-type': asset.contentType, etag: asset.etag,
              'cache-control': version ? 'public, max-age=31536000, immutable' : 'no-cache',
              'x-content-type-options': 'nosniff' };
            if (req?.headers?.get?.('if-none-match') === asset.etag) return new Response(null, { status: 304, headers });
            return new Response(asset.bytes, { status: 200, headers });
          } catch { return jsonResponse({ error: 'Approved motion asset not found' }, 404); }
        },
      }), 'furry-partner: approved motion asset route');

      scope.effect(() => scope.connection.fetch.register({
        path: CONFIG_PATH,
        methods: ["GET", "POST"],
        requestBody: "buffered",
        fetch: async (req) => {
          const method = String(req?.method || "GET").toUpperCase();
          if (method === "POST") {
            try {
              const body = typeof req.json === "function" ? await req.json() : JSON.parse(await req.text());
              settings = writeHostSettings(body, customConfigPath);
            } catch (error) {
              return jsonResponse({ error: String(error?.message || "Invalid config payload") }, 400);
            }
          }
          return jsonResponse({
            ...settings,
            styles: STYLES,
            sizes: DSH_SIZES,
            resolvedLanguage: resolveLanguage(settings.language),
          });
        },
      }), "furry-partner: config route");
    });
  }

  // Only append Umi's localized persona (口吻) section when enabled; never modify or rewrite DSH's native system prompt sections.
  if (typeof ctx.on === "function") {
    ctx.on("system-prompt/assemble", async (_original, _context, next) => {
      const assembled = await next();
      if (!settings.persona || !assembled || typeof assembled !== "object") return assembled;
      const originalSections = Array.isArray(assembled.sections) ? assembled.sections : [];
      if (originalSections.some((item) => item?.name === "furry-partner:persona")) return assembled;

      const personaText = formatDshPersonaPrompt(settings.language);
      const section = { name: "furry-partner:persona", text: personaText };
      const sections = [...originalSections];
      const suffixIndex = sections.findIndex((item) => item?.name === "deployment:persona-suffix");
      if (suffixIndex >= 0) {
        sections.splice(suffixIndex, 0, section);
      } else {
        sections.push(section);
      }
      return { ...assembled, sections };
    });
  }
}

export default { name, inject, apply };
