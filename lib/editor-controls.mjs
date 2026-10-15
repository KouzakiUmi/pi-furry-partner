// Mouse controls only describe local UI intent. The host owns commands/submission.
// Render this in an existing border row; it adds no height and never edits text.
const identity = (text) => text;
import { localize } from "./language.mjs";
const EN_LABELS = { send: "Send", newline: "New line", settings: "Settings", model: "Model", thinking: "Thinking", menu: "More" };
const HINTS = [
  { id: "send", label: "发送", action: "tui.input.submit", fallback: "enter", priority: 1 },
  { id: "newline", label: "换行", action: "tui.input.newLine", fallback: "shift+enter", priority: 2 },
  { id: "settings", label: "设置", key: "/mascot", priority: 5 },
  { id: "model", label: "模型", action: "app.model.select", fallback: "ctrl+l", priority: 3, right: true },
  { id: "thinking", label: "思考", action: "app.thinking.cycle", fallback: "shift+tab", priority: 4, right: true },
  { id: "menu", label: "更多", key: "ctrl+alt+w", priority: 0, right: true },
];
const keyLabel = (key) => key.startsWith("/") ? key : key.split("+").map((part) => ({
  ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta", enter: "Enter", escape: "Esc", tab: "Tab", space: "Space",
}[part] || (part.length === 1 ? part.toUpperCase() : part))).join("+");

// These are text hints, never mouse targets. Read native bindings at render time
// so custom keybindings and live TUI mode changes do not leave misleading keys.
export function renderKeyboardHints(width, { visibleWidth = (text) => [...text].length, getKeys = () => undefined, theme, language = "zh-CN" } = {}) {
  width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  if (!width) return "";
  const hints = HINTS.flatMap((hint) => {
    const keys = hint.action ? getKeys(hint.action) : undefined;
    const key = hint.key || (keys === undefined ? hint.fallback : keys[0]);
    if (!key) return [];
    return [{ ...hint, text: `${keyLabel(String(key))} ${localize(language, hint.label, EN_LABELS[hint.id])}` }];
  });
  const allowed = new Set();
  let remaining = width;
  for (const hint of [...hints].sort((a, b) => a.priority - b.priority)) {
    const size = visibleWidth(hint.text) + (allowed.size ? 1 : 0);
    if (size <= remaining) { allowed.add(hint.id); remaining -= size; }
  }
  const left = hints.filter((hint) => allowed.has(hint.id) && !hint.right).map((hint) => hint.text).join(" ");
  const right = hints.filter((hint) => allowed.has(hint.id) && hint.right).map((hint) => hint.text).join(" ");
  const tint = (text) => theme?.fg ? theme.fg("dim", text) : text;
  return tint(left) + " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right))) + tint(right);
}

export function createEditorControls({ visibleWidth = (text) => [...text].length, getState = () => ({}), getKeys = () => undefined, onAction = () => {}, getLanguage = () => "zh-CN" } = {}) {
  let regions = [], armed = false, disposed = false;
  const l = (zh, en) => localize(getLanguage(), zh, en);
  const stateButtons = (state) => [
    { id: "send", label: l("发送", "Send"), enabled: state.hasText !== false, priority: 0 },
    { id: "newline", label: l("换行", "New line"), enabled: true, priority: 6 },
    { id: "style", label: l("换装", "Style"), enabled: true, priority: 5 },
    { id: "persona", label: l(`语气${state.persona ? "开" : "关"}`, `Persona ${state.persona ? "on" : "off"}`), enabled: true, priority: 7 },
    { id: "animation", label: state.animation === false ? l("播放", "Play") : l("暂停", "Pause"), enabled: true, priority: 4 },
    { id: "model", label: l("模型", "Model"), enabled: !state.busy, priority: 2, right: true },
    { id: "thinking", label: l("思考", "Thinking"), enabled: !state.busy, priority: 3, right: true },
    { id: "menu", label: l("更多", "More"), enabled: true, priority: 1, right: true },
  ];
  const hit = (event, { row, offsetX = 0, avatar } = {}) => {
    if (avatar && event.x >= avatar.x && event.x < avatar.x + avatar.width && event.y >= avatar.y && event.y < avatar.y + avatar.height) return "animation";
    if (event.y !== row) return undefined;
    const x = event.x - offsetX;
    return regions.find((region) => region.enabled && x >= region.start && x < region.end)?.id;
  };
  return {
    render(width, theme) {
      regions = [];
      width = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
      if (disposed || width <= 0) return "";
      const state = getState();
      if (state.mode === "regular") { armed = false; return renderKeyboardHints(width, { visibleWidth, getKeys, theme, language: getLanguage() }); }
      const buttons = stateButtons(state), allowed = new Set();
      let remaining = width;
      for (const button of [...buttons].sort((a, b) => a.priority - b.priority)) {
        const size = visibleWidth(`[${button.label}]`) + (allowed.size ? 1 : 0);
        if (size <= remaining) { allowed.add(button.id); remaining -= size; }
      }
      const left = buttons.filter((button) => allowed.has(button.id) && !button.right);
      const right = buttons.filter((button) => allowed.has(button.id) && button.right);
      const groupWidth = (group) => group.reduce((sum, button) => sum + visibleWidth(`[${button.label}]`), Math.max(0, group.length - 1));
      const renderGroup = (group, offset) => {
        let text = "", column = offset;
        for (const button of group) {
          if (text) { text += " "; column++; }
          const label = `[${button.label}]`, length = visibleWidth(label);
          regions.push({ id: button.id, start: column, end: column + length, enabled: button.enabled });
          text += theme?.fg ? theme.fg(button.enabled ? "muted" : "dim", label) : identity(label);
          column += length;
        }
        return text;
      };
      const leftWidth = groupWidth(left), rightWidth = groupWidth(right);
      // Selection reserved one separator per button. Padding expands that
      // separator between groups, so right-side hit regions stay right-aligned.
      const gap = width - leftWidth - rightWidth;
      return renderGroup(left, 0) + " ".repeat(gap) + renderGroup(right, width - rightWidth);
    },
    handleMouse(event, layout) {
      if (getState().mode === "regular") { regions = []; armed = false; return undefined; }
      if (disposed || event.button !== "left" || event.ctrl || event.alt || event.shift || event.type === "wheel") return undefined;
      const action = hit(event, layout);
      if (event.type === "press" && action) {
        armed = true;
        return { handled: true, capture: true, focus: true, render: false };
      }
      if ((event.type === "drag" || event.type === "release") && armed) {
        if (event.type === "release") armed = false;
        return { handled: true, render: false };
      }
      if (event.type !== "click" || !action) return undefined;
      onAction(action);
      // A style/play action may replace this editor. Never refocus the old one.
      return { handled: true, render: true };
    },
    get regions() { return regions.map((region) => ({ ...region })); },
    invalidate() { regions = []; armed = false; },
    dispose() { disposed = true; regions = []; armed = false; },
  };
}
