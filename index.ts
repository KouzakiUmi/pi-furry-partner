import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as agentUI from "@earendil-works/pi-coding-agent";
import * as tuiUI from "@earendil-works/pi-tui";
import { getCellDimensions, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { createHeader, headerCanAnimate, renderPixels, safeText, samplePixels, terminalVariants } from "./lib/renderer.mjs";
import { createSixelTransport, graphicsMode } from "./lib/sixel.mjs";
import { createActivity, DEMO_STATES } from "./lib/activity.mjs";
import { dockGeometry, renderDock, joinEditor, activityBorder } from "./lib/editor-layout.mjs";
import { createStatusFooter } from "./lib/footer.mjs";
import { createMotionPlayer } from "./lib/motion.mjs";
import { createEditorControls } from "./lib/editor-controls.mjs";
import { createOverlayVisibility } from "./lib/overlay-visibility.mjs";
import { createQuickActions } from "./lib/quick-actions.mjs";
import { compactNativePrompt } from "./lib/native-prompt.mjs";
import { installChineseUi } from "./lib/ui-chinese.mjs";
import { createChineseAutocompleteFactory } from "./lib/command-chinese.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const configPath = join(root, "config.json");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const DEFAULTS = {
  name: "呜咪", subtitle: "你的工作搭档", enabled: true, animation: true, persona: false,
  layout: "editor", style: "wumi", headerStyle: "pixel", renderer: "auto",
  size: "auto", dockSize: "auto", info: "compact", optimizeEditor: true,
  chineseUI: true, compactPrompt: true,
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
  } catch { /* A missing or malformed preference file uses safe defaults. */ }

  const phraseData = read("assets/status-phrases.json");
  const voiceCopy = read("assets/status-copy.json");
  const activity = createActivity({ phrases: phraseData.phrases, labels: voiceCopy.labels, bubbles: voiceCopy.bubbles, rotationMs: phraseData.rotationMs });
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
    languagePatch = installChineseUi({ agentUI, tuiUI, version: agentUI.VERSION, isEnabled: () => !languageReleased && settings.chineseUI });
    if (!autocompleteRegistered && typeof ctx.ui.addAutocompleteProvider === "function") {
      ctx.ui.addAutocompleteProvider(createChineseAutocompleteFactory({ isEnabled: () => !languageReleased && settings.chineseUI }));
      autocompleteRegistered = true;
    }
  }

  function snapshot() {
    if (settings.animation || !lastSnapshot) lastSnapshot = activity.snapshot();
    return lastSnapshot;
  }
  function refreshState() {
    if (!settings.animation && lastSnapshot) {
      const next = activity.snapshot();
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
      ctx.ui.notify("检测到其他扩展的输入框，已保留。可用 /mascot layout header 显示标题头像。", "warning");
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
      private avatarBounds: any;
      private shortcutKeys: any;
      private quickActions = createQuickActions({
        ctx, pi, getEditor: () => this,
        isBlocked: () => suspended || activeEditor !== this || tui?.hasOverlay() || !this.focused,
        showDetails: (title: string, lines: string[]) => this.showDetails(title, lines),
        onChange: () => redraw(),
      });
      private controls = createEditorControls({
        visibleWidth,
        getState: () => ({ animation: settings.animation, persona: settings.persona, style: settings.style, hasText: Boolean(this.getText().trim()), busy: !ctx.isIdle(), mode: tui?.mode === "fullscreen" ? "fullscreen" : "regular" }),
        getKeys: (action: string) => this.shortcutKeys?.getKeys(action),
        onAction: (action: string) => {
          if (action === "send") this.handleInput("\r");
          else if (action === "newline") this.insertTextAtCursor("\n");
          else if (["model", "thinking", "menu"].includes(action)) void this.openQuickActions(action);
          else if (action === "animation") {
            settings.animation = !settings.animation;
            if (!settings.animation) { lastSnapshot = activity.snapshot(); stopTimer(); }
            else { lastSnapshot = undefined; armTimer(); }
            save(ctx); redraw();
          } else if (action === "persona") { settings.persona = !settings.persona; save(ctx); redraw(); }
          else if (action === "style") {
            void (async () => {
              const outfits = ["呜咪角色版", "呜咪像素版", "原像素", "旧插画"];
              const selected = await ctx.ui.select("想让我换哪一身呀？", outfits);
              const index = outfits.indexOf(selected || "");
              if (index >= 0) { settings.style = STYLES[index]; apply(ctx); save(ctx); }
            })().catch((error) => ctx.ui.notify(`换装没有完成：${(error as Error).message}`, "warning"));
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
                row(theme.fg("dim", `↑↓ / PgUp PgDn 翻页 · Enter / Esc 返回 · ${Math.min(offset + pageRows, totalRows)}/${totalRows}`)), edge("╰", "╯")];
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
        const geometry = dockGeometry(width, tui?.terminal.rows || 30, settings.dockSize);
        this.toolbarLine = undefined; this.toolbarRow = -1;
        this.controls.render(0);
        const nativeLines = super.render(Math.max(1, width - geometry.leftWidth));
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
        this.geometry = joinEditor({ width, nativeLines, dockLines, geometry, snapshot: current, theme: ctx.ui.theme, visibleWidth, truncateToWidth });
        const toolbarIndex = this.toolbarLine ? nativeLines.indexOf(this.toolbarLine) : -1;
        if (toolbarIndex >= 0) this.toolbarRow = this.geometry.offsetY + toolbarIndex;
        this.avatarBounds = geometry.collapsed || tui?.mode !== "fullscreen" ? undefined : { x: 0, y: 3, width: geometry.columns, height: geometry.rows };
        return this.geometry.lines;
      }
      handleMouse(event: any) {
        const geometry = this.geometry;
        if (!geometry) return undefined;
        const control = tui?.mode === "fullscreen" ? this.controls.handleMouse(event, { row: this.toolbarRow, offsetX: geometry.leftWidth + 3, avatar: this.avatarBounds }) : undefined;
        if (control) return control;
        if (event.x < geometry.leftWidth || event.y < geometry.offsetY || event.y >= geometry.offsetY + geometry.nativeHeight) return undefined;
        return super.handleMouse({ ...event, x: event.x - geometry.leftWidth, y: event.y - geometry.offsetY, width: geometry.editorWidth, height: geometry.nativeHeight });
      }
      protected renderTopBorder(width: number, hiddenLineCount: number): string {
        return activityBorder({ snapshot: snapshot(), width, hiddenLineCount,
          theme: ctx.ui.theme, visibleWidth, truncateToWidth, borderColor: (text: string) => this.borderColor(text) });
      }
      protected renderBottomBorder(width: number, hiddenLineCount: number): string {
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
          render: (width) => [truncateToWidth(ctx.ui.theme.bold(ctx.ui.theme.fg("accent", `${settings.name} · ${settings.subtitle}`)), width, "…")],
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
          const component = createStatusFooter({ ctx, tui: footerTui, theme, footerData, visibleWidth, truncateToWidth, getThinkingLevel: () => pi.getThinkingLevel() });
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
          getSettings: () => ({ ...settings, name: settings.name, subtitle: "你的像素搭档 · 一起把想法变成现实" }),
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
    catch (error) { ctx.ui.notify(`设置已应用，但无法保存：${(error as Error).message}`, "warning"); }
  }
  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    let systemPrompt = event.systemPrompt;
    if (settings.compactPrompt) {
      try {
        systemPrompt = compactNativePrompt({ systemPrompt, piVersion: agentUI.VERSION,
          systemPromptOptions: event.systemPromptOptions, enabled: true,
          basePrompt: readFileSync(join(root, "prompts", "pi-system-zh.md"), "utf8") }).systemPrompt;
      } catch (error) {
        ctx.ui.notify(`中文精简提示词不可用，本轮保留原提示词：${(error as Error).message}`, "warning");
      }
    }
    if (!settings.persona) return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
    try {
      // Append for this run only. Preserve every existing system instruction.
      const template = readFileSync(join(root, "prompts", "wumi-persona.md"), "utf8").trim();
      if (!template) throw new Error("模板内容为空");
      return { systemPrompt: `${systemPrompt}\n\n${template}` };
    } catch (error) {
      ctx.ui.notify(`呜咪语气模板不可用，已跳过本轮角色口吻：${(error as Error).message}`, "warning");
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
  pi.registerShortcut("ctrl+alt+w", {
    description: "打开呜咪的快捷操作菜单",
    handler: async (ctx) => {
      if (ctx.mode === "tui" && activeEditor) await activeEditor.openQuickActions();
    },
  });

  pi.registerCommand("mascot", {
    description: "呜咪：menu · locale/prompt/persona on|off|status · layout · style · demo · pause|play · size · info · render",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("呜咪显示在 Pi 交互终端中。", "info"); return; }
      const [command, value] = args.trim().toLowerCase().split(/\s+/);
      if (!command) {
        ctx.ui.notify(`呜咪：${settings.enabled ? "开启" : "关闭"} · ${settings.layout} · ${settings.layout === "header" ? settings.headerStyle : settings.style} · ${graphicsMode(settings.renderer)} · 语气${settings.persona ? "开启" : "关闭"}\n界面中文${settings.chineseUI ? "开启" : "关闭"} · Pi 中文精简提示词${settings.compactPrompt ? "开启" : "关闭"}\n/mascot menu · Ctrl+Alt+W 快捷操作\n/mascot layout editor|header · style wumi|wumi-pixel|pixel|illustration\n/mascot pause|play|on|off · size auto|small|compact|normal|large\n/mascot render auto|sixel|blocks · info compact|native\n/mascot locale on|off|status · prompt on|off|status\n/mascot persona on|off|status\n/mascot demo ${DEMO_STATES.join("|")}|off`, "info"); return;
      }
      if (command === "locale" || command === "prompt") {
        const key = command === "locale" ? "chineseUI" : "compactPrompt";
        if (value === "on" || value === "off") { settings[key] = value === "on"; save(ctx); redraw(); }
        else if (value && value !== "status") { ctx.ui.notify(`用法：/mascot ${command} on|off|status`, "warning"); return; }
        const name = command === "locale" ? "Pi 界面中文" : "Pi 中文精简提示词";
        ctx.ui.notify(`${name}：${settings[key] ? "开启" : "关闭"}。${command === "locale" ? "下次绘制或打开原生菜单时生效。" : "从下一轮请求生效；自定义 SYSTEM.md 和其它项目指令保持原文。"}呜咪 persona 开关保持独立。`, "info");
        return;
      }
      if (command === "menu") {
        if (activeEditor) await activeEditor.openQuickActions();
        else ctx.ui.notify("先让我回到输入框旁边吧：/mascot layout editor，再打开快捷菜单呀。", "info");
        return;
      }
      if (command === "persona") {
        if (value === "on" || value === "off") { settings.persona = value === "on"; save(ctx); }
        else if (value && value !== "status") { ctx.ui.notify("用法：/mascot persona on|off|status", "warning"); return; }
        ctx.ui.notify(`呜咪语气：${settings.persona ? "开启" : "关闭"}。从下一轮回答生效，独立于头像显示开关；代码、格式和技术准确性优先。模板：${join(root, "prompts", "wumi-persona.md")}`, "info");
        return;
      }
      if (command === "pause") { settings.animation = false; lastSnapshot = activity.snapshot(); stopTimer(); redraw(); }
      else if (command === "play") { settings.enabled = true; settings.animation = true; apply(ctx); }
      else if (command === "off") { settings.enabled = false; apply(ctx); }
      else if (command === "on") { settings.enabled = true; apply(ctx); }
      else if (command === "layout" && ["editor", "header"].includes(value)) { settings.layout = value; apply(ctx); }
      else if (command === "style" && STYLES.includes(value)) {
        if (settings.layout === "header" && ["wumi", "wumi-pixel"].includes(value)) { ctx.ui.notify("呜咪多姿态用于输入框版，请先执行 /mascot layout editor。标题版可选 pixel 或 illustration。", "info"); return; }
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
      } else { ctx.ui.notify("输入 /mascot 查看用法。demo 仅预览外观，不调用模型；/mascot demo off 返回真实状态。", "warning"); return; }
      save(ctx);
      if (command !== "demo" && command !== "wink") ctx.ui.notify(`呜咪：${settings.enabled ? "开启" : "关闭"} · ${settings.layout} · ${settings.layout === "header" ? settings.headerStyle : settings.style} · ${settings.animation ? "动画开启" : "动画暂停"}`, "info");
    },
  });
}
