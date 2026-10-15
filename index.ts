import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as agentUI from "@earendil-works/pi-coding-agent";
import * as tuiUI from "@earendil-works/pi-tui";
import { CURSOR_MARKER, getCellDimensions, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { createHeader, headerCanAnimate, renderPixels, safeText, samplePixels, terminalVariants } from "./lib/renderer.mjs";
import { createSixelTransport, graphicsMode } from "./lib/sixel.mjs";
import { createActivity, DEMO_STATES } from "./lib/activity.mjs";
import { dockGeometry, renderDock, joinEditor, activityBorder, editorFrameGeometry, frameEditorLines } from "./lib/editor-layout.mjs";
import { createStatusFooter } from "./lib/footer.mjs";
import { createMotionPlayer } from "./lib/motion.mjs";
import { createEditorControls } from "./lib/editor-controls.mjs";
import { createOverlayVisibility } from "./lib/overlay-visibility.mjs";
import { createQuickActions } from "./lib/quick-actions.mjs";
import { compactNativePrompt } from "./lib/native-prompt.mjs";
import { installChineseUi } from "./lib/ui-chinese.mjs";
import { createChineseAutocompleteFactory } from "./lib/command-chinese.mjs";
import { normalizeLanguage, localize, localizeSnapshot, replaceActivityCopy, nativeChineseEnabled, compactChineseEnabled, personaFilename, companionName, companionSubtitle, mascotDescription } from "./lib/language.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, "config.json");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const DEFAULTS = {
  name: "呜咪", subtitle: "你的工作搭档", enabled: true, animation: true, persona: false,
  layout: "editor", style: "wumi", headerStyle: "pixel", renderer: "auto",
  size: "auto", dockSize: "auto", info: "compact", optimizeEditor: true,
  chineseUI: true, compactPrompt: true, language: "zh-CN",
};
const SIZES = ["auto", "small", "compact", "normal", "large"];
const STYLES = ["wumi", "wumi-pixel", "pixel", "illustration"];
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
    if (["auto", "sixel", "blocks"].includes(saved.renderer)) settings.renderer = saved.renderer;
    if (["editor", "header"].includes(saved.layout)) settings.layout = saved.layout;
    if (STYLES.includes(saved.style)) settings.style = saved.style;
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
    const selected = settings.language === "en" ? voices.en : voices["zh-CN"];
    replaceActivityCopy(voice, selected.copy, selected.phrases);
  }
  updateVoice();
  const activity = createActivity({ ...voice, rotationMs: voices["zh-CN"].phrases.rotationMs });
  const readSnapshot = () => localizeSnapshot(activity.snapshot(), settings.language);
  const reactions = new Map<string, any>();
  const headerSheets = new Map<string, { native: any; fallback: any }>();
  function reactionSheet() {
    if (!reactions.has(settings.style)) reactions.set(settings.style, read(`assets/reactions/${settings.style}/reaction-sheet.json`));
    return reactions.get(settings.style);
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

  function snapshot() {
    if (settings.animation || !lastSnapshot) lastSnapshot = readSnapshot();
    return lastSnapshot;
  }
  function refreshState() {
    if (!settings.animation && lastSnapshot) {
      const next = readSnapshot();
      // Pausing keeps motion still while real state and tool metadata remain live.
      lastSnapshot = next.phase === lastSnapshot.phase ? {
        ...next, face: lastSnapshot.face, blink: lastSnapshot.blink,
        bubble: lastSnapshot.bubble, glyph: lastSnapshot.glyph, phrase: lastSnapshot.phrase,
      } : next;
    } else lastSnapshot = undefined;
  }
  function stopTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function visible() { return tui && (settings.layout === "editor" || !tui.hasOverlay()); }
  function redraw() { if (!suspended) tui?.requestRender(); }
  function armTimer() {
    // Token events must not continually postpone the animation deadline.
    if (timer !== undefined || suspended || !settings.enabled || !settings.animation || !tui) return;
    if (settings.layout === "header" && !header) return;
    const delay = settings.layout === "header"
      ? Math.max(60, titleSheets().native.frames[headerFrame].durationMs)
      : 50;
    timer = setTimeout(() => {
      timer = undefined;
      if (suspended) return;
      if (visible() && (settings.layout !== "header" || headerCanAnimate(tui))) {
        if (settings.layout === "header") {
          headerFrame = (headerFrame + 1) % titleSheets().native.frames.length;
          header?.setFrame(headerFrame);
        }
        lastSnapshot = undefined;
        redraw();
      }
      armTimer();
    }, visible() ? delay : 800);
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
    class WumiEditor extends CustomEditor {
      private transport: ReturnType<typeof createSixelTransport> | undefined;
      private overlayVisibility: ReturnType<typeof createOverlayVisibility>;
      private geometry: ReturnType<typeof joinEditor> | undefined;
      private motion = createMotionPlayer();
      private displaySheet: any;
      private toolbarLine: string | undefined;
      private toolbarRow = -1;
      private frameWidth = 0;
      private avatarBounds: any;
      private shortcutKeys: any;
      private quickActions = createQuickActions({
        ctx, pi, getEditor: () => this,
        getLanguage: () => settings.language,
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
          if (action === "send") this.handleInput("\r");
          else if (action === "newline") this.insertTextAtCursor("\n");
          else if (["model", "thinking", "menu"].includes(action)) void this.openQuickActions(action);
          else if (action === "animation") {
            settings.animation = !settings.animation;
            if (!settings.animation) { lastSnapshot = readSnapshot(); stopTimer(); }
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
        activeEditor = this;
        armTimer();
      }
      openQuickActions(action = "menu") { return this.quickActions.run(action); }
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
        const dockLines = renderDock({
          geometry, sheet: reactionSheet(), snapshot: current,
          motionPlayer: this.motion, animate: settings.animation,
          renderAvatar: (frame: any) => {
            this.displaySheet = frame.sheet;
            return graphicsMode(settings.renderer) === "sixel" ? this.transport?.render(frame) : undefined;
          },
          theme: ctx.ui.theme, visibleWidth, truncateToWidth, renderPixels, samplePixels,
        });
        this.geometry = joinEditor({ width, nativeLines: framedLines, dockLines, geometry, snapshot: current, theme: ctx.ui.theme, visibleWidth, truncateToWidth, editorInset: frame.inset, nativeRenderWidth });
        if (toolbarIndex >= 0) this.toolbarRow = this.geometry.offsetY + toolbarIndex;
        this.avatarBounds = geometry.collapsed || tui?.mode !== "fullscreen" ? undefined : { x: 0, y: 3, width: geometry.columns, height: geometry.rows };
        return this.geometry.lines;
      }
      handleMouse(event: any) {
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
      dispose() { this.quickActions.dispose(); this.transport?.dispose(); this.transport = undefined; this.overlayVisibility.dispose(); this.motion.dispose(); this.controls.dispose(); }
    }
    editorFactory = (editorTui, theme, keybindings) => new WumiEditor(editorTui, theme, keybindings);
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
        const transport = createSixelTransport(headerTui.terminal, getCellDimensions, () => sheets.native,
          () => settings.headerStyle, () => !headerTui.hasOverlay(), process.env, visibleWidth, () => terminalCursor(headerTui));
        headerTransport = transport;
        const component = createHeader({
          sheet: sheets.fallback,
          getSettings: () => ({ ...settings, name: companionName(settings), subtitle: l("你的像素搭档 · 一起把想法变成现实", "Your pixel partner · Let's bring ideas to life") }),
          getSnapshot: () => ({ busy: snapshot().busy, status: snapshot().label, model: ctx.model?.id, provider: ctx.model?.provider }),
          getRows: () => headerTui.terminal.rows || 30,
          theme: { fg: (token, text) => ctx.ui.theme.fg(token, text), bold: (text) => ctx.ui.theme.bold(text) },
          visibleWidth, truncateToWidth,
          renderAvatar: (frame: any) => graphicsMode(settings.renderer) === "sixel" ? transport.render(frame) : undefined,
        });
        header = component; component.setFrame(headerFrame);
        let lastWidth = -1, lastLines: string[] | undefined;
        return {
          render(width) {
            // A changing offscreen header makes Pi's main screen clear scrollback.
            if ((!headerCanAnimate(headerTui) || headerTui.hasOverlay()) && lastLines && lastWidth === width) return lastLines;
            lastWidth = width; lastLines = component.render(width); return lastLines;
          },
          invalidate: () => component.invalidate(),
          dispose() {
            transport.dispose();
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
    let systemPrompt = event.systemPrompt;
    if (compactChineseEnabled(settings)) {
      try {
        systemPrompt = compactNativePrompt({ systemPrompt, piVersion: agentUI.VERSION,
          systemPromptOptions: event.systemPromptOptions, enabled: true,
          basePrompt: readFileSync(join(root, "prompts", "pi-system-zh.md"), "utf8") }).systemPrompt;
      } catch (error) {
        ctx.ui.notify(`${l("中文精简提示词不可用，本轮保留原提示词：", "The compact Chinese prompt isn't available; I've kept the original for this turn: ")}${(error as Error).message}`, "warning");
      }
    }
    if (!settings.persona) return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    try {
      // Append for this run only. Preserve every existing system instruction.
      const template = readFileSync(join(root, "prompts", personaFilename(settings.language)), "utf8").trim();
      if (!template) throw new Error(l("模板内容为空", "The template is empty"));
      return { systemPrompt: `${systemPrompt}\n\n${template}` };
    } catch (error) {
      ctx.ui.notify(`${l("呜咪语气模板不可用，已跳过本轮角色口吻：", "Umi's style template isn't available; I've skipped the persona for this turn: ")}${(error as Error).message}`, "warning");
      return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    }
  });
  pi.on("session_start", (event, ctx) => {
    installLanguage(ctx);
    activity.start({ isBusy: !ctx.isIdle(), wake: event.reason !== "reload" });
    apply(ctx);
  });
  const events = ["agent_start", "message_start", "message_update", "message_end", "tool_execution_start", "tool_execution_end", "agent_before_settle", "agent_settled", "ui_prompt_start", "ui_prompt_end", "session_before_compact", "session_compact", "session_compact_failed"] as const;
  for (const type of events) pi.on(type, (event) => {
    activity.handle(type, event); refreshState(); redraw(); armTimer();
  });
  pi.on("session_shutdown", () => {
    languageReleased = true;
    languagePatch?.dispose(); languagePatch = undefined;
    activity.handle("session_shutdown"); release();
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
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify(l("呜咪显示在 Pi 交互终端中。", "Umi appears in Pi's interactive terminal."), "info"); return; }
      const [command, value] = args.trim().toLowerCase().split(/\s+/);
      if (!command) {
        const state = (value: boolean) => value ? l("开启", "on") : l("关闭", "off");
        ctx.ui.notify(`${companionName(settings)}: ${state(settings.enabled)} · ${settings.layout} · ${settings.layout === "header" ? settings.headerStyle : settings.style} · ${graphicsMode(settings.renderer)} · ${l("语气", "Persona ")}${state(settings.persona)}\n${l("语言", "Language")}: ${settings.language} · ${l("界面中文偏好", "Chinese UI preference")}: ${state(settings.chineseUI)} · ${l("中文精简提示词偏好", "Compact Chinese prompt preference")}: ${state(settings.compactPrompt)}\n/mascot language en|zh-CN|status\n/mascot menu · Ctrl+Alt+W ${l("快捷操作", "Quick actions")}\n/mascot layout editor|header · style wumi|wumi-pixel|pixel|illustration\n/mascot pause|play|on|off · size auto|small|compact|normal|large\n/mascot render auto|sixel|blocks · info compact|native\n/mascot locale on|off|status · prompt on|off|status\n/mascot persona on|off|status\n/mascot demo ${DEMO_STATES.join("|")}|off`, "info"); return;
      }
      if (command === "language") {
        const next = normalizeLanguage(value);
        if (next) {
          settings.language = next;
          updateVoice(); lastSnapshot = undefined;
          registerQuickShortcut(); apply(ctx); save(ctx);
        } else if (value && value !== "status") {
          ctx.ui.notify(l("用法：/mascot language en|zh-CN|status（zh 也可以）", "Usage: /mascot language en|zh-CN|status (zh is also accepted)"), "warning"); return;
        }
        ctx.ui.notify(l(`呜咪现在说中文啦。语言：${settings.language}。界面文案立即切换，提示词与语气模板从下一轮生效；locale、prompt、persona 的偏好分别保留。`, `I'm speaking English now. Language: ${settings.language}. UI text changes right away; prompts and persona apply from the next turn. Your locale, prompt and persona preferences stay independent.`), "info");
        return;
      }
      if (command === "locale" || command === "prompt") {
        const key = command === "locale" ? "chineseUI" : "compactPrompt";
        if (value === "on" || value === "off") { settings[key] = value === "on"; save(ctx); redraw(); }
        else if (value && value !== "status") { ctx.ui.notify(`${l("用法：", "Usage: ")}/mascot ${command} on|off|status`, "warning"); return; }
        const name = command === "locale" ? l("Pi 界面中文", "Pi Chinese UI preference") : l("Pi 中文精简提示词", "Pi compact Chinese prompt preference");
        const state = settings[key] ? l("开启", "on") : l("关闭", "off");
        const effect = settings.language === "en" ? "English mode keeps Pi's native English UI and default system prompt; this preference is saved for Chinese mode. "
          : command === "locale" ? "下次绘制或打开原生菜单时生效。" : "从下一轮请求生效；自定义 SYSTEM.md 和其它项目指令保持原文。";
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
      if (command === "pause") { settings.animation = false; lastSnapshot = readSnapshot(); stopTimer(); redraw(); }
      else if (command === "play") { settings.enabled = true; settings.animation = true; apply(ctx); }
      else if (command === "off") { settings.enabled = false; apply(ctx); }
      else if (command === "on") { settings.enabled = true; apply(ctx); }
      else if (command === "layout" && ["editor", "header"].includes(value)) { settings.layout = value; apply(ctx); }
      else if (command === "style" && STYLES.includes(value)) {
        if (settings.layout === "header" && ["wumi", "wumi-pixel"].includes(value)) { ctx.ui.notify(l("呜咪多姿态用于输入框版，请先执行 /mascot layout editor。标题版可选 pixel 或 illustration。", "Umi's reaction poses belong beside the editor. Run /mascot layout editor first. The title supports pixel or illustration."), "info"); return; }
        if (settings.layout === "header") settings.headerStyle = value; else settings.style = value;
        apply(ctx);
      }
      else if (command === "size" && SIZES.includes(value)) { if (settings.layout === "editor") settings.dockSize = value; else settings.size = value; apply(ctx); }
      else if (command === "render" && ["auto", "sixel", "blocks"].includes(value)) { settings.renderer = value; apply(ctx); }
      else if (command === "info" && ["compact", "native"].includes(value)) { settings.info = value; apply(ctx); }
      else if (command === "demo" && (DEMO_STATES.includes(value) || value === "off")) {
        activity.setDemo(value); lastSnapshot = undefined; redraw(); armTimer();
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
