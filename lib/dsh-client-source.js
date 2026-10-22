// DSH Client UI & Mascot Controller source (bundled into lib/client.js by scripts/build-dsh-client.mjs).
import { dshSceneTitle } from './dsh-scene-title.mjs';
import { FULL_ANIMATION_EDITION, approvedMotionStyle } from './build-profile.mjs';

const SHEET_API_PATH = "/api/furry-partner/sheet";
const GESTURE_API_PATH = "/api/furry-partner/gesture";
const TITLE_IMAGE_API_PATH = "/api/furry-partner/branding/title";
const CONFIG_API_PATH = "/api/furry-partner/config";
const HIRES_MANIFEST_API_PATH = "/api/furry-partner/hires/manifest";
const HIRES_FRAME_API_PATH = "/api/furry-partner/hires/frame";
const APPROVED_MOTION_CATALOG_API_PATH = "/api/furry-partner/animated/catalog";
const APPROVED_MOTION_ASSET_API_PATH = "/api/furry-partner/animated/asset";
const DSH_ASSET_REVISION = "consolidated-editions-old-pixel-grumpy-20261022-1";
const UI_STORAGE_KEY = "dsh-furry-partner:ui:v2";
const SETTINGS_STORAGE_KEY = "dsh-furry-partner:settings:v2";

const SIZE_PIXELS = Object.freeze({
  small: 140,
  normal: 196,
  large: 240,
  xlarge: 300,
});

const SIZES = Object.freeze(["small", "normal", "large", "xlarge"]);

const SIZE_LABELS = Object.freeze({
  small: { zh: "紧凑 (140px)", en: "Small (140px)" },
  normal: { zh: "标准 (196px)", en: "Normal (196px)" },
  large: { zh: "原画 (240px)", en: "Large (240px)" },
  xlarge: { zh: "超大 (300px)", en: "X-Large (300px)" },
});

const STYLE_LABELS = Object.freeze({
  umi: { zh: "插画", en: "Illustration" },
  "umi-pixel": { zh: "像素", en: "Pixel" },
});

const STATE_LABELS = Object.freeze({
  idle: { zh: "待机", en: "Idle" },
  waking: { zh: "睡醒", en: "Waking" },
  thinking: { zh: "思考", en: "Thinking" },
  speaking: { zh: "说话", en: "Speaking" },
  reading: { zh: "阅读", en: "Reading" },
  editing: { zh: "改代码", en: "Editing" },
  running: { zh: "执行", en: "Running" },
  searching: { zh: "搜索", en: "Searching" },
  waiting: { zh: "等待", en: "Waiting" },
  compacting: { zh: "整理", en: "Compacting" },
  success: { zh: "完成", en: "Success" },
  error: { zh: "报错", en: "Error" },
  cancelled: { zh: "停止", en: "Cancelled" },
});

const DSH_MASCOT_CSS = `
.furry-dsh-canvas-wrap.pet-hello, .furry-dsh-canvas-wrap.pet-return { animation: furry-pet-greet 1.2s ease-in-out 2; transform-origin: 50% 90%; }
.furry-dsh-canvas-wrap.pet-stretch { animation: furry-pet-stretch 4s ease-in-out; transform-origin: 50% 100%; }
.furry-dsh-canvas-wrap.pet-curious { animation: furry-pet-peek 4.8s ease-in-out; transform-origin: 50% 90%; }
.furry-dsh-canvas-wrap.pet-pat { animation: furry-pet-nuzzle 1.3s ease-in-out 3; transform-origin: 50% 85%; }
@keyframes furry-pet-greet { 0%,100% {transform: rotate(0)} 30% {transform: rotate(-3deg) translateY(-3px)} 65% {transform: rotate(3deg)} }
@keyframes furry-pet-stretch { 0%,100% {transform: scale(1)} 45%,65% {transform: scale(.97,1.04) translateY(-3px)} }
@keyframes furry-pet-peek { 0%,100% {transform: rotate(0)} 25%,70% {transform: rotate(-5deg) translateX(-5px)} }
@keyframes furry-pet-nuzzle { 0%,100% {transform: rotate(0)} 30% {transform: rotate(-3deg) translateY(2px)} 70% {transform: rotate(2deg)} }
@media (prefers-reduced-motion: reduce) { .furry-dsh-canvas-wrap { animation: none !important; } }

.furry-dsh-overlay-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 65;
  overflow: hidden;
  font-family: inherit;
}
.furry-dsh-pet {
  position: absolute;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 65;
}
.furry-dsh-pet.is-dragging {
  cursor: grabbing;
}
.furry-dsh-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}
.furry-dsh-pet.is-dragging .furry-dsh-stage {
  cursor: grabbing;
}
.furry-dsh-canvas-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 12px 26px rgba(0, 0, 0, 0.28));
  transition: transform 140ms ease;
}
.furry-dsh-stage:hover .furry-dsh-canvas-wrap {
  filter: drop-shadow(0 12px 26px rgba(85, 155, 230, 0.22));
}
.furry-dsh-canvas {
  display: block;
  pointer-events: none;
}
.furry-dsh-canvas.is-pixel {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.furry-dsh-resize-handle {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(24, 28, 36, 0.88));
  color: var(--dsw-alias-label-secondary, #9aa4b2);
  border: 1px solid var(--dsw-alias-border-l3, rgba(130, 155, 195, 0.32));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 1;
  cursor: nwse-resize;
  opacity: 0;
  transform: scale(0.88);
  transition: opacity 140ms ease, transform 140ms ease, color 120ms ease;
  pointer-events: auto;
}
.furry-dsh-stage:hover .furry-dsh-resize-handle,
.furry-dsh-pet.is-resizing .furry-dsh-resize-handle {
  opacity: 0.92;
  transform: scale(1);
}
.furry-dsh-resize-handle:hover {
  opacity: 1;
  color: var(--dsw-alias-label-primary, #ffffff);
}
.furry-dsh-zoom-badge {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--dsw-alias-bg-layer-1, rgba(20, 24, 31, 0.92));
  color: var(--dsw-alias-label-primary, #f3f5f8);
  border: 1px solid var(--dsw-alias-border-l3, rgba(130, 155, 195, 0.3));
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
  pointer-events: none;
}
.furry-dsh-bubble {
  position: absolute;
  top: 38%;
  transform: translateY(-50%);
  width: max-content;
  max-width: 248px;
  min-width: 120px;
  padding: 9px 13px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1, rgba(26, 30, 38, 0.94));
  color: var(--dsw-alias-label-primary, #f3f5f8);
  border: 1px solid var(--dsw-alias-border-l3, rgba(130, 155, 195, 0.28));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px);
  font-size: 13px;
  line-height: 1.48;
  pointer-events: none;
  transition: opacity 150ms ease, border-color 150ms ease;
}
.furry-dsh-bubble.side-left {
  right: calc(100% + 2px);
}
.furry-dsh-bubble.side-right {
  left: calc(100% + 2px);
}
.furry-dsh-bubble.tone-success {
  border-color: var(--dsw-alias-state-success, #2da44e);
}
.furry-dsh-bubble.tone-warning {
  border-color: var(--dsw-alias-state-warning, #d29922);
}
.furry-dsh-bubble.tone-error {
  border-color: var(--dsw-alias-state-error, #cf222e);
}
.furry-dsh-glyph {
  font-weight: 700;
  color: var(--dsw-alias-brand-primary, #4d8ef7);
}
.furry-dsh-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(130, 150, 180, 0.16));
  color: var(--dsw-alias-label-secondary, #9aa4b2);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.furry-dsh-tag.is-persona {
  color: var(--dsw-alias-brand-primary, #4d8ef7);
}
.furry-dsh-phrase {
  word-break: break-word;
  color: var(--dsw-alias-label-primary, #f3f5f8);
}
.furry-dsh-context-menu {
  position: fixed;
  z-index: 80;
  width: 236px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 6px;
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(24, 28, 36, 0.97));
  color: var(--dsw-alias-label-primary, #f3f5f8);
  border: 1px solid var(--dsw-alias-border-l3, rgba(130, 155, 195, 0.32));
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
  user-select: none;
}
.furry-dsh-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #9aa4b2);
}
.furry-dsh-menu-divider {
  height: 1px;
  margin: 4px 4px;
  background: var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.18));
}
.furry-dsh-menu-item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #f3f5f8);
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  padding: 7px 9px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  width: 100%;
  transition: background 100ms ease, color 100ms ease;
}
.furry-dsh-menu-item:hover {
  background: var(--dsw-alias-bg-layer-2, rgba(130, 150, 180, 0.16));
}
.furry-dsh-menu-item.is-active {
  color: var(--dsw-alias-brand-primary, #4d8ef7);
  font-weight: 600;
}
.furry-dsh-menu-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, rgba(130, 150, 180, 0.18));
  color: var(--dsw-alias-label-secondary, #9aa4b2);
  white-space: nowrap;
}
.furry-dsh-menu-item.is-active .furry-dsh-menu-badge {
  background: rgba(77, 142, 247, 0.18);
  color: var(--dsw-alias-brand-primary, #4d8ef7);
}
.furry-dsh-menu-zoom-box {
  padding: 5px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.furry-dsh-menu-zoom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.furry-dsh-zoom-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.25));
  background: var(--dsw-alias-bg-layer-2, rgba(130, 150, 180, 0.12));
  color: var(--dsw-alias-label-primary, #f3f5f8);
  border-radius: 6px;
  width: 26px;
  height: 24px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.furry-dsh-zoom-btn:hover {
  background: var(--dsw-alias-bg-layer-3, rgba(130, 150, 180, 0.24));
}
.furry-dsh-zoom-slider {
  flex: 1;
  accent-color: var(--dsw-alias-brand-primary, #4d8ef7);
  cursor: pointer;
  margin: 0;
}
.furry-dsh-menu-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.furry-dsh-menu-preset-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.22));
  background: transparent;
  color: var(--dsw-alias-label-secondary, #9aa4b2);
  border-radius: 6px;
  padding: 3px 2px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  text-align: center;
}
.furry-dsh-menu-preset-btn:hover {
  color: var(--dsw-alias-label-primary, #f3f5f8);
}
.furry-dsh-menu-preset-btn.is-active {
  border-color: var(--dsw-alias-brand-primary, #4d8ef7);
  color: var(--dsw-alias-brand-primary, #4d8ef7);
  background: rgba(77, 142, 247, 0.12);
  font-weight: 600;
}
.furry-dsh-minimized {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1, rgba(26, 30, 38, 0.95));
  color: var(--dsw-alias-label-primary, #f3f5f8);
  border: 1px solid var(--dsw-alias-border-l3, rgba(130, 150, 180, 0.3));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  font-size: 12px;
  cursor: pointer;
}
.furry-dsh-minimized.is-busy {
  border-color: var(--dsw-alias-brand-primary, #4d8ef7);
}
.furry-dsh-hero-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  pointer-events: none;
}
.furry-dsh-hero-image {
  display: block;
  object-fit: contain;
  pointer-events: none;
}
.furry-dsh-settings {
  max-width: 940px;
  padding: 8px 4px 28px;
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
}
.furry-dsh-settings * {
  box-sizing: border-box;
}
.furry-dsh-settings-head {
  margin-bottom: 16px;
}
.furry-dsh-settings-head h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}
.furry-dsh-settings-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #9aa4b2);
}
.furry-dsh-settings-grid {
  display: grid;
  grid-template-columns: minmax(280px, 340px) 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 720px) {
  .furry-dsh-settings-grid {
    grid-template-columns: 1fr;
  }
}
.furry-dsh-card {
  border: 1px solid var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.22));
  border-radius: 12px;
  padding: 14px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.furry-dsh-card + .furry-dsh-card {
  margin-top: 12px;
}
.furry-dsh-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.furry-dsh-stage-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 10px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(130, 150, 180, 0.08));
}
.furry-dsh-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.furry-dsh-chip {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.25));
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-secondary, inherit);
  border-radius: 7px;
  padding: 5px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.furry-dsh-chip:hover {
  color: var(--dsw-alias-label-primary, inherit);
}
.furry-dsh-chip.is-active {
  border-color: var(--dsw-alias-brand-primary, #4d8ef7);
  color: var(--dsw-alias-brand-primary, #4d8ef7);
  background: rgba(77, 142, 247, 0.12);
  font-weight: 600;
}
.furry-dsh-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l4, rgba(130, 150, 180, 0.14));
}
.furry-dsh-toggle-row:last-child {
  border-bottom: none;
}
.furry-dsh-toggle-title {
  font-size: 13px;
  font-weight: 500;
}
.furry-dsh-toggle-desc {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #9aa4b2);
  margin-top: 2px;
}
`;

function clampScaleValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.max(0.4, Math.min(3.0, num)) * 100) / 100;
}

export function resolveMascotPixels(settings = {}) {
  const base = SIZE_PIXELS[settings.size] || SIZE_PIXELS.normal;
  const scale = clampScaleValue(settings.scale) ?? 1;
  return Math.round(Math.max(72, Math.min(640, base * scale)));
}

function shouldShowPetBubble(settings, ui, snapshot) {
  if (ui?.bubbleMuted || settings?.bubbleMode === "off") return false;
  if (settings?.bubbleMode === "always") return Boolean(snapshot?.phrase);
  // Default "auto" mode: behave like a genuine desktop pet — clean when idle,
  // speak when poked, in demo tour, actively working, or right after completion/error.
  return Boolean(
    snapshot?.phrase &&
      (snapshot.gesture || snapshot.reaction === "poked" ||
        snapshot.demo ||
        snapshot.busy ||
        snapshot.phase === "waking" ||
        snapshot.phase === "success" ||
        snapshot.phase === "error" ||
        snapshot.phase === "cancelled")
  );
}

function decodeSheet(encoded) {
  if (!encoded || !Array.isArray(encoded.frames)) return null;
  const wide=encoded.pixelsEncoding==='u16le';
  return {
    ...encoded,
    frames: encoded.frames.map((frame) => {
      if (frame.pixels instanceof Uint8Array || frame.pixels instanceof Uint16Array) return frame;
      if (Array.isArray(frame.pixels)) return { ...frame, pixels: (wide ? Uint16Array : Uint8Array).from(frame.pixels) };
      const bin = typeof atob === "function" ? atob(frame.pixels) : Buffer.from(frame.pixels, "base64").toString("binary");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if(bytes.length!==encoded.width*encoded.height*(wide?2:1))throw new Error('Invalid sprite byte length');
      if(!wide)return {id:frame.id,pixels:bytes};
      const pixels=new Uint16Array(bytes.length/2),view=new DataView(bytes.buffer);
      for(let i=0;i<pixels.length;i++)pixels[i]=view.getUint16(i*2,true);
      return {id:frame.id,pixels};
    }),
  };
}

function readLocalJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch { /* Ignore quota or private browsing errors */ }
}

function readStoreSnapshot(store) {
  if (!store) return undefined;
  if (typeof store.getSnapshot === "function") return store.getSnapshot();
  if (typeof store.getState === "function") return store.getState();
  return undefined;
}

export function createMascotController({ fetchImpl = globalThis.fetch, now = () => performance.now() } = {}) {
  const defaultSettings = {
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
  };
  const defaultUi = {
    xRatio: 0.9,
    yRatio: 0.76,
    minimized: false,
    bubbleMuted: false,
  };

  let settings = readLocalJson(SETTINGS_STORAGE_KEY, defaultSettings);
  settings.style = normalizeDshStyle(settings.style) || defaultSettings.style;
  delete settings.composerPill; // Retired input-row chip cannot be re-enabled by old preferences.
  let ui = readLocalJson(UI_STORAGE_KEY, defaultUi);
  const listeners = new Set();
  const settingsListeners = new Set();

  const voice = { labels: {}, bubbles: {}, phrases: {} };
  function syncVoiceLanguage() {
    const selected = resolveLanguage(settings.language) === "en" ? EMBEDDED_VOICES.en : EMBEDDED_VOICES["zh-CN"];
    replaceActivityCopy(voice, selected.copy, selected.phrases);
  }
  syncVoiceLanguage();

  let clockTime = 0;
  let lastWall = now();
  function advanceClock() {
    const currentWall = now();
    const visible = typeof document === "undefined" || !document.hidden;
    if ((settings.animation || activity.isPoked()) && visible) {
      clockTime += Math.min(1000, Math.max(0, currentWall - lastWall));
    }
    lastWall = currentWall;
    return clockTime;
  }

  const activity = createActivity({
    ...voice,
    rotationMs: EMBEDDED_VOICES["zh-CN"].phrases.rotationMs,
    now: () => clockTime,
    gestureDurations: currentGestureDurations,
  });
  activity.start({ wake: true });
  const responseLatency = createResponseLatency({ now: () => clockTime });
  const bridge = createDshBridge({ activity, responseLatency });
  const companion = createDesktopCompanion({ now: () => clockTime, gestureDurations: currentGestureDurations });
  let awayAt = null;
  const player = createMotionPlayer({ now: () => clockTime, maxFrames: 64, allowWholeFrameMotion: !FULL_ANIMATION_EDITION });
  const presentation = createPresentationPlayer();
  const approvedPlayer = createApprovedMotionPlayer({ now: () => clockTime,
    loadIndexed: async (path, context) => {
      const response = await fetchImpl(`${APPROVED_MOTION_ASSET_API_PATH}?path=${encodeURIComponent(path)}&v=${encodeURIComponent(context.revision)}`,
        { credentials: 'same-origin', signal: context.signal });
      if (!response?.ok) throw new Error('Optional approved indexed clip unavailable');
      return path.endsWith('.json') ? response.json()
        : decodeApprovedMotionResource(await response.arrayBuffer(), { signal: context.signal });
    }, onReady: () => { emit(); scheduleTick(); } });
  let approvedCatalogPromise = null;
  const approvedHiResClips = new Map();
  let approvedLastHiResLayer = null;
  const approvedHiResByteLimit = 48 * 1024 * 1024;

  function approvedHiResActive() {
    return FULL_ANIMATION_EDITION && !disposed && settings.enabled && settings.animation && settings.style === 'umi' && !ui.minimized &&
      (typeof document === 'undefined' || !document.hidden);
  }
  function approvedHiResBytes() {
    let bytes = 0;
    for (const bank of approvedHiResClips.values()) for (const entry of bank.frames.values()) bytes += entry.width * entry.height * 4;
    return bytes;
  }
  function trimApprovedHiResBytes() {
    let bytes = approvedHiResBytes();
    for (const bank of approvedHiResClips.values()) for (const [id, entry] of bank.frames) {
      if (bytes <= approvedHiResByteLimit) return;
      if (entry === bank.painted?.entry || entry.bitmap === approvedLastHiResLayer?.bitmap) continue;
      entry.bitmap.close?.(); bank.frames.delete(id); bytes -= entry.width * entry.height * 4;
    }
  }
  function clearApprovedHiRes() {
    for (const bank of approvedHiResClips.values()) releaseApprovedHiResBank(bank);
    approvedHiResClips.clear(); approvedLastHiResLayer = null;
  }

  function releaseApprovedHiResBank(bank) {
    bank.abort?.abort();
    for (const entry of bank.frames.values()) {
      if (entry.bitmap === approvedLastHiResLayer?.bitmap) approvedLastHiResLayer = null;
      entry.bitmap.close?.();
    }
    bank.frames.clear(); bank.loading.clear();
  }
  function approvedHiResFrame(selection) {
    if (!approvedHiResActive() || typeof createImageBitmap !== 'function' || typeof fetchImpl !== 'function') return null;
    const key = `${selection.revision}/${selection.clipId}`;
    let bank = approvedHiResClips.get(key);
    if (!bank) {
      bank = { frames: new Map(), loading: new Set(), failed: new Set(), painted: null, playbackEpoch: null,
        abort: typeof AbortController === 'function' ? new AbortController() : null };
      approvedHiResClips.set(key, bank);
      while (approvedHiResClips.size > 2) {
        const oldest = approvedHiResClips.keys().next().value;
        releaseApprovedHiResBank(approvedHiResClips.get(oldest)); approvedHiResClips.delete(oldest);
      }
    } else { approvedHiResClips.delete(key); approvedHiResClips.set(key, bank); }
    const frames = selection.clip.hires.frames;
    if (bank.playbackEpoch !== selection.playbackEpoch) { bank.playbackEpoch = selection.playbackEpoch; bank.painted = null; }
    for (let n = 0; n <= 4; n++) {
      // Bound fetch+decode together; a background tab must not accumulate an
      // entire clip of obsolete requests while continually chasing its clock.
      if (bank.loading.size >= 4) break;
      let i = selection.frameIndex + n;
      if (selection.loop) i %= frames.length;
      const frame = frames[i];
      if (!frame || bank.frames.has(frame.id) || bank.loading.has(frame.id) || bank.failed.has(frame.id)) continue;
      bank.loading.add(frame.id);
      void (async () => {
        try {
          const path = `${selection.clip.hires.baseUrl}${frame.file}`;
          const response = await fetchImpl(`${APPROVED_MOTION_ASSET_API_PATH}?path=${encodeURIComponent(path)}&v=${encodeURIComponent(selection.revision)}`,
            { credentials: 'same-origin', signal: bank.abort?.signal });
          if (!response?.ok) throw new Error('Optional approved HD frame unavailable');
          const blob = await response.blob();
          if (disposed || approvedHiResClips.get(key) !== bank) return;
          const bitmap = await createImageBitmap(blob);
          if (disposed || approvedHiResClips.get(key) !== bank) { bitmap.close?.(); return; }
          bank.frames.set(frame.id, { bitmap, width: bitmap.width, height: bitmap.height });
          for (const [oldest, entry] of bank.frames) {
            if (bank.frames.size <= 16) break;
            if (oldest === bank.painted?.id || entry.bitmap === approvedLastHiResLayer?.bitmap) continue;
            entry.bitmap.close?.(); bank.frames.delete(oldest);
          }
          trimApprovedHiResBytes();
          // Readiness only wakes the current family; it never selects a frame.
          if (settings.style === 'umi' && cachedState?.approvedMotion?.clipId === selection.clipId) { emit(); scheduleTick(); }
        } catch { if (approvedHiResClips.get(key) === bank) bank.failed.add(frame.id); }
        finally { bank.loading.delete(frame.id); }
      })();
    }
    // A decode can finish after its exact 42ms display slot. Paint the newest
    // available past frame of this same clip rather than oscillating back to
    // indexed artwork; late older frames must never move playback backwards.
    const absoluteNow = selection.playbackMs ?? selection.elapsedMs;
    const cycle = selection.loop ? Math.floor(absoluteNow / selection.clip.periodMs) : 0;
    let best = bank.painted;
    for (const frame of frames) {
      const entry = bank.frames.get(frame.id);
      if (!entry) continue;
      let atMs = cycle * selection.clip.periodMs + frame.atMs;
      if (atMs > absoluteNow && selection.loop && cycle > 0) atMs -= selection.clip.periodMs;
      if (atMs > absoluteNow || best && atMs <= best.atMs) continue;
      best = { id: frame.id, atMs, entry };
    }
    bank.painted = best;
    return best?.entry || null;
  }

  const decodedSeeds = Object.fromEntries(Object.entries(SEED_SHEETS).map(([style, seed]) => [style, decodeSheet(seed)]));
  const seedForStyle = style => decodedSeeds[style] || decodedSeeds.umi;
  const decodedSeed = seedForStyle(settings.style);
  const sheets = new Map();
  if (decodedSeed) sheets.set("seed", decodedSeed);
  const loadingStyles = new Map();
  const gestureClipSheets = new Map();
  const loadingGestureClips = new Map();
  const rejectedGestureClips = new Set();
  function currentGestureDurations() {
    const durations = {};
    const catalog = sheets.get(settings.style)?.gestureCatalog;
    for (const [id, clip] of Object.entries(catalog?.clips || {})) {
      if (clip.qa?.accepted === true) durations[id] = clip.periodMs;
    }
    if (settings.style === 'umi') {
      for (const [id, clip] of Object.entries(hiResManifest?.animations?.gestures || {})) {
        if (reviewedHiResGesture(id, clip)) durations[id] = clip.periodMs;
      }
    }
    for (const [id, clip] of Object.entries(FULL_ANIMATION_EDITION && approvedMotionStyle(settings.style) ? approvedPlayer.catalog()?.clips || {} : {})) {
      if (clip.family === 'gesture' || clip.family === 'action') durations[id] = clip.periodMs;
    }
    return durations;
  }
  function sheetForGesture(base, action) {
    const metadata = base?.gestureCatalog?.clips?.[action];
    if (!isGestureVideoId(action) || metadata?.qa?.accepted !== true) return base;
    const key = `${settings.style}/${action}`;
    const hit = gestureClipSheets.get(key);
    if (hit?.base === base) { gestureClipSheets.delete(key); gestureClipSheets.set(key, hit); return hit.sheet; }
    if (disposed || loadingGestureClips.has(key) || rejectedGestureClips.has(key) || typeof fetchImpl !== 'function') return base;
    // Keep at most two downloads and two decoded clips alive across all styles.
    while (loadingGestureClips.size >= 2) {
      const oldest = loadingGestureClips.keys().next().value;
      loadingGestureClips.get(oldest).abort?.(); loadingGestureClips.delete(oldest);
    }
    const abort = typeof AbortController === 'function' ? new AbortController() : null;
    const request = { abort: () => abort?.abort() };
    loadingGestureClips.set(key, request);
    void (async () => {
      try {
        const res = await fetchImpl(`${GESTURE_API_PATH}?style=${encodeURIComponent(settings.style)}&action=${encodeURIComponent(action)}&v=${DSH_ASSET_REVISION}`,
          { credentials: 'same-origin', cache: 'no-store', ...(abort ? { signal: abort.signal } : {}) });
        if (!res?.ok) { rejectedGestureClips.add(key); return; }
        const raw = await res.json();
        if (disposed || abort?.signal.aborted) return;
        // Bound dimensions/frame count before allocating decoded pixel buffers.
        if (raw?.action !== action || raw.qa?.accepted !== true || raw.width !== base.width || raw.height !== base.height ||
            !Array.isArray(raw.frames) || raw.frames.length !== metadata.frameCount || raw.frames.length > 96 ||
            !Array.isArray(raw.palette) || raw.palette.length > 512 ||
            raw.pixelsEncoding !== (raw.palette.length > 256 ? 'u16le' : 'u8') ||
            base.width * base.height * raw.frames.length > 6000000 ||
            raw.frames.some(f => typeof f?.pixels !== 'string' || f.pixels.length > Math.ceil(base.width * base.height * (raw.pixelsEncoding === 'u16le' ? 2 : 1) / 3) * 4)) {
          rejectedGestureClips.add(key); return;
        }
        const decoded = decodeSheet(raw);
        const augmented = withGestureVideoFrames(base, decoded, metadata);
        if (augmented === base) { rejectedGestureClips.add(key); return; }
        gestureClipSheets.delete(key); gestureClipSheets.set(key, { base, sheet: augmented });
        while (gestureClipSheets.size > 2) gestureClipSheets.delete(gestureClipSheets.keys().next().value);
        emit(); scheduleTick();
      } catch {
        if (!abort?.signal.aborted) rejectedGestureClips.add(key);
      } finally {
        if (loadingGestureClips.get(key) === request) loadingGestureClips.delete(key);
      }
    })();
    return base;
  }
  const bitmaps = new Map();

  // 640x640 RGBA Continuous-A8-Alpha Hi-Res state
  let hiResManifest = null;
  let hiResRig = null;
  let hiResManifestPromise = null;
  const hiResFrames = new Map();
  const hiResLoadingFrames = new Map();
  const hiResWarpedBitmaps = new Map();
  let activeClipKey = null;
  let clipStartClock = 0;
  let lastHiResLayer = null;
  let lastHiResKey = null;
  let pendingHiResKey = null;
  let pendingHiResSince = 0;
  let activeHiResFrameKey = null;
  const HIRES_CACHE_LIMIT = 96;
  function releaseHiResEntry(entry) {
    entry.canvas?.close?.();
    if (entry.canvas && typeof entry.canvas.close !== 'function') { entry.canvas.width = 0; entry.canvas.height = 0; }
  }
  function trimHiResFrames() {
    for (const [key, entry] of hiResFrames) {
      if (hiResFrames.size <= HIRES_CACHE_LIMIT) break;
      // The canvas currently painted or held while its successor loads is live.
      if (key === activeHiResFrameKey || entry.canvas === lastHiResLayer?.bitmap) continue;
      hiResFrames.delete(key); releaseHiResEntry(entry);
    }
  }

  function rememberHiResLayer(layer, key) {
    const bank = key.startsWith('gesture-') ? hiResManifest?.animations?.gestures?.[key.slice(8)]
      : key.startsWith('poses/') ? hiResManifest : hiResManifest?.animations?.[key];
    layer = { ...layer, displayKey: key, registered: Boolean(bank?.approvedStaticRevision) };
    lastHiResLayer = layer; lastHiResKey = key; pendingHiResKey = null;
    return layer;
  }
  function holdHiResLayer(key) {
    if (!lastHiResLayer) return null;
    if (lastHiResKey === key) return lastHiResLayer;
    // A borrowed state expression ends with its real state. While the next
    // HD pose loads, paint its current indexed fallback instead of keeping an
    // expired completion/startle/warning visible for the generic hold window.
    if (lastHiResLayer.stateExpression) return null;
    if (pendingHiResKey !== key) { pendingHiResKey = key; pendingHiResSince = clockTime; }
    // Briefly hold the actual displayed image while a new pose loads. If its
    // request fails, show the correct indexed state rather than a stale idle.
    return clockTime - pendingHiResSince < 650 ? lastHiResLayer : null;
  }

  let timer = null;
  let timerDueAt = Infinity;
  let disposed = false;
  let revision = 0;
  let cachedState = null;

  function buildHiResRig(manifest) {
    const dim = { width: manifest.width || 640, height: manifest.height || 640 };
    const m = manifest.motion || {};
    const ears = m.ears === false ? [] : m.ears || DEFAULT_EARS;
    const paws = m.paws === false ? [] : m.paws || DEFAULT_PAWS;
    const wave = m.wave ? (Array.isArray(m.wave) ? m.wave : [m.wave]) : [];
    const listen = m.listen;
    const pokeFace = m.pokeFace;
    return {
      width: dim.width,
      height: dim.height,
      ears: regionGeometry(dim, ears),
      paws: regionGeometry(dim, paws),
      waves: regionGeometry(dim, wave),
      listenHead: listen?.head ? regionGeometry(dim, [listen.head]) : [],
      listenEars: listen?.ears ? regionGeometry(dim, listen.ears) : [],
      pokeFace: pokeFace ? regionGeometry(dim, [pokeFace]) : [],
    };
  }

  function findTimelineFrameId(clip, elapsedMs) {
    const frames = clip?.frames;
    if (!Array.isArray(frames) || !frames.length) return "000";
    const t = ((elapsedMs % clip.durationMs) + clip.durationMs) % clip.durationMs;
    let lo = 0;
    let hi = frames.length - 1;
    let best = frames[0].id;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].atMs <= t) {
        best = frames[mid].id;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function ensureHiResFrame(kind, id) {
    if (disposed || !kind || !id || typeof fetchImpl !== "function" || typeof document === "undefined") return null;
    const key = `${kind}/${id}`;
    if (hiResFrames.has(key)) {
      const hit = hiResFrames.get(key); hiResFrames.delete(key); hiResFrames.set(key, hit); return hit;
    }
    if (hiResLoadingFrames.has(key)) return null;

    const promise = (async () => {
      try {
        const res = await fetchImpl(
          `${HIRES_FRAME_API_PATH}?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}&v=${hiResManifest?.revision || DSH_ASSET_REVISION}`,
          { credentials: "same-origin" }
        );
        if (!res || !res.ok) return null;
        const blob = await res.blob();
        if (disposed) return null;
        if (typeof createImageBitmap !== "function") return null;
        const bmp = await createImageBitmap(blob);
        if (disposed) { bmp.close?.(); return null; }
        const w = bmp.width || 640;
        const h = bmp.height || 640;
        if (kind === "poses") {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx2d = canvas.getContext("2d");
          if (!ctx2d) { bmp.close?.(); return null; }
          ctx2d.drawImage(bmp, 0, 0);
          if (typeof bmp.close === "function") bmp.close();
          const imageData = ctx2d.getImageData(0, 0, w, h);
          const entry = {
            canvas,
            rgba32: new Uint32Array(imageData.data.buffer),
            width: w,
            height: h,
          };
          hiResFrames.set(key, entry);
        } else {
          hiResFrames.set(key, {
            canvas: bmp,
            rgba32: null,
            width: w,
            height: h,
          });
        }
        trimHiResFrames();
        emit();
      } catch {
        // Ignore individual frame load failures and keep sheet fallback
      } finally {
        hiResLoadingFrames.delete(key);
      }
      return null;
    })();
    hiResLoadingFrames.set(key, promise);
    return null;
  }

  async function ensureHiResManifest() {
    if (hiResManifest) return hiResManifest;
    if (hiResManifestPromise) return hiResManifestPromise;
    if (typeof fetchImpl !== "function" || typeof document === "undefined") return null;

    hiResManifestPromise = (async () => {
      try {
        const res = await fetchImpl(`${HIRES_MANIFEST_API_PATH}?v=${DSH_ASSET_REVISION}`, { credentials: "same-origin", cache: "no-store" });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (disposed) return null;
        if (data && data.width === 640) {
          const gestures = {};
          for (const [id, clip] of Object.entries(data.animations?.gestures || {})) {
            if (reviewedHiResGesture(id, clip)) gestures[id] = clip;
          }
          hiResManifest = { ...data, animations: { ...data.animations, gestures } };
          hiResRig = buildHiResRig(data);
          // All other ordinary poses are fetched by the actual render path.
          // Preloading every fallback duplicates complete-motion startup RAM.
          for (const corePose of ['idle-open', 'idle-blink', 'talk-closed']) {
            ensureHiResFrame("poses", corePose);
          }
          emit();
          scheduleTick();
          return hiResManifest;
        }
      } catch {
        // Fallback to indexed sheet silently
      } finally {
        hiResManifestPromise = null;
      }
      return null;
    })();
    return hiResManifestPromise;
  }

  function warpHiResPose(poseId, poseEntry, motion = {}) {
    if (poseId.startsWith('emotion-')) return poseEntry.canvas;
    if (!poseEntry?.rgba32 || !hiResRig || typeof document === "undefined") return poseEntry?.canvas || null;
    const earL = motion.earLeft || 0;
    const earR = motion.earRight || 0;
    const pawL = motion.pawLeft || 0;
    const pawR = motion.pawRight || 0;
    const waveAmt = motion.wave || 0;
    const listenPh = motion.listenPhase;
    const pokeSq = motion.pokeSquash || 0;
    const pokeTilt = motion.pokeCheekTilt || 0;

    if (!earL && !earR && !pawL && !pawR && !waveAmt && listenPh === undefined && !pokeSq && !pokeTilt) {
      return poseEntry.canvas;
    }

    const recipe = `${poseId}:${earL},${earR},${pawL},${pawR},${waveAmt},${listenPh ?? "-"},${pokeSq},${pokeTilt}`;
    if (hiResWarpedBitmaps.has(recipe)) {
      const hit = hiResWarpedBitmaps.get(recipe);
      hiResWarpedBitmaps.delete(recipe);
      hiResWarpedBitmaps.set(recipe, hit);
      return hit;
    }

    const width = poseEntry.width;
    const height = poseEntry.height;
    const source = poseEntry.rgba32;
    let warped = source.slice();

    const warpRegion = (ear, amount, kind) => {
      if (!amount) return;
      const [px, py] = ear.pivot;
      for (const { x, y, weight } of ear.points) {
        let sx;
        let sy;
        if (kind === "paw") {
          sx = x;
          sy = Math.round(y - amount * (ear.amplitude ?? Math.max(1, height / 120)) * weight);
        } else {
          const a = -amount * (ear.angle ?? (kind === "wave" ? 5 : Math.max(1.2, 288 / height))) * (Math.PI / 180) * weight;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          sx = Math.round((x - px) * cos - (y - py) * sin + px);
          sy = Math.round((x - px) * sin + (y - py) * cos + py);
        }
        if (
          sx >= 0 &&
          sx < width &&
          sy >= 0 &&
          sy < height &&
          (inside(sx, sy, ear.polygon) || edgeDistance(sx, sy, ear.polygon) <= ear.padding)
        ) {
          warped[y * width + x] = source[sy * width + sx];
        }
      }
    };

    const listening = listenPh !== undefined;
    (listening ? hiResRig.listenEars : hiResRig.ears).forEach((ear, i) =>
      warpRegion(ear, i ? earR : earL, "ear")
    );
    if (!listening) {
      hiResRig.paws.forEach((paw, i) => warpRegion(paw, i ? pawR : pawL, "paw"));
    }
    hiResRig.waves.forEach((w) => warpRegion(w, waveAmt, "wave"));

    if (listening && hiResRig.listenHead.length) {
      const phase = (listenPh / 24) * TAU;
      const nod = Math.max(0, Math.sin(phase)) ** 2;
      const unit = width / 640;
      const before = warped;
      const nodded = before.slice();
      for (const head of hiResRig.listenHead) {
        for (const { x, y, weight } of head.points) {
          const a = nod * 0.5 * (Math.PI / 180);
          const moveX = (nod * -2 * unit - (y - head.pivot[1]) * a) * weight;
          const moveY = (nod * 7 * unit + (x - head.pivot[0]) * a) * weight;
          const sx = Math.round(x - moveX);
          const sy = Math.round(y - moveY);
          nodded[y * width + x] = sx >= 0 && sx < width && sy >= 0 && sy < height ? before[sy * width + sx] : 0;
        }
      }
      warped = nodded;
    }

    if ((pokeSq || pokeTilt) && hiResRig.pokeFace.length) {
      const before = warped;
      const squeezed = before.slice();
      const smooth = (from, to, val) => {
        const u = Math.max(0, Math.min(1, (val - from) / (to - from)));
        return u * u * (3 - 2 * u);
      };
      for (const face of hiResRig.pokeFace) {
        for (const { x, y, weight } of face.points) {
          const [px, py] = face.pivot;
          const ox = x - px;
          const oy = y - py;
          const cheek =
            weight *
            smooth(py - height * 0.05, py + height * 0.035, y) *
            smooth(width * 0.025, width * 0.09, Math.abs(ox));
          if (!cheek) continue;
          const angle = pokeTilt * (Math.PI / 180);
          const moveX = (ox * 0.055 * pokeSq - oy * angle) * cheek;
          const moveY = (-height * 0.012 * pokeSq + ox * angle) * cheek;
          const sx = Math.round(x - moveX);
          const sy = Math.round(y - moveY);
          squeezed[y * width + x] = sx >= 0 && sx < width && sy >= 0 && sy < height ? before[sy * width + sx] : 0;
        }
      }
      warped = squeezed;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return poseEntry.canvas;
    const outData = ctx2d.createImageData(width, height);
    new Uint32Array(outData.data.buffer).set(warped);
    ctx2d.putImageData(outData, 0, 0);
    hiResWarpedBitmaps.set(recipe, canvas);
    if (hiResWarpedBitmaps.size > 48) {
      hiResWarpedBitmaps.delete(hiResWarpedBitmaps.keys().next().value);
    }
    return canvas;
  }

  function getRawRenderLayer(state = cachedState) {
    if (disposed) return null;
    let visual = state?.visual;
    const snapshot = state?.snapshot;
    if (!visual) return null;
    const approved = state?.approvedMotion;
    if (approved && approved.revision === approvedPlayer.catalog()?.revision) {
      if (state.settings.style !== 'umi' || !approvedMotionKeyboardClip(approved.clipId)) approvedLastHiResLayer = null;
      // No old held pose, per-region rig, or legacy watch/search calibration
      // may run over a complete approved frame, including delayed HD loads.
      lastHiResLayer = null; lastHiResKey = pendingHiResKey = activeHiResFrameKey = activeClipKey = null;
      const entry = state.settings.style === 'umi' ? approvedHiResFrame(approved) : null;
      const next = state.settings.style === 'umi' ? approvedPlayer.nextSelection(approved) : null;
      if (next && (approved.clipId === 'work-enter' || entry || visual.approvedMotion?.clipId === approved.clipId)) approvedHiResFrame(next);
      if (entry) {
        approvedLastHiResLayer = { ...entry, paintRect: approved.clip.paintRect, transform: null, hiRes: true, registered: true,
          approvedClipId: approved.clipId, approvedRevision: approved.revision, displayKey: `approved/${approved.revision}/${approved.clipId}` };
        return approvedLastHiResLayer;
      }
      if (state.settings.style === 'umi' && approvedMotionKeyboardClip(approved.clipId) && approvedMotionKeyboardClip(approvedLastHiResLayer?.approvedClipId) &&
          approvedLastHiResLayer.approvedRevision === approved.revision && visual.approvedMotion?.clipId !== approved.clipId) return approvedLastHiResLayer;
      const bitmap = getBitmap(visual);
      return bitmap ? { bitmap, width: visual.sheet.width, height: visual.sheet.height, transform: null, hiRes: false,
        registered: Boolean(visual.approvedMotion || visual.sheet.approvedStaticRevision),
        displayKey: visual.approvedMotion ? `approved/${visual.approvedMotion.revision}/${visual.approvedMotion.clipId}` : `poses/${visual.frame.id}` } : null;
    }
    approvedLastHiResLayer = null;
    const renderPhase = snapshot?.reaction || (snapshot?.drowsy ? "dozing" : snapshot?.visualPhase || snapshot?.phase);
    const staticAction = state?.settings?.animation === false
      ? renderPhase === "running" ? "watch" : ["searching", "compacting"].includes(renderPhase) ? "search" : null
      : null;
    const sourceSheet = staticAction && sheets.get(state?.settings?.style);
    const staticIndex = sourceSheet?.approvedStaticRevision
      ? sourceSheet.frames.findIndex(frame => frame.id === staticAction) : -1;
    const useApprovedStatic = staticIndex >= 0;
    if (useApprovedStatic) {
      // Sequence aliases may point into a loaded video bank. Select the
      // preserved complete static source by ID, even before its HD load ends.
      visual = { ...visual, sheet: sourceSheet, frameIndex: staticIndex,
        frame: sourceSheet.frames[staticIndex], motion: {},
        cacheKey: `approved-static:${sourceSheet.approvedStaticRevision}:${staticAction}` };
    }

    if (state?.settings?.style === "umi" && hiResManifest) {
      const rawFrameId = String((visual.transitioning ? state?.requestedFace : visual.frame?.id) || snapshot?.face || "idle-open");
      const phase = renderPhase;
      const gesture = state.approvedMotionReady && state.settings.animation === false ? null : state.visualGesture || state.gesture;
      const candidate = gesture && hiResManifest.animations?.gestures?.[gesture.id];
      const gestureVideo = gesture && reviewedHiResGesture(gesture.id, candidate);
      if (gestureVideo) {
        activeClipKey = null;
        const kind = `gesture-${gesture.id}`;
        const frameId = findTimelineFrameId(gestureVideo, gesture.elapsedMs);
        activeHiResFrameKey = `${kind}/${frameId}`;
        ensureHiResFrame(kind, frameId);
        const i = Math.max(0, gestureVideo.ids.indexOf(frameId));
        for (let n=1;n<=6;n++) {
          const next = gestureVideo.ids[i+n]; if (next) ensureHiResFrame(kind,next);
        }
        const frame = hiResFrames.get(`${kind}/${frameId}`);
        if (frame) return rememberHiResLayer({ bitmap:frame.canvas,width:frame.width,height:frame.height,transform:null,hiRes:true,
          stateExpression:gesture.source === 'state' },kind);
        const held = holdHiResLayer(kind); if (held) return held;
      }

      // 1. Check 640x640 timeline animations (watch / search)
      else if (state?.settings?.animation !== false && phase === "running" && rawFrameId.startsWith("watch") && hiResManifest.animations?.watch?.clips?.running) {
        const clip = hiResManifest.animations?.watch?.clips?.running;
        if (clip) {
          if (activeClipKey !== "watch:running") {
            activeClipKey = "watch:running";
            clipStartClock = clockTime;
          }
          const frameId = findTimelineFrameId(clip, clockTime - clipStartClock);
          activeHiResFrameKey = `watch/${frameId}`;
          ensureHiResFrame("watch", frameId);
          const allWatch = hiResManifest.animations?.watch?.frames || [];
          const curIdx = Math.max(0, allWatch.indexOf(frameId));
          for (let i = 1; i <= 6; i++) {
            const nextId = allWatch[(curIdx + i) % allWatch.length];
            if (nextId) ensureHiResFrame("watch", nextId);
          }
          const hit = hiResFrames.get(`watch/${frameId}`);
          if (hit) {
            return rememberHiResLayer({ bitmap: hit.canvas, width: hit.width, height: hit.height, transform: null, hiRes: true }, "watch");
          }
          const held = holdHiResLayer("watch");
          if (held) return held;
        }
      } else if (state?.settings?.animation !== false && ["searching", "compacting"].includes(phase) && rawFrameId.startsWith("search") &&
          (hiResManifest.animations?.search?.clips?.[phase === "compacting" ? "compacting" : "searching"] ||
           hiResManifest.animations?.search?.clips?.searching)) {
        const clipKey = phase === "compacting" ? "compacting" : "searching";
        const clip = hiResManifest.animations?.search?.clips?.[clipKey] || hiResManifest.animations?.search?.clips?.searching;
        if (clip) {
          // Search and compaction are the same complete clip. A truthful
          // activity phase change must not restart its visual sequence clock.
          const fullKey = "search:sequence";
          if (activeClipKey !== fullKey) {
            activeClipKey = fullKey;
            clipStartClock = clockTime;
          }
          const frameId = findTimelineFrameId(clip, clockTime - clipStartClock);
          activeHiResFrameKey = `search/${frameId}`;
          ensureHiResFrame("search", frameId);
          const allSearch = hiResManifest.animations?.search?.frames || [];
          const curIdx = Math.max(0, allSearch.indexOf(frameId));
          for (let i = 1; i <= 6; i++) {
            const nextId = allSearch[(curIdx + i) % allSearch.length];
            if (nextId) ensureHiResFrame("search", nextId);
          }
          const hit = hiResFrames.get(`search/${frameId}`);
          if (hit) {
            return rememberHiResLayer({ bitmap: hit.canvas, width: hit.width, height: hit.height, transform: null, hiRes: true }, "search");
          }
          const held = holdHiResLayer("search");
          if (held) return held;
        }
      } else {
        activeClipKey = null;
        let poseId = useApprovedStatic ? staticAction : rawFrameId;
        if (poseId.startsWith("watch") && !hiResManifest.poses?.includes(poseId))
          poseId = snapshot?.blink ? "watch-blink" : "watch";
        if (poseId.startsWith("search-video-")) poseId = "search";
        activeHiResFrameKey = `poses/${poseId}`;
        ensureHiResFrame("poses", poseId);
        const poseEntry = hiResFrames.get(`poses/${poseId}`);
        if (poseEntry) {
          const m = visual.motion || {};
          const bmp = warpHiResPose(poseId, poseEntry, m);
          const ratio = 640 / (visual.sheet?.width || 240);
          const dx = (m.x || 0) * ratio;
          const dy = (m.y || 0) * ratio;
          const angleRad = ((m.tilt || 0) * 0.32 * Math.PI) / 180;
          const scale = m.scale ?? 1;
          const anchorY = m.scaleAnchorY ?? 0.5;
          const hasTransform = Boolean(dx || dy || angleRad || scale !== 1);
          return rememberHiResLayer({
            bitmap: bmp,
            width: poseEntry.width,
            height: poseEntry.height,
            hiRes: true,
            transform: hasTransform ? { dx, dy, angleRad, scale, anchorY } : null,
          }, `poses/${poseId}`);
        }
        const held = useApprovedStatic ? null : holdHiResLayer(`poses/${poseId}`);
        if (held) return held;
      }
    } else {
      lastHiResLayer = null; lastHiResKey = null; pendingHiResKey = null; activeHiResFrameKey = null;
    }

    const fallbackBmp = getBitmap(visual);
    return fallbackBmp
      ? {
          bitmap: fallbackBmp,
          width: visual.sheet?.width || 240,
          height: visual.sheet?.height || 240,
          transform: null,
          hiRes: false,
          displayKey: `poses/${visual.frame?.id || ''}`,
          // An appended video does not inherit static-source registration.
          registered: Boolean(visual.sheet?.approvedStaticRevision && !String(visual.frame?.id || '').startsWith('gesture-')),
        }
      : null;
  }

  function getRenderLayer(state = cachedState) {
    const layer = getRawRenderLayer(state);
    if (!layer) return null;
    const profile = presentationProfile(state?.settings?.style, String(state?.visual?.frame?.id || ''), layer.displayKey || '',
      layer.registered === true);
    // This uniform display calibration never changes or blends source pixels.
    // Scale/anchor are fixed from the first frame. Only a mild single-image
    // fade runs at family changes; video frames are never blended together.
    const display = presentation.sample(state?.settings?.style, profile, clockTime, settings.animation);
    if (display.transitioning) scheduleTick();
    return { ...layer, display };
  }

  function buildSnapshot() {
    advanceClock();
    if (!approvedHiResActive() && approvedHiResClips.size) clearApprovedHiRes();
    const rawSnap = localizeSnapshot(activity.snapshot(), settings.language);
    const snapshot = withResponseLatency(rawSnap, responseLatency.snapshot(), settings.language);
    const pet = companion.tick({ mode: settings.companionship, enabled: settings.enabled,
      visible: awayAt === null && (typeof document === "undefined" || !document.hidden),
      minimized: ui.minimized, animation: settings.animation,
      busy: snapshot.busy, phase: snapshot.phase, reaction: snapshot.reaction, demo: snapshot.demo || Boolean(snapshot.gestureMode) });
    let sheet = sheets.get(settings.style) || seedForStyle(settings.style);
    let visual = null;
    let requestedFace = null;
    let activeGesture = null;
    let visualGesture = null;
    let approvedMotion = null;
    if (sheet) {
      let face = snapshot.face;
      const activePhase = snapshot.reaction || (snapshot.drowsy ? "dozing" : snapshot.visualPhase || snapshot.phase);
      const phaseBlink = { thinking: "think-blink", success: "happy-blink", waiting: "wait-blink" };
      if (snapshot.blink && phaseBlink[activePhase]) face = phaseBlink[activePhase];
      if (snapshot.blink && (face === "work" || face === "idle-blink" && ["reading", "editing"].includes(activePhase)) &&
          sheet.ids["work-blink"] !== undefined) face = "work-blink";
      if (snapshot.blink && face === "concern" && sheet.ids["concern-blink"] !== undefined) face = "concern-blink";
      if (snapshot.blink && face === "idle-open") face = "idle-blink";
      const petGesture = pet?.gestureId ? gestureAt(pet.gestureId, clockTime - pet.startedAt, currentGestureDurations()) : null;
      const gesture = snapshot.gesture || petGesture;
      activeGesture = gesture;
      approvedMotion = approvedPlayer.sample(snapshot, { style: settings.style, animate: settings.animation,
        enabled: FULL_ANIMATION_EDITION && settings.enabled, gesture });
      const stateVideo = gesture ? null : stateExpressionVideo(snapshot, sheet.gestureCatalog);
      const candidate = gesture || stateVideo;
      const approvedStyle = FULL_ANIMATION_EDITION && approvedMotionStyle(settings.style) && approvedPlayer.catalog();
      if (candidate && !approvedMotion && (settings.animation || !approvedStyle)) sheet = sheetForGesture(sheet, candidate.id);
      const stateVideoReady = stateVideo && (sheet.motion?.gestureVideos?.[stateVideo.id] ||
        settings.style === 'umi' && reviewedHiResGesture(stateVideo.id, hiResManifest?.animations?.gestures?.[stateVideo.id]));
      visualGesture = gesture || (stateVideoReady ? stateVideo : null);
      if (visualGesture) {
        face = visualGesture.face;
        if (snapshot.blink && face === "happy") face = "happy-blink";
        if (snapshot.blink && face === "idle-open") face = "idle-blink";
      }
      face = expressionFaceFor(sheet, face, { ...snapshot, gesture });
      if (!(face in sheet.ids)) face = "idle-open" in sheet.ids ? "idle-open" : Object.keys(sheet.ids)[0];
      requestedFace = face;
      const motionOptions = {
        animate: settings.animation || snapshot.reaction === "poked",
        phase: snapshot.reaction || (snapshot.drowsy ? "dozing" : snapshot.visualPhase || snapshot.phase),
        blink: snapshot.blink,
        reactionElapsedMs: snapshot.reactionElapsedMs,
        reactionStrength: snapshot.reactionStrength,
        gesture: visualGesture,
      };
      visual = approvedStyle && !settings.animation && snapshot.reaction !== 'poked'
        ? approvedMotionStaticFrame(sheet, sheet.ids[face] ?? 0, motionOptions)
        : approvedPlayer.indexedFrame(approvedMotion, settings.style) || (approvedMotionKeyboardClip(approvedMotion?.clipId)
          ? approvedMotionStaticFrame(sheet, sheet.ids['idle-open'] ?? 0, { phase: 'idle' }) : player.frame(sheet, sheet.ids[face] ?? 0, motionOptions));
      if (approvedStyle && snapshot.reaction === 'poked') visual = approvedMotionPokeFrame(visual, snapshot.reactionElapsedMs, snapshot.reactionStrength);
    }
    if (!approvedMotion && approvedHiResClips.size) clearApprovedHiRes();
    cachedState = {
      revision: ++revision,
      settings,
      ui,
      snapshot,
      visual,
      requestedFace,
      gesture: activeGesture,
      visualGesture,
      approvedMotion,
      approvedMotionReady: Boolean(FULL_ANIMATION_EDITION && approvedMotionStyle(settings.style) && approvedPlayer.catalog() && Object.keys(approvedPlayer.catalog().clips).length),
      styleLoaded: sheets.has(settings.style),
      hiResReady: Boolean(hiResManifest),
      pet,
    };
    return cachedState;
  }

  function emit() {
    if (disposed) return;
    buildSnapshot();
    for (const listener of listeners) {
      try { listener(); } catch { /* Keep other listeners alive */ }
    }
  }

  function scheduleTick() {
    const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; timerDueAt = Infinity; };
    if (disposed) { cancelTimer(); return; }
    const visible = typeof document === "undefined" || !document.hidden;
    const anySurfaceActive = settings.enabled; // Static branding/settings subscribers never keep a pet animation timer alive.
    if (!visible || !anySurfaceActive) { cancelTimer(); return; }
    const state = cachedState || buildSnapshot();
    if (!settings.animation && !activity.isPoked() && !responseLatency.isWaiting()) { cancelTimer(); return; }
    const phase = state.snapshot?.visualPhase || state.snapshot?.phase;
    const isHiResClip = settings.style === "umi" && hiResManifest &&
      (state.visualGesture || phase === "running" || phase === "searching" || phase === "compacting");
    const waitMs = state.approvedMotion
      ? Math.max(1, Math.min(settings.style === 'umi' ? state.approvedMotion.transition ? 1000 / 60 : 33 : state.approvedMotion.transition ? 50 : 1000 / 12,
        settings.style === 'umi' ? state.approvedMotion.nextInMs : state.visual?.nextInMs || 1000 / 12))
      : isHiResClip || presentation.transitioning(clockTime) ? 33 : state.pet || state.visualGesture ? 50 : Math.max(50, Math.min(250, state.snapshot?.intervalMs || 120));
    const dueAt = now() + waitMs;
    // Image readiness and token bursts may request an earlier frame, but never
    // postpone an already scheduled display deadline until after the handoff.
    if (timer !== null && timerDueAt <= dueAt) return;
    cancelTimer(); timerDueAt = dueAt;
    timer = setTimeout(() => {
      timer = null; timerDueAt = Infinity;
      emit(); scheduleTick();
    }, waitMs);
  }

  async function ensureSheet(styleInput = settings.style) {
    const style = normalizeDshStyle(styleInput) || "umi";
    if (style === "umi") void ensureHiResManifest();
    if (sheets.has(style)) return sheets.get(style);
    if (loadingStyles.has(style)) return loadingStyles.get(style);
    if (typeof fetchImpl !== "function") return seedForStyle(style);

    const promise = (async () => {
      try {
        const res = await fetchImpl(`${SHEET_API_PATH}?style=${encodeURIComponent(style)}&v=${DSH_ASSET_REVISION}`, {
          credentials: "same-origin", cache: "no-store",
        });
        if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`);
        const raw = await res.json();
        const decoded = decodeSheet(raw);
        if (decoded) {
          decoded.gestureCatalog = normalizeGestureVideoCatalog(raw.gestureCatalog);
          sheets.set(style, decoded);
          emit();
          scheduleTick();
          return decoded;
        }
      } catch {
        // Fallback to seed sheet silently
      } finally {
        loadingStyles.delete(style);
      }
      return seedForStyle(style);
    })();
    loadingStyles.set(style, promise);
    return promise;
  }

  async function ensureApprovedCatalog() {
    if (!FULL_ANIMATION_EDITION) return null;
    if (approvedPlayer.catalog()) return approvedPlayer.catalog();
    if (approvedCatalogPromise) return approvedCatalogPromise;
    if (typeof fetchImpl !== 'function') return null;
    approvedCatalogPromise = (async () => {
      try {
        const response = await fetchImpl(`${APPROVED_MOTION_CATALOG_API_PATH}?v=${DSH_ASSET_REVISION}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!response?.ok) return null;
        const raw = await response.json();
        if (disposed) return null;
        const catalog = approvedPlayer.setCatalog(raw);
        if (catalog) { emit(); scheduleTick(); }
        return catalog;
      } catch { return null; }
    })();
    return approvedCatalogPromise;
  }

  async function loadHostConfig() {
    if (typeof fetchImpl !== "function") return settings;
    try {
      const res = await fetchImpl(CONFIG_API_PATH, { credentials: "same-origin" });
      if (!res || !res.ok) return settings;
      const data = await res.json();
      if (data && typeof data === "object") {
        applySettingsLocal(data);
        void ensureSheet(settings.style);
      }
    } catch { /* Offline or standalone preview fallback */ }
    return settings;
  }

  function applySettingsLocal(patch = {}) {
    if (!patch || typeof patch !== "object") return settings;
    const next = { ...settings };
    for (const key of ["enabled", "heroMark", "animation", "persona"]) {
      if (typeof patch[key] === "boolean") next[key] = patch[key];
    }
    for (const key of ["name", "subtitle"]) {
      if (typeof patch[key] === "string" && patch[key].trim()) next[key] = patch[key].trim().slice(0, 120);
    }
    if (["off", "gentle", "lively"].includes(patch.companionship)) next.companionship = patch.companionship;
    if (normalizeDshStyle(patch.style)) next.style = normalizeDshStyle(patch.style);
    if (SIZES.includes(patch.size)) next.size = patch.size;
    const nextScale = clampScaleValue(patch.scale);
    if (nextScale !== null) next.scale = nextScale;
    if (["auto", "always", "off"].includes(patch.bubbleMode)) next.bubbleMode = patch.bubbleMode;
    if (normalizeLanguage(patch.language)) next.language = normalizeLanguage(patch.language);
    settings = Object.freeze(next);
    writeLocalJson(SETTINGS_STORAGE_KEY, settings);
    syncVoiceLanguage();
    emit();
    for (const listener of settingsListeners) { try { listener(); } catch { /* Independent settings listeners. */ } }
    scheduleTick();
    return settings;
  }

  async function updateSettings(patch = {}) {
    applySettingsLocal(patch);
    if (patch.style) void ensureSheet(settings.style);
    if (typeof fetchImpl === "function") {
      try {
        const res = await fetchImpl(CONFIG_API_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res && res.ok) {
          const confirmed = await res.json();
          if (confirmed && typeof confirmed === "object") applySettingsLocal(confirmed);
        }
      } catch { /* Keep local state when Host is unreachable */ }
    }
    return settings;
  }

  function setScale(nextScale, { persist = true } = {}) {
    const clamped = clampScaleValue(nextScale) ?? 1;
    if (persist) return updateSettings({ scale: clamped });
    return applySettingsLocal({ scale: clamped });
  }

  function zoomBy(delta = 0.15) {
    const current = clampScaleValue(settings.scale) ?? 1;
    return updateSettings({ scale: clampScaleValue(current + delta) ?? 1 });
  }

  function updateUi(patch = {}) {
    const next = { ...ui, ...patch };
    if (typeof next.xRatio === "number") next.xRatio = Math.max(0.02, Math.min(0.96, next.xRatio));
    if (typeof next.yRatio === "number") next.yRatio = Math.max(0.04, Math.min(0.94, next.yRatio));
    next.minimized = Boolean(next.minimized);
    next.bubbleMuted = Boolean(next.bubbleMuted);
    ui = Object.freeze(next);
    writeLocalJson(UI_STORAGE_KEY, ui);
    emit();
    return ui;
  }

  function getBitmap(visual) {
    if (!visual?.sheet || typeof document === "undefined") return null;
    const key = `${settings.style}:${visual.cacheKey}`;
    if (bitmaps.has(key)) return bitmaps.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = visual.sheet.width;
    canvas.height = visual.sheet.height;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return null;
    const imageData = ctx2d.createImageData(canvas.width, canvas.height);
    const pixels = visual.sheet.frames[visual.frameIndex].pixels;
    const palette = visual.sheet.palette;
    const transparent = visual.sheet.transparentIndex ?? 0;
    for (let i = 0; i < pixels.length; i++) {
      const colorIndex = pixels[i];
      if (colorIndex !== transparent && palette[colorIndex]) {
        const rgb = palette[colorIndex];
        const offset = i * 4;
        imageData.data[offset] = rgb[0];
        imageData.data[offset + 1] = rgb[1];
        imageData.data[offset + 2] = rgb[2];
        imageData.data[offset + 3] = 255;
      }
    }
    ctx2d.putImageData(imageData, 0, 0);
    bitmaps.set(key, canvas);
    if (bitmaps.size > 64) bitmaps.delete(bitmaps.keys().next().value);
    return canvas;
  }

  buildSnapshot();

  return {
    activity,
    responseLatency,
    bridge,
    player,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) scheduleTick();
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeSettings(listener) {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    getSnapshot() {
      return cachedState || buildSnapshot();
    },
    async init() {
      await loadHostConfig();
      if (settings.style === "umi") void ensureHiResManifest();
      void ensureApprovedCatalog();
      await ensureSheet(settings.style);
      scheduleTick();
      return cachedState || buildSnapshot();
    },
    ensureSheet,
    ensureHiResManifest,
    ensureApprovedCatalog,
    applySettingsLocal,
    updateSettings,
    setScale,
    zoomBy,
    updateUi,
    resetPosition() {
      updateUi({ xRatio: defaultUi.xRatio, yRatio: defaultUi.yRatio, minimized: false });
      return updateSettings({ scale: 1 });
    },
    petStroke(x, allowed = true) {
      const s = cachedState || buildSnapshot();
      if (companion.stroke(x, { busy: s.snapshot.busy, allowed: allowed && settings.enabled && settings.animation && !ui.minimized && !s.snapshot.demo })) {
        emit(); scheduleTick();
      }
    },
    petLeave() { companion.leave(); },
    petPresence(visible) {
      if (!visible) { if (awayAt === null) awayAt = now(); companion.interrupt(); }
      else {
        const s = cachedState || buildSnapshot();
        if (awayAt !== null) companion.returned({ awayMs: now() - awayAt,
          allowed: settings.companionship !== "off" && settings.enabled && settings.animation && !ui.minimized && !s.snapshot.busy && !s.snapshot.demo && s.snapshot.phase === "idle" });
        awayAt = null;
      }
      emit(); scheduleTick();
    },
    petInterrupt() { companion.interrupt(); emit(); },
    poke() {
      companion.interrupt();
      advanceClock();
      activity.poke();
      emit();
      scheduleTick();
    },
    playGesture(mode = "all") {
      companion.interrupt(); advanceClock();
      const accepted = activity.playGesture(mode);
      emit(); scheduleTick(); return accepted;
    },
    setDemo(mode = "all") {
      advanceClock();
      activity.setDemo(mode);
      emit();
      scheduleTick();
    },
    cycleStyle() {
      const idx = DSH_STYLES.indexOf(settings.style);
      const nextStyle = DSH_STYLES[(idx + 1) % DSH_STYLES.length];
      return updateSettings({ style: nextStyle });
    },
    cycleBubbleMode() {
      const order = ["auto", "always", "off"];
      const current = order.includes(settings.bubbleMode) ? settings.bubbleMode : "auto";
      const nextMode = order[(order.indexOf(current) + 1) % order.length];
      updateUi({ bubbleMuted: nextMode === "off" });
      return updateSettings({ bubbleMode: nextMode });
    },
    getBitmap,
    getRenderLayer,
    cacheStats() { return { gestureClips: gestureClipSheets.size, maxGestureClips: 2, gestureDownloads: loadingGestureClips.size,
      hiResFrames: hiResFrames.size, maxHiResFrames: HIRES_CACHE_LIMIT, approved: approvedPlayer.stats(),
      approvedHiResClips: approvedHiResClips.size, maxApprovedHiResClips: 2,
      approvedHiResFrames: [...approvedHiResClips.values()].reduce((n, bank) => n + bank.frames.size, 0),
      approvedHiResBytes: approvedHiResBytes(), maxApprovedHiResBytes: approvedHiResByteLimit,
      approvedHiResDownloads: [...approvedHiResClips.values()].reduce((n, bank) => n + bank.loading.size, 0),
      maxApprovedHiResDownloadsPerClip: 4 }; },
    notifyChange() {
      emit();
      scheduleTick();
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      listeners.clear(); settingsListeners.clear();
      bitmaps.clear();
      hiResWarpedBitmaps.clear();
      for (const entry of hiResFrames.values()) releaseHiResEntry(entry);
      hiResFrames.clear(); hiResLoadingFrames.clear();
      for (const request of loadingGestureClips.values()) request.abort?.();
      loadingGestureClips.clear(); gestureClipSheets.clear(); sheets.clear(); rejectedGestureClips.clear();
      lastHiResLayer = null;
      approvedPlayer.dispose();
      clearApprovedHiRes();
      presentation.reset(); player.dispose();
    },
  };
}

export function createMascotComponents(React, controller) {
  const h = React.createElement;

  function useMascotState() {
    return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  }

  function MascotCanvas({ size = 196, title, onClick, className = "", desktop = false } = {}) {
    const state = useMascotState();
    const canvasRef = React.useRef(null);
    const isPixel = state.settings.style === "umi-pixel" || state.settings.style === "pixel";
    const dpr = typeof window !== "undefined" ? Math.min(2.5, Math.max(1, Number(window.devicePixelRatio) || 1)) : 1;
    const calibrated = desktop && ['umi', 'umi-pixel'].includes(state.settings.style);
    const paint = petPaintGeometry(size, calibrated, state.approvedMotionReady);
    const baseEdge = state.settings.style === "umi" && (state.hiResReady || state.approvedMotionReady) ? 640 : state.visual?.sheet?.width || 240;
    const unitBuffer = isPixel ? size : Math.max(baseEdge, Math.round(size * dpr));
    const bufferWidth = Math.round(unitBuffer * paint.widthRatio), bufferHeight = Math.round(unitBuffer * paint.heightRatio);
    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !state.visual) return;
      const layer = controller.getRenderLayer ? controller.getRenderLayer(state) : { bitmap: controller.getBitmap(state.visual) };
      if (!layer?.bitmap) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.imageSmoothingEnabled = !isPixel;
      ctx2d.imageSmoothingQuality = "high";
      const unit = canvas.width / (paint.widthRatio * 640);
      ctx2d.save();
      ctx2d.scale(unit, unit);
      ctx2d.translate(paint.insetX * 640, paint.insetY * 640);
      if (calibrated && layer.display) {
        ctx2d.translate(layer.display.x, layer.display.y);
        ctx2d.scale(layer.display.scale, layer.display.scale);
        ctx2d.globalAlpha = layer.display.opacity ?? 1;
      }
      if (layer.transform) {
        const { dx, dy, angleRad, scale, anchorY } = layer.transform;
        const ratio = 640 / (layer.width || 640), cx = 320, cy = 640 * (anchorY ?? 0.5);
        ctx2d.translate(cx + dx * ratio, cy + dy * ratio);
        if (angleRad) ctx2d.rotate(angleRad);
        if (scale && scale !== 1) ctx2d.scale(scale, scale);
        ctx2d.drawImage(layer.bitmap, -cx, -cy, 640, 640);
      } else if (layer.paintRect) {
        const rect = layer.paintRect;
        ctx2d.drawImage(layer.bitmap, rect.x, rect.y, rect.width, rect.height);
      } else ctx2d.drawImage(layer.bitmap, 0, 0, 640, 640);
      ctx2d.restore();
    }, [state.revision, state.visual, state.settings.style, size, bufferWidth, bufferHeight, isPixel, calibrated]);
    return h("canvas", {
      ref: canvasRef, width: bufferWidth, height: bufferHeight, title, onClick,
      className: `furry-dsh-canvas${isPixel ? " is-pixel" : ""}${className ? ` ${className}` : ""}`,
      style: { width: `${paint.width}px`, height: `${paint.height}px`,
        ...(calibrated ? { position: 'absolute', left: `${paint.left}px`, top: `${paint.top}px`, pointerEvents: 'none' } : {}) },
    });
  }

  function FloatingMascotOverlay(props) {
    const state = useMascotState();
    const { settings, ui, snapshot } = state;
    const isEn = resolveLanguage(settings.language) === "en";
    const t = (zh, en) => (isEn ? en : zh);

    // Optional root-level session status hook from shell.overlay props
    const useSessions = props?.useSessions;
    const useSessionStatus = props?.useSessionStatus;
    const activeId = typeof useSessions === "function" ? useSessions((s) => s?.activeId) : undefined;
    const rootStatus = typeof useSessionStatus === "function" && activeId ? useSessionStatus(activeId) : undefined;

    React.useEffect(() => {
      if (!activeId && !rootStatus) return;
      const statusText = typeof rootStatus === "string" ? rootStatus : rootStatus?.status;
      if (statusText) {
        controller.bridge.syncConversationState({
          sessionId: activeId,
          status: statusText,
        });
        controller.notifyChange();
      }
    }, [activeId, rootStatus]);

    const [viewport, setViewport] = React.useState(() => ({
      w: typeof window !== "undefined" ? window.innerWidth || 1280 : 1280,
      h: typeof window !== "undefined" ? window.innerHeight || 800 : 800,
    }));
    const [dragging, setDragging] = React.useState(false);
    const [resizing, setResizing] = React.useState(false);
    const [zoomHudVisible, setZoomHudVisible] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState(null);
    const dragRef = React.useRef(null);
    const resizeRef = React.useRef(null);
    const zoomHudTimerRef = React.useRef(null);
    const menuRef = React.useRef(null);

    const flashZoomHud = () => {
      setZoomHudVisible(true);
      if (zoomHudTimerRef.current) clearTimeout(zoomHudTimerRef.current);
      zoomHudTimerRef.current = setTimeout(() => {
        setZoomHudVisible(false);
      }, 1100);
    };

    React.useEffect(() => {
      if (typeof window === "undefined") return undefined;
      const onBlur = () => controller.petPresence(false);
      const onFocus = () => { if (typeof document === "undefined" || !document.hidden) controller.petPresence(true); };
      const onVisibility = () => controller.petPresence(!document.hidden);
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }, []);

    React.useEffect(() => {
      if (typeof window === "undefined") return undefined;
      const onResize = () => setViewport({ w: window.innerWidth || 1280, h: window.innerHeight || 800 });
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    React.useEffect(() => {
      if (!menuPos || typeof window === "undefined") return undefined;
      const onPointerDownDoc = (event) => {
        if (menuRef.current && typeof menuRef.current.contains === "function" && menuRef.current.contains(event.target)) {
          return;
        }
        setMenuPos(null);
      };
      const onKeyDownDoc = (event) => {
        if (event.key === "Escape") setMenuPos(null);
      };
      window.addEventListener("pointerdown", onPointerDownDoc, true);
      window.addEventListener("keydown", onKeyDownDoc);
      return () => {
        window.removeEventListener("pointerdown", onPointerDownDoc, true);
        window.removeEventListener("keydown", onKeyDownDoc);
      };
    }, [menuPos]);

    if (!settings.enabled) return null;

    const basePx = SIZE_PIXELS[settings.size] || SIZE_PIXELS.normal;
    const scaleVal = clampScaleValue(settings.scale) ?? 1;
    const scalePercent = Math.round(scaleVal * 100);
    const placement = floatingPetGeometry(resolveMascotPixels(settings), viewport, ui, ['umi', 'umi-pixel'].includes(settings.style), state.approvedMotionReady);
    const canvasPx = placement.size;
    const boxSize = ui.minimized ? 44 : canvasPx;
    const left = Math.round(placement.left);
    const top = Math.round(placement.top);
    const bubbleSide = ui.xRatio > 0.52 ? "side-left" : "side-right";

    const onContextMenu = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const menuW = 244;
      const menuH = Math.min(500, viewport.h - 24);
      const rawX = event.clientX || left;
      const rawY = event.clientY || top;
      const x = Math.max(10, Math.min(viewport.w - menuW - 10, rawX));
      const y = Math.max(10, Math.min(viewport.h - menuH - 10, rawY));
      setMenuPos({ x, y });
    };

    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target?.closest?.(".furry-dsh-resize-handle") || event.target?.closest?.(".furry-dsh-context-menu")) return;
      if (menuPos) setMenuPos(null);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: left,
        startTop: top,
        moved: false,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag && !resizing && !menuPos && !ui.minimized) {
        const rect = event.currentTarget.getBoundingClientRect?.();
        const withinHead = rect && event.clientY >= rect.top + rect.height * 0.12 && event.clientY < rect.top + rect.height * 0.60;
        controller.petStroke(event.clientX, Boolean(withinHead));
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) >= 6) {
        drag.moved = true;
        controller.petInterrupt();
        setDragging(true);
      }
      if (drag.moved) {
        const availW = Math.max(1, viewport.w - boxSize);
        const availH = Math.max(1, viewport.h - boxSize);
        const nextX = (drag.startLeft + dx) / availW;
        const nextY = (drag.startTop + dy) / availH;
        controller.updateUi({ xRatio: nextX, yRatio: nextY });
      }
    };

    const onPointerUp = (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      if (!drag.moved) {
        if (ui.minimized) {
          controller.updateUi({ minimized: false });
        } else {
          controller.poke();
        }
      }
    };

    const onResizePointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.stopPropagation?.();
      resizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPx: canvasPx,
        basePx,
        lastScale: scaleVal,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const onResizePointerMove = (event) => {
      const rz = resizeRef.current;
      if (!rz || rz.pointerId !== event.pointerId) return;
      event.stopPropagation?.();
      const delta = Math.round((event.clientX - rz.startX + (event.clientY - rz.startY)) * 0.65);
      const nextPx = Math.max(72, Math.min(600, rz.startPx + delta));
      const nextScale = clampScaleValue(nextPx / rz.basePx) ?? 1;
      rz.lastScale = nextScale;
      controller.setScale(nextScale, { persist: false });
    };

    const onResizePointerUp = (event) => {
      const rz = resizeRef.current;
      if (!rz || rz.pointerId !== event.pointerId) return;
      event.stopPropagation?.();
      resizeRef.current = null;
      setResizing(false);
      controller.setScale(rz.lastScale, { persist: true });
    };

    const onWheel = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const step = event.deltaY < 0 ? 0.1 : -0.1;
      controller.zoomBy(step);
      flashZoomHud();
    };

    const onPointerCancel = () => {
      dragRef.current = null;
      const resize = resizeRef.current;
      resizeRef.current = null;
      setDragging(false); setResizing(false);
      controller.petLeave();
      if (resize) controller.setScale(resize.startPx / resize.basePx, { persist: false });
    };

    const bubbleModeLabel =
      settings.bubbleMode === "always"
        ? t("始终显示", "Always")
        : settings.bubbleMode === "off" || ui.bubbleMuted
        ? t("已关闭", "Off")
        : t("互动/工作时", "Auto");

    const contextMenuNode = menuPos
      ? h(
          "div",
          {
            ref: menuRef,
            className: "furry-dsh-context-menu",
            style: { left: `${menuPos.x}px`, top: `${menuPos.y}px` },
            onContextMenu: (e) => e.preventDefault?.(),
          },
          h(
            "div",
            { className: "furry-dsh-menu-header" },
            h("span", null, `🐾 ${settings.name || "呜咪"} · ${snapshot.label}`),
            h("span", null, `${canvasPx}px (${scalePercent}%)`)
          ),
          h(
            "div",
            { className: "furry-dsh-menu-zoom-box" },
            h(
              "div",
              { className: "furry-dsh-menu-zoom-row" },
              h(
                "button",
                {
                  type: "button",
                  className: "furry-dsh-zoom-btn",
                  onClick: () => controller.zoomBy(-0.15),
                  title: t("缩小 (-15%)", "Zoom out (-15%)"),
                },
                "➖"
              ),
              h("input", {
                type: "range",
                className: "furry-dsh-zoom-slider",
                min: 40,
                max: 300,
                step: 5,
                value: scalePercent,
                onChange: (e) => controller.setScale(Number(e.target.value) / 100, { persist: true }),
              }),
              h(
                "button",
                {
                  type: "button",
                  className: "furry-dsh-zoom-btn",
                  onClick: () => controller.zoomBy(0.15),
                  title: t("放大 (+15%)", "Zoom in (+15%)"),
                },
                "➕"
              )
            ),
            h(
              "div",
              { className: "furry-dsh-menu-presets" },
              [
                ["small", t("紧凑", "S")],
                ["normal", t("标准", "M")],
                ["large", t("原画", "L")],
                ["xlarge", t("超大", "XL")],
              ].map(([sizeId, label]) =>
                h(
                  "button",
                  {
                    key: sizeId,
                    type: "button",
                    className: `furry-dsh-menu-preset-btn${settings.size === sizeId && scalePercent === 100 ? " is-active" : ""}`,
                    onClick: () => controller.updateSettings({ size: sizeId, scale: 1 }),
                  },
                  label
                )
              )
            )
          ),
          h("div", { className: "furry-dsh-menu-divider" }),
          h("div", { className: "furry-dsh-chip-row", style: { padding: "6px" } },
            ...["wave", "shy", "affection", "proud"].map(id => {
              const gesture = gestureById(id);
              return h("button", { key: id, type: "button", className: "furry-dsh-chip",
                disabled: snapshot.busy || snapshot.phase !== "idle" || Boolean(snapshot.reaction) || snapshot.demo,
                title: t("空闲时陪你玩一下", "Play when I'm free"),
                onClick: () => { controller.playGesture(id); setMenuPos(null); } }, gesture.labels[isEn ? 1 : 0]);
            }),
            h("button", { type: "button", className: "furry-dsh-chip",
              disabled: snapshot.busy || snapshot.phase !== "idle" || Boolean(snapshot.reaction) || snapshot.demo,
              onClick: () => { controller.playGesture(snapshot.gestureMode ? "off" : "all"); setMenuPos(null); } },
              snapshot.gestureMode ? t("先歇会儿", "Rest") : t("轮流演给我看", "Show all"))),
          h(
            "button",
            {
              type: "button",
              className: "furry-dsh-menu-item",
              onClick: () => {
                controller.poke();
                setMenuPos(null);
              },
            },
            h("span", null, t("🐾 戳一戳呜咪", "🐾 Poke Umi")),
            h("span", { className: "furry-dsh-menu-badge" }, t("互动", "Poke"))
          ),
          h(
            "button",
            {
              type: "button",
              className: "furry-dsh-menu-item",
              onClick: () => {
                controller.cycleStyle();
              },
            },
            h("span", null, t("🎨 切换画风", "🎨 Switch Style")),
            h(
              "span",
              { className: "furry-dsh-menu-badge" },
              isEn ? STYLE_LABELS[settings.style]?.en || settings.style : STYLE_LABELS[settings.style]?.zh || settings.style
            )
          ),
          h(
            "button",
            {
              type: "button",
              className: `furry-dsh-menu-item${snapshot.demo ? " is-active" : ""}`,
              onClick: () => {
                controller.setDemo(snapshot.demo ? "off" : "all");
                setMenuPos(null);
              },
            },
            h("span", null, snapshot.demo ? t("⏹ 停止动作巡演", "⏹ Stop Demo Tour") : t("🎭 开启全动作巡演", "🎭 Start Demo Tour")),
            h("span", { className: "furry-dsh-menu-badge" }, snapshot.demo ? "ON" : "OFF")
          ),
          h(
            "button",
            {
              type: "button",
              className: `furry-dsh-menu-item${settings.persona ? " is-active" : ""}`,
              onClick: () => {
                controller.updateSettings({ persona: !settings.persona });
              },
            },
            h("span", null, t("🗣️ 呜咪回答口吻", "🗣️ Umi Persona Voice")),
            h("span", { className: "furry-dsh-menu-badge" }, settings.persona ? "ON" : "OFF")
          ),
          h(
            "button",
            {
              type: "button",
              className: "furry-dsh-menu-item",
              onClick: () => {
                controller.cycleBubbleMode();
              },
            },
            h("span", null, t("💬 对话气泡", "💬 Speech Bubble")),
            h("span", { className: "furry-dsh-menu-badge" }, bubbleModeLabel)
          ),
          h("div", { className: "furry-dsh-menu-divider" }),
          h(
            "button",
            {
              type: "button",
              className: "furry-dsh-menu-item",
              onClick: () => {
                controller.resetPosition();
                setMenuPos(null);
              },
            },
            h("span", null, t("📍 重置默认位置与大小", "📍 Reset Position & Size"))
          ),
          h(
            "button",
            {
              type: "button",
              className: "furry-dsh-menu-item",
              onClick: () => {
                controller.updateUi({ minimized: !ui.minimized });
                setMenuPos(null);
              },
            },
            h("span", null, ui.minimized ? t("🗖 展开桌宠", "🗖 Expand Mascot") : t("🗕 收起为小爪印", "🗕 Minimize to Paw"))
          )
        )
      : null;

    if (ui.minimized) {
      return h(
        "div",
        { className: "furry-dsh-overlay-root" },
        h(
          "div",
          {
            className: `furry-dsh-pet${dragging ? " is-dragging" : ""}`,
            style: { left: `${left}px`, top: `${top}px` },
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onLostPointerCapture: onPointerCancel,
            onContextMenu,
          },
          h(
            "div",
            {
              className: `furry-dsh-minimized${snapshot.busy ? " is-busy" : ""}`,
              title: t("左键展开呜咪 · 右键打开菜单 · 拖动调整位置", "Left-click to expand · Right-click menu · Drag to move"),
            },
            h("span", null, "🐾"),
            h("span", null, snapshot.responseIndicator || snapshot.label)
          )
        ),
        contextMenuNode
      );
    }

    const toolInfo = dshSceneTitle(snapshot, settings.language);
    const pet = state.pet;
    const petText = pet ? pet.lines[isEn ? 1 : 0] : null;
    const showBubble = shouldShowPetBubble(settings, ui, snapshot) || Boolean(petText && !ui.bubbleMuted && settings.bubbleMode !== "off");

    return h(
      "div",
      { className: "furry-dsh-overlay-root" },
      h(
        "div",
        {
          className: `furry-dsh-pet${dragging ? " is-dragging" : ""}${resizing ? " is-resizing" : ""}`,
          style: { left: `${left}px`, top: `${top}px` },
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel,
          onLostPointerCapture: onPointerCancel,
          onContextMenu,
          onWheel,
        },
        h(
          "div",
          { className: "furry-dsh-stage" },
          showBubble
            ? h(
                "div",
                {
                  className: `furry-dsh-bubble ${bubbleSide} tone-${snapshot.color || "accent"}`,
                  lang: snapshot.language || "zh-CN",
                },
                toolInfo ? h("div", { className: "furry-dsh-tag", title: toolInfo }, toolInfo) : null,
                h("div", { className: "furry-dsh-phrase", role: "status" }, petText || snapshot.phrase)
              )
            : null,
          h(
            "div",
            {
              className: "furry-dsh-canvas-wrap",
              style: { width: `${canvasPx}px`, height: `${canvasPx}px` },
              onPointerLeave: () => controller.petLeave(),
              title: t(
                "左键戳一戳 · 按住拖动位置 · 滚轮/右下角缩放 · 右键打开菜单",
                "Click to poke · Drag to move · Wheel/corner to zoom · Right-click menu"
              ),
            },
            h(MascotCanvas, { size: canvasPx, desktop: true }),
            h(
              "div",
              {
                className: "furry-dsh-resize-handle",
                title: t("拖动无级缩放大小 · 双击恢复 100%", "Drag to resize · Double-click to reset 100%"),
                onPointerDown: onResizePointerDown,
                onPointerMove: onResizePointerMove,
                onPointerUp: onResizePointerUp,
                onDoubleClick: (e) => {
                  e.stopPropagation?.();
                  controller.setScale(1, { persist: true });
                },
              },
              "↘"
            ),
            resizing || zoomHudVisible
              ? h("div", { className: "furry-dsh-zoom-badge" }, `${scalePercent}% · ${canvasPx}px`)
              : null
          )
        )
      ),
      contextMenuNode
    );
  }

  function HeroMascotMark(props) {
    // This image has its own reviewed media and loop. It does not subscribe to
    // mascot snapshots, call a motion player, or create an animation timer.
    const edge = Math.max(84, Math.min(320, Number(props?.size) || 84));
    const fallback = `${TITLE_IMAGE_API_PATH}?variant=static`;
    return h('span', { className: `furry-dsh-hero-mark${props?.className ? ` ${props.className}` : ''}` },
      h('picture', null,
        h('source', { media: '(prefers-reduced-motion: reduce)', srcSet: fallback }),
        h('img', { className: 'furry-dsh-hero-image', src: TITLE_IMAGE_API_PATH, alt: 'Umi',
          width: edge, height: edge, draggable: false, decoding: 'async',
          style: { width: `${edge}px`, height: `${edge}px`, objectFit: 'contain' },
          onError: event => {
            const image = event?.currentTarget;
            if (!image || image.dataset?.umiStaticFallback) return;
            if (image.dataset) image.dataset.umiStaticFallback = 'true';
            image.src = fallback;
          },
        })));
  }

  function MascotSettingsPage() {
    const state = useMascotState();
    const { settings, snapshot } = state;
    const isEn = resolveLanguage(settings.language) === "en";
    const t = (zh, en) => (isEn ? en : zh);
    const scaleVal = clampScaleValue(settings.scale) ?? 1;
    const scalePercent = Math.round(scaleVal * 100);
    const actualPx = resolveMascotPixels(settings);

    return h(
      "section",
      { className: "furry-dsh-settings" },
      h(
        "div",
        { className: "furry-dsh-settings-head" },
        h("h2", null, t("呜咪桌宠 · Umi Companion", "Umi Companion · Desktop Mascot")),
        h(
          "p",
          { className: "furry-dsh-settings-note" },
          t(
            "陪伴型编程搭档呜咪（Umi）：实时跟随 DSH 会话状态，支持全局自由拖拽、滚轮/拖拽无级缩放、右键竖排菜单与呜咪回答口吻。",
            "Umi follows your DSH session states in real time, with free drag-and-drop, wheel/corner continuous zoom, right-click vertical menu, and character voice."
          )
        )
      ),
      h(
        "div",
        { className: "furry-dsh-settings-grid" },
        h(
          "div",
          { className: "furry-dsh-card" },
          h("h3", null, t("实时互动预览", "Live Interactive Stage")),
          h(
            "div",
            { className: "furry-dsh-stage-box" },
            h(MascotCanvas, {
              size: 220,
              onClick: () => controller.poke(),
              title: t("点击戳一戳呜咪", "Click to poke Umi"),
            }),
            h(
              "div",
              { style: { textAlign: "center" } },
              h(
                "div",
                { style: { fontWeight: 600, fontSize: "13px", marginBottom: "4px" } },
                `${snapshot.label}`
              ),
              h("div", { className: "furry-dsh-settings-note" }, snapshot.phrase)
            ),
            h(
              "div",
              { className: "furry-dsh-chip-row", style: { justifyContent: "center" } },
              h(
                "button",
                { type: "button", className: "furry-dsh-chip", onClick: () => controller.poke() },
                t("🐾 戳一戳", "🐾 Poke")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: `furry-dsh-chip${snapshot.demoMode === "all" ? " is-active" : ""}`,
                  onClick: () => controller.setDemo(snapshot.demoMode === "all" ? "off" : "all"),
                },
                snapshot.demoMode === "all" ? t("⏹ 停止巡演", "⏹ Stop Tour") : t("🎭 动作巡演", "🎭 Demo Tour")
              ),
              h(
                "button",
                { type: "button", className: "furry-dsh-chip", onClick: () => controller.resetPosition() },
                t("📍 重置位置与大小", "📍 Reset Pos & Size")
              )
            )
          ),
          h("h3", { style: { marginTop: "14px" } }, t("小动作模组 · 两端共用", "Shared gesture modules")),
          h("div", { className: "furry-dsh-chip-row" },
            h("button", { type: "button", className: "furry-dsh-chip", onClick: () => controller.playGesture(snapshot.gestureMode === "all" ? "off" : "all") },
              snapshot.gestureMode === "all" ? t("停止小动作巡演", "Stop gestures") : t("循环全部小动作", "Loop all gestures")),
            ...GESTURES.map((g) => h("button", { key: g.id, type: "button", disabled: snapshot.busy || snapshot.awaitingUser,
              className: `furry-dsh-chip${snapshot.gesture?.id === g.id ? " is-active" : ""}`,
              onClick: () => controller.playGesture(g.id) }, g.labels[isEn ? 1 : 0]))),
          h("h3", { style: { marginTop: "14px" } }, t("点选动作预览", "Preview Poses")),
          h(
            "div",
            { className: "furry-dsh-chip-row" },
            DEMO_STATES.map((pose) => {
              const labelObj = STATE_LABELS[pose] || { zh: pose, en: pose };
              const active = snapshot.demoMode === pose || (!snapshot.demo && snapshot.phase === pose);
              return h(
                "button",
                {
                  key: pose,
                  type: "button",
                  className: `furry-dsh-chip${active ? " is-active" : ""}`,
                  onClick: () => controller.setDemo(snapshot.demoMode === pose ? "off" : pose),
                },
                isEn ? labelObj.en : labelObj.zh
              );
            })
          )
        ),
        h(
          "div",
          null,
          h(
            "div",
            { className: "furry-dsh-card" },
            h("h3", null, t("角色画风与自由缩放", "Character Style & Zoom")),
            h("div", { className: "furry-dsh-settings-note" }, t("选择呜咪的渲染画风：", "Choose sprite style:")),
            h(
              "div",
              { className: "furry-dsh-chip-row" },
              DSH_STYLES.map((styleId) => {
                const label = STYLE_LABELS[styleId] || { zh: styleId, en: styleId };
                return h(
                  "button",
                  {
                    key: styleId,
                    type: "button",
                    className: `furry-dsh-chip${settings.style === styleId ? " is-active" : ""}`,
                    onClick: () => controller.updateSettings({ style: styleId }),
                  },
                  isEn ? label.en : label.zh
                );
              })
            ),
            h(
              "div",
              { className: "furry-dsh-settings-note", style: { marginTop: "12px" } },
              t("基准尺寸档位：", "Base size preset:")
            ),
            h(
              "div",
              { className: "furry-dsh-chip-row" },
              SIZES.map((sizeId) => {
                const label = SIZE_LABELS[sizeId] || { zh: sizeId, en: sizeId };
                return h(
                  "button",
                  {
                    key: sizeId,
                    type: "button",
                    className: `furry-dsh-chip${settings.size === sizeId ? " is-active" : ""}`,
                    onClick: () => controller.updateSettings({ size: sizeId, scale: 1 }),
                  },
                  isEn ? label.en : label.zh
                );
              })
            ),
            h(
              "div",
              { className: "furry-dsh-settings-note", style: { marginTop: "12px" } },
              t(
                `无级缩放比例：${scalePercent}%（当前实际尺寸 ${actualPx}px，也可用鼠标滚轮或拖动桌宠右下角缩放）`,
                `Continuous zoom: ${scalePercent}% (Actual ${actualPx}px — or use mouse wheel / corner handle on pet)`
              )
            ),
            h(
              "div",
              { className: "furry-dsh-menu-zoom-row", style: { marginTop: "8px", maxWidth: "360px" } },
              h(
                "button",
                {
                  type: "button",
                  className: "furry-dsh-chip",
                  onClick: () => controller.zoomBy(-0.15),
                },
                "➖"
              ),
              h("input", {
                type: "range",
                className: "furry-dsh-zoom-slider",
                min: 40,
                max: 300,
                step: 5,
                value: scalePercent,
                onChange: (e) => controller.setScale(Number(e.target.value) / 100, { persist: true }),
              }),
              h(
                "button",
                {
                  type: "button",
                  className: "furry-dsh-chip",
                  onClick: () => controller.zoomBy(0.15),
                },
                "➕"
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "furry-dsh-chip",
                  onClick: () => controller.setScale(1, { persist: true }),
                },
                "100%"
              )
            ),
            h(
              "div",
              { className: "furry-dsh-settings-note", style: { marginTop: "12px" } },
              t("桌宠对话气泡显示策略：", "Speech bubble mode:")
            ),
            h(
              "div",
              { className: "furry-dsh-chip-row" },
              [
                ["auto", t("互动与工作时弹出（推荐）", "On Activity & Poke (Recommended)")],
                ["always", t("始终显示", "Always Show")],
                ["off", t("关闭气泡（纯桌宠）", "Hidden (Pure Mascot)")],
              ].map(([modeId, label]) =>
                h(
                  "button",
                  {
                    key: modeId,
                    type: "button",
                    className: `furry-dsh-chip${(settings.bubbleMode || "auto") === modeId ? " is-active" : ""}`,
                    onClick: () => {
                      controller.updateUi({ bubbleMuted: modeId === "off" });
                      controller.updateSettings({ bubbleMode: modeId });
                    },
                  },
                  label
                )
              )
            ),
            h(
              "div",
              { className: "furry-dsh-settings-note", style: { marginTop: "12px" } },
              t("台词与界面语言：", "Companion language:")
            ),
            h(
              "div",
              { className: "furry-dsh-chip-row" },
              [
                ["auto", t("自动跟随系统", "Auto")],
                ["zh-CN", "简体中文"],
                ["en", "English"],
              ].map(([langId, label]) =>
                h(
                  "button",
                  {
                    key: langId,
                    type: "button",
                    className: `furry-dsh-chip${settings.language === langId ? " is-active" : ""}`,
                    onClick: () => controller.updateSettings({ language: langId }),
                  },
                  label
                )
              )
            )
          ),
          h(
            "div",
            { className: "furry-dsh-card" },
            h("h3", null, t("主动陪伴", "Companion initiative")),
            h("div", { className: "furry-dsh-settings-note" }, t("摸摸头顶会蹭蹭你；空闲时偶尔挥爪、探头，回来时打招呼。工作和提问时不主动打断，不调用模型。", "Stroke Umi’s head for a nuzzle. Occasional idle waves, peeks and welcome-backs; quiet during work and questions. No model requests.")),
            h("div", { className: "furry-dsh-chip-row" },
              [["off", t("安静陪伴", "Quiet")], ["gentle", t("偶尔撒娇", "Gentle")], ["lively", t("活泼一些", "Lively")]].map(([mode, label]) =>
                h("button", { key: mode, type: "button", className: `furry-dsh-chip${(settings.companionship || "gentle") === mode ? " is-active" : ""}`,
                  onClick: () => controller.updateSettings({ companionship: mode }) }, label))),
            h("h3", null, t("展示与角色口吻开关", "Display & Persona Switches")),
            [
              {
                key: "enabled",
                checked: settings.enabled,
                onChange: (val) => controller.updateSettings({ enabled: val }),
                title: t("显示全局可拖拽桌宠", "Show global draggable desktop pet"),
                desc: t("在 DSH 窗口任意位置悬浮陪伴，支持左键戳一戳、滚轮缩放与右键菜单", "Floating companion in shell.overlay with drag, wheel zoom, and right-click menu"),
              },
              {
                key: "persona",
                checked: settings.persona,
                onChange: (val) => controller.updateSettings({ persona: val }),
                title: t("启用呜咪角色口吻", "Enable Umi Persona Voice"),
                desc: t("仅追加中英双语口吻设定，不修改 DSH 原生系统提示词；代码、命令与 JSON 保持严谨准确", "Appends Umi's localized persona section without modifying DSH native system prompt sections"),
              },
              {
                key: "heroMark",
                checked: settings.heroMark,
                onChange: (val) => controller.updateSettings({ heroMark: val }),
                title: t("替换新会话欢迎页图标", "Blank-session Hero mascot"),
                desc: t("在空白新会话标题旁显示独立挥爪图，素材未就绪时使用静态图；不跟随桌宠状态", "Independent waving title image with a static fallback; does not follow pet activity"),
              },
              {
                key: "animation",
                checked: settings.animation,
                onChange: (val) => controller.updateSettings({ animation: val }),
                title: t("启用呼吸、眨眼与微动作动画", "Enable micro-motion & frame animation"),
                desc: t("关闭后保持静态表情，仅在阶段切换或被戳一戳时更新画面", "When off, freezes idle motion while keeping phase changes and poke reactions active"),
              },
            ].map((item) =>
              h(
                "label",
                { key: item.key, className: "furry-dsh-toggle-row" },
                h(
                  "div",
                  null,
                  h("div", { className: "furry-dsh-toggle-title" }, item.title),
                  h("div", { className: "furry-dsh-toggle-desc" }, item.desc)
                ),
                h("input", {
                  type: "checkbox",
                  checked: Boolean(item.checked),
                  onChange: (e) => item.onChange(Boolean(e.target.checked)),
                })
              )
            )
          )
        )
      )
    );
  }

  return {
    MascotCanvas,
    FloatingMascotOverlay,
    HeroMascotMark,
    MascotSettingsPage,
  };
}

export function bindDshRuntime(ctx, React, controller, components) {
  const h = React.createElement;

  // 1. Mount plugin stylesheet
  if (typeof ctx.effect === "function" && typeof document !== "undefined") {
    ctx.effect(() => {
      const styleEl = document.createElement("style");
      styleEl.dataset.pluginCss = "pi-furry-partner";
      styleEl.textContent = DSH_MASCOT_CSS;
      document.head.appendChild(styleEl);
      const onVisibility = () => controller.notifyChange();
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        styleEl.remove();
      };
    }, "furry-partner: client styles & visibility");
  }

  // 2. Initialize Host config & sprite sheet
  if (typeof ctx.effect === "function") {
    ctx.effect(() => {
      controller.init();
      return () => controller.dispose();
    }, "furry-partner: controller lifecycle");
  } else {
    controller.init();
  }

  // 3. Register desktop/title/settings surfaces. No composer slot or placeholder.
  if (ctx.slots?.inject) {
    ctx.slots.inject("shell.overlay", () =>
      ctx.slots.register(
        { name: "shell.overlay", id: "furry-partner-overlay", order: 90 },
        (props) => h(components.FloatingMascotOverlay, props)
      )
    );

    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        {
          name: "settings.section",
          id: "furry-partner",
          order: 68,
          label: () => (resolveLanguage(controller.getSnapshot().settings.language) === "en" ? "Umi Mascot" : "呜咪桌宠"),
        },
        () => h(components.MascotSettingsPage, null)
      )
    );

    ctx.slots.inject("plugins.bundle.config", () =>
      ctx.slots.register(
        { name: "plugins.bundle.config", key: "pi-furry-partner" },
        () => h(components.MascotSettingsPage, null)
      )
    );

    // Hero brand mark: dynamically registered when heroMark === true so turning it off restores DSH's default hero icon
    ctx.slots.inject("conversation.hero.brand.mark", () => {
      let disposeHero = null;
      const syncHeroSlot = () => {
        const wantHero = controller.getSnapshot().settings.heroMark !== false;
        if (wantHero && !disposeHero) {
          try {
            disposeHero = ctx.slots.register(
              { name: "conversation.hero.brand.mark" },
              (props) => h(components.HeroMascotMark, props)
            );
          } catch { /* Slot already occupied */ }
        } else if (!wantHero && disposeHero) {
          disposeHero();
          disposeHero = null;
        }
      };
      syncHeroSlot();
      const unsub = controller.subscribeSettings(syncHeroSlot);
      return () => {
        unsub();
        if (disposeHero) {
          disposeHero();
          disposeHero = null;
        }
      };
    });
  }

  // 4. Bind root-level sessions & uiConversation services when available
  if (typeof ctx.inject === "function") {
    ctx.inject(["sessions"], (scope) => {
      if (!scope.sessions) return;
      scope.effect(() => {
        let activeSessionUnsub = null;
        let activeEventsUnsub = null;
        let boundId = null;

        const syncActiveSession = () => {
          const listSnap = readStoreSnapshot(scope.sessions.list);
          const nextId = listSnap?.activeId;
          if (nextId === boundId) return;
          if (activeSessionUnsub) { activeSessionUnsub(); activeSessionUnsub = null; }
          if (activeEventsUnsub) { activeEventsUnsub(); activeEventsUnsub = null; }
          boundId = nextId;
          if (!boundId || typeof scope.sessions.binding !== "function") return;
          try {
            const binding = scope.sessions.binding(boundId);
            if (binding?.eventSource?.subscribe) {
              activeEventsUnsub = binding.eventSource.subscribe((entry) => {
                controller.bridge.handleSessionEvent(entry);
                controller.notifyChange();
              });
            }
            if (binding?.session?.subscribe) {
              const pushSession = () => {
                const snap = readStoreSnapshot(binding.session);
                if (snap) {
                  controller.bridge.syncConversationState({
                    sessionId: boundId,
                    status: snap.status,
                  });
                  controller.notifyChange();
                }
              };
              pushSession();
              activeSessionUnsub = binding.session.subscribe(pushSession);
            }
          } catch { /* Ignore transient binding errors */ }
        };

        syncActiveSession();
        const unsubList = scope.sessions.list?.subscribe ? scope.sessions.list.subscribe(syncActiveSession) : null;
        return () => {
          if (unsubList) unsubList();
          if (activeSessionUnsub) activeSessionUnsub();
          if (activeEventsUnsub) activeEventsUnsub();
        };
      }, "furry-partner: root session event observer");
    });

    // The removed input-row chip used to observe typing through slot props.
    // Keep that read-only behaviour through DSH's public SessionInputResolver.
    ctx.inject(["sessions", "conversation"], (scope) => {
      if (!scope.sessions || typeof scope.conversation?.input?.for !== 'function') return;
      scope.effect(() => {
        let inputOff = null, boundId = null, boundContext = null;
        const clearInput = () => { if (typeof inputOff === 'function') inputOff(); inputOff = null; };
        const syncInput = () => {
          const id = readStoreSnapshot(scope.sessions.list)?.activeId;
          let binding;
          try { binding = id && scope.sessions.binding(id); } catch { binding = null; }
          if (id === boundId && binding?.ctx === boundContext) return;
          clearInput(); boundId = id; boundContext = binding?.ctx;
          controller.bridge.syncInputDraft(''); controller.notifyChange();
          if (!boundContext) return;
          try {
            const store = scope.conversation.input.for(boundContext)?.state;
            const push = () => {
              const input = readStoreSnapshot(store);
              if (typeof input?.draft !== 'string') return;
              controller.bridge.syncInputDraft(input.draft); controller.notifyChange();
            };
            push(); inputOff = store?.subscribe?.(push) || null;
          } catch { /* A disappearing session simply loses its local input reaction. */ }
        };
        syncInput();
        const listOff = scope.sessions.list?.subscribe?.(syncInput);
        return () => { clearInput(); if (typeof listOff === 'function') listOff(); };
      }, "furry-partner: read-only root input observer");
    });

    // 5. Register /mascot slash command in commandUi
    ctx.inject(["commandUi"], (scope) => {
      if (typeof scope.commandUi?.register !== "function") return;
      scope.effect(() => {
        const isEn = () => resolveLanguage(controller.getSnapshot().settings.language) === "en";
        const t = (zh, en) => (isEn() ? en : zh);
        return scope.commandUi.register({
          name: "mascot",
          label: () => t("呜咪桌宠 (Umi Mascot)", "Umi Mascot"),
          description: () => t("戳一戳呜咪、切换画风、开关角色口吻或动作巡演", "Poke Umi, switch sprite style, toggle persona voice or demo tour"),
          available: () => true,
          ui: {
            kind: "popupSelect",
            searchMode: "substring",
            searchLabels: () => ({
              placeholder: t("搜索呜咪指令…", "Search Umi mascot actions…"),
              empty: t("暂无可用操作", "No actions available"),
              noResults: t("未找到匹配操作", "No matching actions"),
            }),
            options: async () => {
              const { settings, ui, snapshot } = controller.getSnapshot();
              return [
                {
                  id: "poke",
                  label: t("🐾 戳一戳呜咪", "🐾 Poke Umi"),
                  detail: t("触发害羞/摇耳互动反应", "Trigger a local ear-wiggle reaction"),
                },
                {
                  id: "persona",
                  label: settings.persona ? t("💬 关闭呜咪回答口吻", "💬 Disable Umi Persona Voice") : t("💬 开启呜咪回答口吻", "💬 Enable Umi Persona Voice"),
                  badge: settings.persona ? "ON" : "OFF",
                  detail: t("在系统提示词中注入呜咪第一人称性格设定", "Inject Umi's wolf-boy character voice into system-prompt/assemble"),
                },
                {
                  id: "demo",
                  label: snapshot.demo ? t("⏹ 停止动作巡演", "⏹ Stop Demo Tour") : t("🎭 开启全动作巡演", "🎭 Start Full Demo Tour"),
                  badge: snapshot.demo ? "ACTIVE" : undefined,
                  detail: t("依次演示睡醒、倾听、思考、敲代码、搜索、打瞌睡等全部姿态", "Cycle through all 13 phases and local reactions"),
                },
                ...DSH_STYLES.map((styleId) => ({
                  id: `style:${styleId}`,
                  label: `${t("🎨 画风：", "🎨 Style: ")}${isEn() ? STYLE_LABELS[styleId].en : STYLE_LABELS[styleId].zh}`,
                  active: settings.style === styleId,
                  badge: settings.style === styleId ? t("当前", "Current") : undefined,
                })),
                {
                  id: "zoom-in",
                  label: t("🔍 放大桌宠 (+15%)", "🔍 Zoom In (+15%)"),
                  badge: `${Math.round((settings.scale || 1) * 100)}%`,
                },
                {
                  id: "zoom-out",
                  label: t("🔎 缩小桌宠 (-15%)", "🔎 Zoom Out (-15%)"),
                  badge: `${resolveMascotPixels(settings)}px`,
                },
                {
                  id: "toggle-minimized",
                  label: ui.minimized ? t("🗖 展开悬浮桌宠", "🗖 Expand Floating Pet") : t("🗕 收起悬浮桌宠为爪印", "🗕 Minimize Floating Pet"),
                },
                {
                  id: "reset-pos",
                  label: t("📍 重置默认位置与大小", "📍 Reset Position & Size"),
                },
              ];
            },
            onSelect: async (option) => {
              if (!option?.id) return;
              if (option.id === "poke") {
                controller.poke();
              } else if (option.id === "persona") {
                const cur = controller.getSnapshot().settings.persona;
                await controller.updateSettings({ persona: !cur });
              } else if (option.id === "demo") {
                const cur = controller.getSnapshot().snapshot.demo;
                controller.setDemo(cur ? "off" : "all");
              } else if (option.id.startsWith("style:")) {
                const style = option.id.slice("style:".length);
                await controller.updateSettings({ style });
              } else if (option.id === "zoom-in") {
                await controller.zoomBy(0.15);
              } else if (option.id === "zoom-out") {
                await controller.zoomBy(-0.15);
              } else if (option.id === "toggle-minimized") {
                const cur = controller.getSnapshot().ui.minimized;
                controller.updateUi({ minimized: !cur });
              } else if (option.id === "reset-pos") {
                await controller.resetPosition();
              }
            },
          },
        });
      }, "furry-partner: /mascot commandUi");
    });
  }
}
