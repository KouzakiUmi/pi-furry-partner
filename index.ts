import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as agentUI from "@earendil-works/pi-coding-agent";
import * as tuiUI from "@earendil-works/pi-tui";
import { CURSOR_MARKER, getCellDimensions, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { createHeader, headerCanAnimate, renderPixels, safeText, samplePixels, terminalVariants } from "./lib/renderer.mjs";
import { createSixelTransport, graphicsMode } from "./lib/sixel.mjs";
import { createKittyTransport } from "./lib/kitty.mjs";
import { createActivity, DEMO_STATES } from "./lib/activity.mjs";
import { DOCK_CAPTION_ROWS, dockGeometry, renderDock, joinEditor, activityBorder, editorFrameGeometry, frameEditorLines } from "./lib/editor-layout.mjs";
import { createStatusFooter } from "./lib/footer.mjs";
import { GESTURE_IDS } from "./lib/gestures.mjs";
import { createMotionPlayer } from "./lib/motion.mjs";
import { approvedMotionKeyboardClip, approvedMotionPokeFrame, approvedMotionStaticFrame, createApprovedMotionPlayer, normalizeApprovedMotionCatalog } from "./lib/approved-motion.mjs";
import { decodeApprovedMotionNodeResource } from "./lib/approved-motion-node.mjs";
import { FULL_ANIMATION_EDITION, approvedMotionStyle } from "./lib/build-profile.mjs";
import { createEditorControls } from "./lib/editor-controls.mjs";
import { createOverlayVisibility } from "./lib/overlay-visibility.mjs";
import { createQuickActions } from "./lib/quick-actions.mjs";
import { compactNativePromptSections, addPersonaSection } from "./lib/native-prompt.mjs";
import { installChineseUi } from "./lib/ui-chinese.mjs";
import { createChineseAutocompleteFactory } from "./lib/command-chinese.mjs";
import { getMascotArgumentCompletions } from "./lib/mascot-autocomplete.mjs";
import { STYLES, normalizeStyle, styleAssetDirectory } from "./lib/styles.mjs";
import { withPokeFrame } from "./lib/poke.mjs";
import { withWatchFrames } from "./lib/watch.mjs";
import { withListenFrames } from "./lib/listen.mjs";
import { withSearchFrames } from "./lib/search.mjs";
import { createGestureVideoCache, normalizeGestureVideoCatalog, stateExpressionVideo } from "./lib/gesture-video.mjs";
import { withExpressionFrames } from "./lib/expressions.mjs";
import { createResponseLatency, withResponseLatency } from "./lib/response-latency.mjs";
import { normalizeLanguage, resolveLanguage, systemLanguage, localize, localizeSnapshot, replaceActivityCopy, nativeChineseEnabled, compactPromptEnabled, personaFilename, companionName, companionSubtitle, mascotDescription } from "./lib/language.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, "config.json");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const DEFAULTS = {
  name: "呜咪", subtitle: "你的工作搭档", enabled: true, animation: true, persona: false,
  layout: "editor", style: "umi", headerStyle: "pixel", renderer: "auto",
  size: "auto", dockSize: "auto", info: "compact", optimizeEditor: true,
  chineseUI: true, compactPrompt: true, language: "auto",
};
const SIZES = ["auto", "small", "compact", "normal", "large"];
function terminalCursor(tui: any) {
  const state = tui.mode === "regular" && tui.captureRenderState?.();
  return state ? { row: state.hardwareCursorRow - state.previousViewportTop, column: 0 } : undefined;
}

export default function (pi: ExtensionAPI) {
  let settings = { ...DEFAULTS };
  try {
    const saved = read("config.json");
    for (const key of ["animation", "enabled", "optimizeEditor", "persona", "chineseUI", "compactPrompt"] as const) {
      if (typeof saved[key] === "boolean") settings[key] = saved[key];
    }
    for (const key of ["name", "subtitle"] as const) {
      if (typeof saved[key] === "string") settings[key] = safeText(saved[key]).slice(0, 120);
    }
    for (const key of ["size", "dockSize"] as const) if (SIZES.includes(saved[key])) settings[key] = saved[key];
    if (["auto", "kitty", "sixel", "blocks"].includes(saved.renderer)) settings.renderer = saved.renderer;
    if (["editor", "header"].includes(saved.layout)) settings.layout = saved.layout;
    if (normalizeStyle(saved.style)) settings.style = normalizeStyle(saved.style)!;
    if (["pixel", "illustration"].includes(saved.headerStyle)) settings.headerStyle = saved.headerStyle;
    if (["compact", "native"].includes(saved.info)) settings.info = saved.info;
    if (normalizeLanguage(saved.language)) settings.language = normalizeLanguage(saved.language)!;
  } catch { /* A missing or malformed preference file uses safe defaults. */ }

  const voices = {
    "zh-CN": { copy: read("assets/status-copy.json"), phrases: read("assets/status-phrases.json") },
    en: { copy: read("assets/status-copy.en.json"), phrases: read("assets/status-phrases.en.json") },
  };
  const voice = { labels: {}, bubbles: {}, phrases: {} };
  const l = (zh: string, en: string) => localize(settings.language, zh, en);
  function updateVoice() {
    const selected = resolveLanguage(settings.language) === "en" ? voices.en : voices["zh-CN"];
    replaceActivityCopy(voice, selected.copy, selected.phrases);
  }
  updateVoice();
  let approvedCatalog: any = null;
  if (FULL_ANIMATION_EDITION) {
    try { approvedCatalog = normalizeApprovedMotionCatalog(read('assets/animated/catalog.json')); } catch { /* The ordinary reaction chain remains the complete fallback. */ }
  }
  function selectedGraphicsMode() {
    let imageProtocol;
    try { imageProtocol = typeof (tuiUI as any).getCapabilities === "function" ? (tuiUI as any).getCapabilities().images : undefined; }
    catch { /* Capability probing failure keeps the terminal-cell fallback. */ }
    return graphicsMode(settings.renderer, process.env, imageProtocol);
  }
  const activity = createActivity({ autoGestures: true, gestureDurations: () => ({ clips: { ...reactionCatalog().clips,
    ...(approvedMotionStyle(settings.style) ? approvedCatalog?.clips : {}) } }), ...voice, rotationMs: voices["zh-CN"].phrases.rotationMs });
  const responseLatency = createResponseLatency();
  const readSnapshot = () => localizeSnapshot(activity.snapshot(), settings.language);
  const reactions = new Map<string, any>();
  const headerSheets = new Map<string, { native: any; fallback: any }>();
  const reactionCatalogs = new Map<string, any>();
  function reactionCatalog() {
    if (!reactionCatalogs.has(settings.style)) {
      let catalog = {};
      try { catalog = read(`assets/reactions/${styleAssetDirectory(settings.style)}/gesture-videos.json`); } catch { /* Optional metadata. */ }
      reactionCatalogs.set(settings.style, normalizeGestureVideoCatalog(catalog));
    }
    return reactionCatalogs.get(settings.style);
  }
  const gestureVideos = createGestureVideoCache({ load: (style: string, action: string) =>
    read(`assets/reactions/${styleAssetDirectory(style)}/gesture-${action}-frames.json`) });
  function reactionSheet(action = lastSnapshot?.gesture?.id || stateExpressionVideo(lastSnapshot, reactionCatalog())?.id) {
    if (!reactions.has(settings.style)) {
      const directory = `assets/reactions/${styleAssetDirectory(settings.style)}`;
      const sheet = read(`${directory}/reaction-sheet.json`);
      let augmented = sheet;
      try { augmented = withPokeFrame(sheet, read(`${directory}/poke-patch.json`)); } catch { /* Older local asset packs keep the ordinary blink fallback. */ }
      try { augmented = withWatchFrames(augmented, read(`${directory}/watch-frames.json`)); } catch { /* Earlier asset packs keep their work pose. */ }
      try { augmented = withListenFrames(augmented, read(`${directory}/listen-frames.json`)); } catch { /* Older packs keep their neutral listening fallback. */ }
      try { augmented = withSearchFrames(augmented, read(`${directory}/search-frames.json`)); } catch { /* Earlier packs keep their articulated search pose. */ }
      try { augmented = withExpressionFrames(augmented, read(`${directory}/expression-frames.json`)); } catch { /* Older artwork retains its existing reactions. */ }
      reactions.set(settings.style, augmented);
    }
    return gestureVideos.sheet(reactions.get(settings.style), settings.style, action, reactionCatalog().clips[action]);
  }
  function titleSheets() {
    if (!headerSheets.has(settings.headerStyle)) {
      const native = read(settings.headerStyle === "illustration" ? "assets/illustration/native-frames.json" : "assets/native-frames.json");
      headerSheets.set(settings.headerStyle, { native, fallback: settings.headerStyle === "pixel" ? read("assets/terminal-frames.json") : terminalVariants(native) });
    }
    return headerSheets.get(settings.headerStyle)!;
  }

  let tui: any;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDueAt = Infinity;
  let approvedFrameDueAt = Infinity;
  let suspended = true;
  let lastSnapshot: ReturnType<typeof activity.snapshot> | undefined;
  let header: ReturnType<typeof createHeader> | undefined;
  let headerTransport: ReturnType<typeof createSixelTransport> | undefined;
  let headerFrame = 0;
  let activeEditor: { dispose(): void; openQuickActions(action?: string): Promise<boolean> } | undefined;
  let editorFactory: ReturnType<ExtensionContext["ui"]["getEditorComponent"]>;
  let previousEditor: ReturnType<ExtensionContext["ui"]["getEditorComponent"]>;
  let ownsHeader = false;
  let ownsFooter = false;
  let headerOwner: object | undefined;
  let footerOwner: object | undefined;
  let footerCleanup: (() => void) | undefined;
  let languagePatch: ReturnType<typeof installChineseUi> | undefined;
  let languageReleased = false;
  let autocompleteRegistered = false;

  function installLanguage(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    languageReleased = false;
    languagePatch?.dispose();
    languagePatch = installChineseUi({ agentUI, tuiUI, version: agentUI.VERSION, isEnabled: () => !languageReleased && nativeChineseEnabled(settings) });
    if (!autocompleteRegistered && typeof ctx.ui.addAutocompleteProvider === "function") {
      ctx.ui.addAutocompleteProvider(createChineseAutocompleteFactory({ isEnabled: () => !languageReleased && nativeChineseEnabled(settings), getLanguage: () => languageReleased ? undefined : settings.language }));
      autocompleteRegistered = true;
    }
  }

  function pausedSnapshot(next: ReturnType<typeof activity.snapshot>) {
    if (next.reaction === "poked" && next.demoMode !== "all") return next;
    const faces: Record<string, string> = { idle: "idle-open", thinking: "think", speaking: "talk-closed", reading: "work", editing: "work", running: "watch", searching: "search", compacting: "search", waiting: "wait", success: "happy", error: "error", cancelled: "rest" };
    const bubbles: Record<string, string> = voice.bubbles;
    // A paused visual hold must never latch a previous work/blink pose after
    // its real tool has ended. Keep the state readable without running motion.
    return { ...next, face: next.drowsy ? "rest" : faces[next.phase] || next.face,
      visualPhase: next.phase, blink: false, reaction: undefined,
      bubble: next.phase === "thinking" ? bubbles.thinking || next.bubble : next.phase === "speaking" ? bubbles.speaking || next.bubble : next.bubble };
  }
  function snapshot() {
    if (settings.animation || activity.isPoked() || lastSnapshot?.reaction === "poked" || !lastSnapshot) {
      const next = readSnapshot(); lastSnapshot = settings.animation ? next : pausedSnapshot(next);
    }
    return withResponseLatency(lastSnapshot, responseLatency.snapshot(), settings.language);
  }
  function refreshState() {
    if (!settings.animation && lastSnapshot && !activity.isPoked() && lastSnapshot.reaction !== "poked") {
      const next = pausedSnapshot(readSnapshot());
      // Pausing keeps motion still while real state and tool metadata remain live.
      lastSnapshot = next.phase === lastSnapshot.phase ? {
        ...next,
        bubble: lastSnapshot.bubble, glyph: lastSnapshot.glyph, phrase: lastSnapshot.phrase,
      } : next;
    } else lastSnapshot = undefined;
  }
  function stopTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    timerDueAt = approvedFrameDueAt = Infinity;
  }
  function visible() { return tui && (settings.layout === "editor" || !tui.hasOverlay()); }
  function redraw() { if (!suspended) tui?.requestRender(); }
  function armTimer(renderedDeadline = false) {
    // Token events must not continually postpone the animation deadline.
    if (!settings.animation && !activity.isPoked() && !responseLatency.isWaiting()) { stopTimer(); return; }
    if (suspended || !settings.enabled || !tui) return;
    if (settings.layout === "header" && !header) return;
    const delay = !settings.animation && !activity.isPoked() ? 1000 : settings.layout === "header"
      ? Math.max(60, titleSheets().native.frames[headerFrame].durationMs) : 50;
    const now = Date.now();
    const dueAt = !visible() ? now + 800 : settings.animation && settings.layout === 'editor' && Number.isFinite(approvedFrameDueAt)
      ? Math.max(now + 1, approvedFrameDueAt) : now + delay;
    // Events can bring a deadline forward, never postpone it. A completed
    // render replaces the provisional timer with its actual frame boundary.
    if (timer !== undefined) {
      if (renderedDeadline ? timerDueAt === dueAt : timerDueAt <= dueAt) return;
      clearTimeout(timer);
    }
    timerDueAt = dueAt;
    timer = setTimeout(() => {
      timer = undefined;
      timerDueAt = approvedFrameDueAt = Infinity;
      if (suspended) return;
      if (visible() && (settings.layout !== "header" || headerCanAnimate(tui))) {
        if (settings.layout === "header" && settings.animation) {
          headerFrame = (headerFrame + 1) % titleSheets().native.frames.length;
          header?.setFrame(headerFrame);
        }
        lastSnapshot = undefined;
        redraw();
      }
      armTimer();
    }, Math.max(1, Math.ceil(dueAt - now)));
    timer.unref?.();
  }

  function release(ctx?: ExtensionContext) {
    suspended = true;
    stopTimer();
    // Pi does not dispose an old editor when replacing its factory.
    activeEditor?.dispose(); activeEditor = undefined;
    headerTransport?.dispose(); headerTransport = undefined;
    footerCleanup?.(); footerCleanup = undefined;
    if (ctx?.mode === "tui") {
      if (editorFactory && ctx.ui.getEditorComponent() === editorFactory) ctx.ui.setEditorComponent(previousEditor);
      if (ownsHeader) ctx.ui.setHeader(undefined);
      if (ownsFooter) ctx.ui.setFooter(undefined);
      ctx.ui.setStatus("pi-furry-partner", undefined);
      ctx.ui.setStatus("pi-wink-companion", undefined);
    }
    editorFactory = undefined; previousEditor = undefined;
    header = undefined; tui = undefined; ownsHeader = false; ownsFooter = false;
    headerOwner = undefined; footerOwner = undefined;
  }

  function installEditor(ctx: ExtensionContext) {
    previousEditor = ctx.ui.getEditorComponent();
    if (previousEditor) {
      ctx.ui.notify(l("检测到其他扩展的输入框，已保留。可用 /mascot layout header 显示标题头像。", "Another extension owns the editor, so I've kept it. Use /mascot layout header to show me in the title instead."), "warning");
      return;
    }
    class UmiEditor extends CustomEditor {
      private transport: ReturnType<typeof createSixelTransport> | undefined;
      private kittyTransport: ReturnType<typeof createKittyTransport> | undefined;
      private overlayVisibility: ReturnType<typeof createOverlayVisibility>;
      private geometry: ReturnType<typeof joinEditor> | undefined;
      private motion = createMotionPlayer({ allowWholeFrameMotion: !FULL_ANIMATION_EDITION });
      private approvedMotion = createApprovedMotionPlayer({ catalog: approvedCatalog,
        loadIndexed: (path: string) => path.endsWith('.json') ? read(`assets/animated/${path}`)
          : decodeApprovedMotionNodeResource(readFileSync(join(root, `assets/animated/${path}`))) });
      private disposed = false;
      private demoMotionEpoch: string | undefined;
      private demoMotionPhase: string | undefined;
      private displaySheet: any;
      private toolbarLine: string | undefined;
      private toolbarRow = -1;
      private frameWidth = 0;
      private avatarBounds: any;
      private shortcutKeys: any;
      private quickActions = createQuickActions({
        ctx, pi, getEditor: () => this,
        getLanguage: () => settings.language,
        onGesture: (mode: string) => {
          const accepted = activity.playGesture(mode);
          if (!accepted) ctx.ui.notify(l("等我忙完这一步，再陪你玩呀。", "Let me finish this bit, then I'll play."), "info");
          else if (!settings.animation) ctx.ui.notify(l("我现在乖乖不动哦，用 /mascot play 开启动画吧。", "I'm holding still. Use /mascot play to enable motion."), "info");
          lastSnapshot = undefined; redraw(); armTimer(); return accepted;
        },
        isBlocked: () => suspended || activeEditor !== this || tui?.hasOverlay() || !this.focused,
        showDetails: (title: string, lines: string[]) => this.showDetails(title, lines),
        onChange: () => redraw(),
      });
      private controls = createEditorControls({
        visibleWidth,
        getLanguage: () => settings.language,
        getState: () => ({ animation: settings.animation, persona: settings.persona, style: settings.style, hasText: Boolean(this.getText().trim()), busy: !ctx.isIdle(), mode: tui?.mode === "fullscreen" ? "fullscreen" : "regular" }),
        getKeys: (action: string) => this.shortcutKeys?.getKeys(action),
        onAction: (action: string) => {
          if (action === "poke") { activity.poke(); lastSnapshot = undefined; redraw(); armTimer(); }
          else if (action === "send") this.handleInput("\r");
          else if (action === "newline") this.insertTextAtCursor("\n");
          else if (["model", "thinking", "menu"].includes(action)) void this.openQuickActions(action);
          else if (action === "animation") {
            settings.animation = !settings.animation;
            if (!settings.animation) { activity.clearTyping(); lastSnapshot = pausedSnapshot(readSnapshot()); stopTimer(); if (activity.isPoked()) armTimer(); }
            else { lastSnapshot = undefined; armTimer(); }
            save(ctx); redraw();
          } else if (action === "persona") { settings.persona = !settings.persona; save(ctx); redraw(); }
          else if (action === "style") {
            void (async () => {
              const outfits = l("呜咪角色版|呜咪像素版|原像素|旧插画", "Umi illustrated|Umi pixel|Original pixel|Legacy illustration").split("|");
              const selected = await ctx.ui.select(l("想让我换哪一身呀？", "Which look shall I try?"), outfits);
              const index = outfits.indexOf(selected || "");
              if (index >= 0) { settings.style = STYLES[index]; apply(ctx); save(ctx); }
            })().catch((error) => ctx.ui.notify(`${l("换装没有完成：", "I couldn't change outfits: ")}${(error as Error).message}`, "warning"));
          }
        },
      });
      constructor(editorTui: any, theme: any, keybindings: any) {
        super(editorTui, theme, keybindings, { embedWorkingStatus: true });
        this.shortcutKeys = keybindings;
        tui = editorTui;
        this.overlayVisibility = createOverlayVisibility(editorTui);
        this.transport = createSixelTransport(editorTui.terminal, getCellDimensions,
          () => this.displaySheet || reactionSheet(), () => settings.style, (rect: any) => this.overlayVisibility.allows(rect), process.env, visibleWidth, () => terminalCursor(editorTui));
        this.kittyTransport = createKittyTransport({ getCellDimensions,
          getSheet: () => this.displaySheet || reactionSheet(), getStyle: () => settings.style,
          getViewport: () => [editorTui.terminal.columns, editorTui.terminal.rows],
          isAllowed: (rect: any) => this.overlayVisibility.allows(rect),
          getOverlayVersion: () => this.overlayVisibility.version(),
          createOverlayMarker: (options: any) => this.transport?.createOverlayMarker(options),
          renderImage: (tuiUI as any).renderImage, allocateImageId: (tuiUI as any).allocateImageId,
          deleteImage: typeof (tuiUI as any).deleteKittyImage === "function"
            ? (imageId: number) => editorTui.terminal.write((tuiUI as any).deleteKittyImage(imageId)) : undefined,
          deleteImageSequence: (tuiUI as any).deleteKittyImage });
        activeEditor = this;
        armTimer();
      }
      openQuickActions(action = "menu") { return this.disposed ? Promise.resolve(false) : this.quickActions.run(action); }
      private async showDetails(title: string, lines: string[]) {
        await ctx.ui.custom<void>((detailTui, theme, _keys, done) => {
          let offset = 0, pageRows = 1, totalRows = 1;
          return {
            render(width: number) {
              const inner = Math.max(1, width - 4);
              const wrapped = lines.flatMap((line) => wrapTextWithAnsi(line || " ", inner));
              pageRows = Math.max(1, Math.min(20, detailTui.terminal.rows - 9));
              totalRows = wrapped.length; offset = Math.max(0, Math.min(offset, totalRows - pageRows));
              const row = (text: string) => {
                const clipped = truncateToWidth(text, inner, "…");
                return theme.fg("accent", "│ ") + clipped + " ".repeat(Math.max(0, inner - visibleWidth(clipped))) + theme.fg("accent", " │");
              };
              const edge = (left: string, right: string) => theme.fg("accent", left + "─".repeat(inner + 2) + right);
              return [edge("╭", "╮"), row(theme.bold(title)), edge("├", "┤"),
                ...wrapped.slice(offset, offset + pageRows).map(row),
                row(theme.fg("dim", `${l("↑↓ / PgUp PgDn 翻页 · Enter / Esc 返回", "↑↓ / PgUp PgDn Scroll · Enter / Esc Back")} · ${Math.min(offset + pageRows, totalRows)}/${totalRows}`)), edge("╰", "╯")];
            },
            handleInput(data: string) {
              if (matchesKey(data, "enter") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) done();
              else if (matchesKey(data, "up")) offset--;
              else if (matchesKey(data, "down")) offset++;
              else if (matchesKey(data, "pageUp")) offset -= pageRows;
              else if (matchesKey(data, "pageDown")) offset += pageRows;
              else if (matchesKey(data, "home")) offset = 0;
              else if (matchesKey(data, "end")) offset = totalRows;
              detailTui.requestRender();
            },
            invalidate() {},
          };
        }, { overlay: true, overlayOptions: { anchor: "center", width: "85%", maxHeight: "85%", margin: 2 } });
      }
      render(width: number): string[] {
        // Pi can still measure the outgoing editor during replacement/shutdown.
        // Never touch released motion, terminal hooks or the old UI context.
        if (this.disposed) return [];
        if (width <= 0) { this.geometry = undefined; this.controls.render(0); return []; }
        const geometry = dockGeometry(width, tui?.terminal.rows || 30, settings.dockSize);
        const frame = editorFrameGeometry(width - geometry.leftWidth);
        this.frameWidth = frame.innerWidth;
        this.toolbarLine = undefined; this.toolbarRow = -1;
        this.controls.render(0);
        // Pi's word wrapper recurses on a two-cell grapheme in a one-cell
        // layout. Render a minimal native viewport in that extreme case, then
        // clip only its displayed cells; never change the draft or key map.
        const nativeRenderWidth = Math.max(frame.innerWidth, 3, this.getPaddingX() * 2 + 2);
        const nativeLines = super.render(nativeRenderWidth);
        const toolbarIndex = this.toolbarLine ? nativeLines.indexOf(this.toolbarLine) : -1;
        const framedLines = frameEditorLines({ nativeLines, width: frame.outerWidth, visibleLineCount: this.renderedVisibleLineCount,
          borderColor: (text: string) => this.borderColor(text), visibleWidth, truncateToWidth, cursorMarker: CURSOR_MARKER });
        const current = snapshot();
        const motionPhase = current.reaction || (current.drowsy ? "dozing" : current.visualPhase || current.phase);
        // Normal adjacent states retain their authored transitions. If renders
        // skipped a whole lap and landed on the same state, restart its motion
        // clock once instead of carrying the previous lap's phase age forward.
        if (current.demoEpoch !== this.demoMotionEpoch &&
            (current.demoEpoch !== undefined || this.demoMotionEpoch !== undefined) &&
            motionPhase === this.demoMotionPhase) this.motion.reset();
        this.demoMotionEpoch = current.demoEpoch; this.demoMotionPhase = motionPhase;
        const stateVideo = stateExpressionVideo(current, reactionCatalog());
        const motionSampleAt = Date.now();
        const approved = this.approvedMotion.sample(current, { style: settings.style, animate: settings.animation, enabled: settings.enabled, time: motionSampleAt });
        let nextApprovedFrameMs = Infinity;
        const approvedStyle = approvedMotionStyle(settings.style) && approvedCatalog;
        const sheet = reactionSheet(approved || approvedStyle && !settings.animation ? '' : current.gesture?.id || stateVideo?.id);
        const visualGesture = current.gesture || (stateVideo && sheet.motion?.gestureVideos?.[stateVideo.id] ? stateVideo : null);
        const dockLines = renderDock({
          geometry, sheet, snapshot: current, visualGesture,
          motionPlayer: { frame: (base: any, index: number, options: any) => {
            if (!approvedStyle) return this.motion.frame(base, index, options);
            const poked = current.reaction === 'poked';
            const motionOptions = { ...options, animate: poked || settings.animation };
            if (approvedStyle && !settings.animation && !poked) return approvedMotionStaticFrame(base, index, motionOptions);
            const visual = this.approvedMotion.indexedFrame(approved, settings.style) || (approvedMotionKeyboardClip(approved?.clipId)
              ? approvedMotionStaticFrame(base, base.ids['idle-open'] ?? 0, { phase: 'idle' }) : this.motion.frame(base, index, motionOptions));
            if (approved && visual.approvedMotion === approved) nextApprovedFrameMs = visual.nextInMs;
            return poked ? approvedMotionPokeFrame(visual, current.reactionElapsedMs, current.reactionStrength) : visual;
          } }, animate: settings.animation,
          renderAvatar: (frame: any) => {
            this.displaySheet = frame.sheet;
            const mode = selectedGraphicsMode();
            return mode === "kitty" ? this.kittyTransport?.render(frame) : mode === "sixel" ? this.transport?.render(frame) : undefined;
          },
          theme: ctx.ui.theme, visibleWidth, truncateToWidth, renderPixels, samplePixels,
        });
        this.geometry = joinEditor({ width, nativeLines: framedLines, dockLines, geometry, snapshot: current, theme: ctx.ui.theme, visibleWidth, truncateToWidth, editorInset: frame.inset, nativeRenderWidth });
        if (toolbarIndex >= 0) this.toolbarRow = this.geometry.offsetY + toolbarIndex;
        this.avatarBounds = geometry.collapsed || tui?.mode !== "fullscreen" ? undefined : { x: geometry.imageOffset, y: DOCK_CAPTION_ROWS, width: geometry.columns, height: geometry.rows };
        if (activeEditor === this && settings.layout === 'editor') {
          approvedFrameDueAt = Number.isFinite(nextApprovedFrameMs) ? motionSampleAt + Math.ceil(nextApprovedFrameMs) : Infinity;
          armTimer(Number.isFinite(approvedFrameDueAt));
        }
        return this.geometry.lines;
      }
      handleInput(data: string) {
        if (this.disposed) return;
        // Observe only the native editor's result. Never intercept text, IME,
        // pasted content, shortcuts or submission; no draft content is logged.
        const before = this.getText();
        const result = super.handleInput(data);
        const after = this.getText();
        if (before !== after) {
          if (settings.animation && after.length) activity.noteTyping();
          else activity.clearTyping();
          lastSnapshot = undefined;
          redraw();
        }
        return result;
      }
      handleMouse(event: any) {
        if (this.disposed) return undefined;
        const geometry = this.geometry;
        if (!geometry) return undefined;
        const control = tui?.mode === "fullscreen" ? this.controls.handleMouse(event, { row: this.toolbarRow, offsetX: geometry.contentX + 3, avatar: this.avatarBounds }) : undefined;
        if (control) return control;
        if (event.x < geometry.contentX || event.x >= geometry.contentX + geometry.editorWidth || event.y < geometry.offsetY || event.y >= geometry.offsetY + geometry.nativeHeight) return undefined;
        return super.handleMouse({ ...event, x: event.x - geometry.contentX, y: event.y - geometry.offsetY, width: geometry.nativeRenderWidth, height: geometry.nativeHeight });
      }
      protected renderTopBorder(width: number, hiddenLineCount: number): string {
        width = Math.min(width, this.frameWidth || width);
        return activityBorder({ snapshot: snapshot(), width, hiddenLineCount,
          theme: ctx.ui.theme, visibleWidth, truncateToWidth, borderColor: (text: string) => this.borderColor(text) });
      }
      protected renderBottomBorder(width: number, hiddenLineCount: number): string {
        width = Math.min(width, this.frameWidth || width);
        if (!settings.optimizeEditor || hiddenLineCount > 0 || width < 18) return super.renderBottomBorder(width, hiddenLineCount);
        let content = this.controls.render(width - 6, ctx.ui.theme);
        const length = visibleWidth(content);
        this.toolbarLine = this.borderColor("── ") + content + this.borderColor("─".repeat(Math.max(0, width - length - 3)));
        return this.toolbarLine;
      }
      dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.geometry = undefined; this.avatarBounds = undefined;
        this.quickActions.dispose(); this.transport?.dispose(); this.transport = undefined;
        this.kittyTransport?.dispose(); this.kittyTransport = undefined;
        this.overlayVisibility.dispose(); this.motion.dispose(); this.approvedMotion.dispose(); this.controls.dispose();
      }
    }
    editorFactory = (editorTui, theme, keybindings) => new UmiEditor(editorTui, theme, keybindings);
    ctx.ui.setEditorComponent(editorFactory);
  }

  function apply(ctx: ExtensionContext) {
    release(ctx);
    lastSnapshot = undefined;
    if (ctx.mode !== "tui" || !settings.enabled) return;
    suspended = false;
    ownsHeader = true;
    const titleOwner = {};
    headerOwner = titleOwner;
    if (settings.layout === "editor") {
      // Keep the title stable; all changing content stays beside the input.
      ctx.ui.setHeader((headerTui) => {
        tui = headerTui;
        return {
          render: (width) => [truncateToWidth(ctx.ui.theme.bold(ctx.ui.theme.fg("accent", `${companionName(settings)} · ${companionSubtitle(settings)}`)), width, "…")],
          invalidate() {},
          dispose() { if (headerOwner === titleOwner) { ownsHeader = false; headerOwner = undefined; } },
        };
      });
      installEditor(ctx);
      if (settings.info === "compact") {
        ownsFooter = true;
        const infoOwner = {};
        footerOwner = infoOwner;
        ctx.ui.setFooter((footerTui, theme, footerData) => {
          const component = createStatusFooter({ ctx, tui: footerTui, theme, footerData, visibleWidth, truncateToWidth, getThinkingLevel: () => pi.getThinkingLevel(), getLanguage: () => settings.language });
          footerCleanup = () => component.dispose();
          return { ...component, dispose() {
            component.dispose();
            if (footerOwner === infoOwner) { ownsFooter = false; footerOwner = undefined; footerCleanup = undefined; }
          } };
        });
      }
    } else {
      const sheets = titleSheets();
      ctx.ui.setHeader((headerTui) => {
        tui = headerTui;
        const overlayVisibility = createOverlayVisibility(headerTui);
        const transport = createSixelTransport(headerTui.terminal, getCellDimensions, () => sheets.native,
          () => settings.headerStyle, (rect: any) => overlayVisibility.allows(rect), process.env, visibleWidth, () => terminalCursor(headerTui));
        const kittyTransport = createKittyTransport({ getCellDimensions, getSheet: () => sheets.native,
          getStyle: () => settings.headerStyle, getViewport: () => [headerTui.terminal.columns, headerTui.terminal.rows],
          isAllowed: (rect: any) => overlayVisibility.allows(rect),
          getOverlayVersion: () => overlayVisibility.version(),
          createOverlayMarker: (options: any) => transport.createOverlayMarker(options),
          renderImage: (tuiUI as any).renderImage, allocateImageId: (tuiUI as any).allocateImageId,
          deleteImage: typeof (tuiUI as any).deleteKittyImage === "function"
            ? (imageId: number) => headerTui.terminal.write((tuiUI as any).deleteKittyImage(imageId)) : undefined,
          deleteImageSequence: (tuiUI as any).deleteKittyImage });
        headerTransport = transport;
        const component = createHeader({
          sheet: sheets.fallback,
          getSettings: () => ({ ...settings, name: companionName(settings), subtitle: l("我陪你，把想法变成现实", "I'm here to help bring your ideas to life.") }),
          getSnapshot: () => ({ busy: snapshot().busy, status: snapshot().label, model: ctx.model?.id, provider: ctx.model?.provider }),
          getRows: () => headerTui.terminal.rows || 30,
          theme: { fg: (token, text) => ctx.ui.theme.fg(token, text), bold: (text) => ctx.ui.theme.bold(text) },
          visibleWidth, truncateToWidth,
          renderAvatar: (frame: any) => selectedGraphicsMode() === "kitty" ? kittyTransport.render(frame)
            : selectedGraphicsMode() === "sixel" ? transport.render(frame) : undefined,
        });
        header = component; component.setFrame(headerFrame);
        let lastWidth = -1, lastRows = -1, lastLines: string[] | undefined, lastHadOverlay = false;
        return {
          render(width) {
            // A changing offscreen header makes Pi's main screen clear scrollback.
            // Re-render when overlay visibility or terminal height changes so Kitty
            // images are re-uploaded after a destructive fullscreen redraw.
            const hasOverlay = headerTui.hasOverlay(), rows = headerTui.terminal.rows;
            if ((!headerCanAnimate(headerTui) || hasOverlay) && lastLines && lastWidth === width && lastRows === rows && lastHadOverlay === hasOverlay) return lastLines;
            lastWidth = width; lastRows = rows; lastHadOverlay = hasOverlay; lastLines = component.render(width); return lastLines;
          },
          invalidate: () => component.invalidate(),
          dispose() {
            overlayVisibility.dispose(); transport.dispose(); kittyTransport.dispose();
            if (header === component) header = undefined;
            if (headerOwner === titleOwner) { ownsHeader = false; headerOwner = undefined; stopTimer(); }
          },
        };
      });
    }
    redraw(); armTimer();
  }

  function save(ctx: ExtensionContext) {
    try { writeFileSync(configPath, JSON.stringify(settings, null, 2) + "\n", "utf8"); }
    catch (error) { ctx.ui.notify(`${l("设置已应用，但无法保存：", "Settings applied, but I couldn't save them: ")}${(error as Error).message}`, "warning"); }
  }
  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    responseLatency.handle("before_agent_start"); refreshState(); redraw(); armTimer();
    if (compactPromptEnabled(settings)) {
      try {
        const compact = compactNativePromptSections({ systemPrompt: event.systemPrompt, piVersion: agentUI.VERSION,
          systemPromptOptions: event.systemPromptOptions, enabled: true,
          language: resolveLanguage(settings.language) });
        if (compact.changed) Object.assign(event.systemPromptOptions.sections, compact.sections);
      } catch (error) {
        ctx.ui.notify(`${l("Pi 文档提示精简不可用，本轮保留原文：", "The concise Pi documentation prompt isn't available; I've kept the original: ")}${(error as Error).message}`, "warning");
      }
    }
    if (!settings.persona) return;
    try {
      // A separate section keeps downstream extension additions and dynamic
      // tools/guidelines live. Do not return a whole-prompt override.
      const template = readFileSync(join(root, "prompts", personaFilename(settings.language)), "utf8").trim();
      if (!template) throw new Error(l("模板内容为空", "The template is empty"));
      addPersonaSection(event.systemPromptOptions, template);
    } catch (error) {
      ctx.ui.notify(`${l("我这轮没能用上角色语气模板：", "I couldn't use my character voice template for this turn: ")}${(error as Error).message}`, "warning");
    }
  });
  pi.on("session_start", (event, ctx) => {
    responseLatency.handle("session_start");
    installLanguage(ctx);
    activity.start({ isBusy: !ctx.isIdle(), wake: event.reason !== "reload" });
    apply(ctx);
  });
  for (const type of ["input", "before_provider_request"] as const) pi.on(type, (event, ctx) => {
    if (ctx.mode !== "tui") return;
    responseLatency.handle(type, event); refreshState(); redraw(); armTimer();
  });
  const events = ["agent_start", "message_start", "message_update", "message_end", "tool_execution_start", "tool_execution_end", "agent_before_settle", "agent_settled", "ui_prompt_start", "ui_prompt_end", "session_before_compact", "session_compact", "session_compact_failed"] as const;
  for (const type of events) pi.on(type, (event) => {
    responseLatency.handle(type, event);
    activity.handle(type, event); refreshState(); redraw(); armTimer();
  });
  pi.on("session_shutdown", () => {
    responseLatency.handle("session_shutdown");
    languageReleased = true;
    languagePatch?.dispose(); languagePatch = undefined;
    activity.handle("session_shutdown"); gestureVideos.clear(); release();
  });
  const registerQuickShortcut = () => pi.registerShortcut("ctrl+alt+w", {
    description: l("打开呜咪的快捷操作菜单", "Open Umi's quick actions"),
    handler: async (ctx) => {
      if (ctx.mode === "tui" && activeEditor) await activeEditor.openQuickActions();
    },
  });
  registerQuickShortcut();

  pi.registerCommand("mascot", {
    description: mascotDescription(settings.language),
    getArgumentCompletions: (argumentPrefix) => getMascotArgumentCompletions(argumentPrefix, settings.language),
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify(l("呜咪显示在 Pi 交互终端中。", "Umi appears in Pi's interactive terminal."), "info"); return; }
      const [command, value] = args.trim().toLowerCase().split(/\s+/);
      if (!command) {
        const state = (value: boolean) => value ? l("开启", "on") : l("关闭", "off");
        ctx.ui.notify(`${companionName(settings)}: ${state(settings.enabled)} · ${settings.layout} · ${settings.layout === "header" ? settings.headerStyle : settings.style} · ${selectedGraphicsMode()} · ${l("语气", "Persona ")}${state(settings.persona)}\n${l("语言", "Language")}: ${settings.language === "auto" ? `auto → ${resolveLanguage(settings.language)}` : settings.language} · ${l("界面中文偏好", "Chinese UI preference")}: ${state(settings.chineseUI)} · ${l("Pi 文档提示精简", "Concise Pi docs preference")}: ${state(settings.compactPrompt)}\n/mascot language auto|en|zh-CN|status\n/mascot poke · /mascot menu · Ctrl+Alt+W ${l("快捷操作", "Quick actions")}\n/mascot layout editor|header · style umi|umi-pixel|pixel|illustration\n/mascot pause|play|on|off · size auto|small|compact|normal|large\n/mascot render auto|kitty|sixel|blocks · info compact|native\n/mascot locale on|off|status · prompt on|off|status\n/mascot persona on|off|status\n/mascot action [all|${GESTURE_IDS.join("|")}|off]\n/mascot demo [all|${DEMO_STATES.join("|")}|off]\n${l("不填状态会自动循环全部动画；demo off 回到真实状态。", "Omit the state to loop every animation; demo off returns to the real state.")}`, "info"); return;
      }
      if (command === "language") {
        const next = normalizeLanguage(value);
        if (next) {
          settings.language = next;
          if (next === "auto") systemLanguage({ refresh: true });
          updateVoice(); lastSnapshot = undefined;
          registerQuickShortcut(); apply(ctx); save(ctx);
        } else if (value && value !== "status") {
          ctx.ui.notify(l("用法：/mascot language auto|en|zh-CN|status（zh 也可以）", "Usage: /mascot language auto|en|zh-CN|status (zh is also accepted)"), "warning"); return;
        }
        const languageStatus = settings.language === "auto" ? `auto → ${resolveLanguage(settings.language)}` : settings.language;
        ctx.ui.notify(l(`我现在说中文啦。语言：${languageStatus}。界面文案立即切换，Pi 文档提示精简与语气模板从下一轮生效；locale、prompt、persona 的偏好分别保留。`, `I'm speaking English now. Language: ${languageStatus}. UI text changes right away; concise Pi docs and persona apply from the next turn. Your locale, prompt and persona preferences stay independent.`), "info");
        return;
      }
      if (command === "locale" || command === "prompt") {
        const key = command === "locale" ? "chineseUI" : "compactPrompt";
        if (value === "on" || value === "off") { settings[key] = value === "on"; save(ctx); redraw(); }
        else if (value && value !== "status") { ctx.ui.notify(`${l("用法：", "Usage: ")}/mascot ${command} on|off|status`, "warning"); return; }
        const name = command === "locale" ? l("Pi 界面中文", "Pi Chinese UI preference") : l("Pi 文档提示精简", "Concise Pi documentation prompt");
        const state = settings[key] ? l("开启", "on") : l("关闭", "off");
        const effect = command === "locale" ? l("下次绘制或打开原生菜单时生效。", "English uses Pi's native UI; this preference is saved for Chinese mode. ")
          : l("仅精简 Pi 文档提示章节，跟随当前语言，从下一轮生效；关闭后恢复该章节原文。身份、tools、rules 保持 Pi 原生，项目指令与其他扩展保持动态。", "Only Pi's documentation section is condensed in your language from the next request; off restores that section. Identity, tools and rules stay native, while project instructions and other extensions remain dynamic. ");
        ctx.ui.notify(`${name}: ${state}. ${effect}${l("呜咪 persona 开关保持独立。", "Umi's persona switch stays independent.")}`, "info");
        return;
      }
      if (command === "menu") {
        if (activeEditor) await activeEditor.openQuickActions();
        else ctx.ui.notify(l("先让我回到输入框旁边吧：/mascot layout editor，再打开快捷菜单呀。", "Bring me beside the editor with /mascot layout editor, then open the quick menu."), "info");
        return;
      }
      if (command === "persona") {
        if (value === "on" || value === "off") { settings.persona = value === "on"; save(ctx); }
        else if (value && value !== "status") { ctx.ui.notify(l("用法：/mascot persona on|off|status", "Usage: /mascot persona on|off|status"), "warning"); return; }
        ctx.ui.notify(`${l(`呜咪语气：${settings.persona ? "开启" : "关闭"}。从下一轮回答生效，独立于头像显示开关；代码、格式和技术准确性优先。模板：`, `Umi's persona: ${settings.persona ? "on" : "off"}. Applies from the next answer, independently of the avatar. Code, format and technical accuracy come first. Template: `)}${join(root, "prompts", personaFilename(settings.language))}`, "info");
        return;
      }
      if (command === "poke") {
        if (settings.layout !== "editor" || !settings.enabled) {
          ctx.ui.notify(l("先让我回到输入框旁边呀：/mascot on，然后 /mascot layout editor。", "Bring me beside your input with /mascot on, then /mascot layout editor."), "info");
          return;
        }
        activity.poke(); lastSnapshot = undefined; redraw(); armTimer();
        return;
      }
      if (command === "pause") { settings.animation = false; activity.clearTyping(); lastSnapshot = pausedSnapshot(readSnapshot()); stopTimer(); redraw(); if (activity.isPoked()) armTimer(); }
      else if (command === "play") { settings.enabled = true; settings.animation = true; apply(ctx); }
      else if (command === "off") { settings.enabled = false; apply(ctx); }
      else if (command === "on") { settings.enabled = true; apply(ctx); }
      else if (command === "layout" && ["editor", "header"].includes(value)) { settings.layout = value; apply(ctx); }
      else if (command === "style" && normalizeStyle(value)) {
        const style = normalizeStyle(value)!;
        if (settings.layout === "header" && ["umi", "umi-pixel"].includes(style)) { ctx.ui.notify(l("我的这些动作要在输入框旁边才能看见呀。先用 /mascot layout editor；标题版可选 pixel 或 illustration。", "My reaction poses appear beside your input. Use /mascot layout editor first. The title supports pixel or illustration."), "info"); return; }
        if (settings.layout === "header") settings.headerStyle = style; else settings.style = style;
        apply(ctx);
      }
      else if (command === "size" && SIZES.includes(value)) { if (settings.layout === "editor") settings.dockSize = value; else settings.size = value; apply(ctx); }
      else if (command === "render" && ["auto", "kitty", "sixel", "blocks"].includes(value)) { settings.renderer = value; apply(ctx); }
      else if (command === "info" && ["compact", "native"].includes(value)) { settings.info = value; apply(ctx); }
      else if (command === "action") {
        const mode = value || "all";
        if (mode !== "all" && mode !== "off" && !GESTURE_IDS.includes(mode)) {
          ctx.ui.notify(`action: all | ${GESTURE_IDS.join(" | ")} | off`, "info"); return;
        }
        if (!activity.playGesture(mode)) {
          ctx.ui.notify(l("我先把手边这一步看好，空下来再给你演呀。", "Let me finish this bit first. I'll show you when I'm free."), "info"); return;
        }
        lastSnapshot = undefined; redraw(); armTimer();
        ctx.ui.notify(l("小动作已切换；/mascot action off 收起来。", "Gesture updated; /mascot action off stops the loop."), "info"); return;
      }
      else if (command === "demo" && (!value || value === "all" || DEMO_STATES.includes(value) || value === "off")) {
        const mode = value || "all";
        activity.setDemo(mode); lastSnapshot = undefined; redraw(); armTimer();
        const message = mode === "off" ? l("好啦，演示收起来，回到真正的任务状态咯。", "The tour is off. I'm back to the real task state.")
          : mode === "all" ? l("我来把全部动作轮流演给你看呀，会一直循环。用 /mascot demo off 收起来；真正开始任务时也会自动退出。", "I'll show every animation in a loop. Use /mascot demo off to stop; starting a real task also ends the tour.")
          : l(`我来演示 ${mode} 这个动作呀。用 /mascot demo off 回到真实状态。`, `I'll show you my ${mode} pose. Use /mascot demo off to return to the real state.`);
        const hint = mode === "off" ? "" : (!settings.enabled ? l(" 我暂时躲起来啦，用 /mascot on 叫我出来吧。", " I'm tucked away right now; use /mascot on to show me.") : "")
          + (!settings.animation ? l(" 我先乖乖不动啦，用 /mascot play 再看我动起来呀。", " I'm holding still right now; use /mascot play to watch me move.") : "")
          + (settings.layout !== "editor" ? l(" 全部动作显示在输入框旁，用 /mascot layout editor 就能看到了。", " The full set of poses appears beside the input; use /mascot layout editor to see it.") : "");
        ctx.ui.notify(message + hint, "info"); return;
      }
      else if (command === "wink") {
        if (settings.layout === "editor") activity.setDemo("waking");
        else { headerFrame = Math.max(0, titleSheets().native.frames.findIndex((frame: any) => frame.wink)); header?.setFrame(headerFrame); }
        lastSnapshot = undefined; redraw(); armTimer();
      } else { ctx.ui.notify(l("输入 /mascot 查看用法。demo 仅预览外观，不调用模型；/mascot demo off 返回真实状态。", "Type /mascot for help. Demo only previews the animation and makes no model requests; /mascot demo off returns to the real state."), "warning"); return; }
      save(ctx);
      if (command !== "demo" && command !== "wink") ctx.ui.notify(`${companionName(settings)}: ${settings.enabled ? l("开启", "on") : l("关闭", "off")} · ${settings.layout} · ${settings.layout === "header" ? settings.headerStyle : settings.style} · ${settings.animation ? l("动画开启", "Animation playing") : l("动画暂停", "Animation paused")}`, "info");
    },
  });
}
