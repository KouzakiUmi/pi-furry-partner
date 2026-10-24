import path from "node:path";
import { localize } from "./language.mjs";

const SELF_STATUSES = new Set(["pi-furry-partner", "pi-wink-companion", "pi-wink-companion-editor"]);
const clean = (value) => String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/ +/g, " ").trim();
const number = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
const tokens = (value) => {
  const n = number(value);
  if (n < 1000) return String(Math.round(n));
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(n < 10000000 ? 1 : 0)}M`;
};

function displayCwd(cwd) {
  const text = String(cwd ?? "");
  const windows = /^[a-z]:[\\/]|^\\\\/i.test(text);
  const paths = windows ? path.win32 : path.posix;
  const home = windows ? process.env.USERPROFILE || process.env.HOME : process.env.HOME || process.env.USERPROFILE;
  if (!home) return clean(text);
  const resolvedCwd = paths.resolve(text);
  const relative = paths.relative(paths.resolve(home), resolvedCwd);
  const inside = relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
  return clean(inside ? relative ? `~${paths.sep}${relative}` : "~" : text);
}

/** A compact footer using the same usage-entry sources as Pi's native footer. */
export function createStatusFooter({ ctx, tui, theme, footerData, visibleWidth, truncateToWidth, getThinkingLevel, getLanguage = () => "zh-CN" }) {
  let disposed = false;
  let cached;
  const unsubscribe = footerData.onBranchChange?.(() => { if (!disposed) tui.requestRender(); });
  const fit = (text, width) => truncateToWidth(text, Math.max(0, width), "…");
  const activeTheme = () => ctx.ui?.theme || theme;
  const fg = (token, text) => activeTheme()?.fg?.(token, text) ?? text;
  const l = (zh, en) => localize(getLanguage(), zh, en);

  function sessionStats() {
    const manager = ctx.sessionManager;
    const model = ctx.model;
    let entries;
    const entryCount = typeof manager.getEntryCount === "function"
      ? manager.getEntryCount()
      : (entries = manager.getEntries()).length;
    const sessionId = manager.getSessionId?.();
    const leafId = manager.getLeafId?.();
    if (cached && cached.manager === manager && cached.model === model && cached.entryCount === entryCount && cached.sessionId === sessionId && cached.leafId === leafId) return cached;
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    for (const entry of entries ?? manager.getEntries()) {
      let usage;
      if (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary") usage = entry.usage;
      else if (entry.type === "message" && (entry.message?.role === "assistant" || entry.message?.role === "toolResult")) usage = entry.message.usage;
      if (!usage) continue;
      for (const key of ["input", "output", "cacheRead", "cacheWrite"]) totals[key] += number(usage[key]);
      totals.cost += number(usage.cost?.total);
    }
    const context = ctx.getContextUsage?.();
    cached = {
      manager, model, entryCount, sessionId, leafId, totals,
      context: context ? { tokens: context.tokens, percent: context.percent, contextWindow: context.contextWindow } : undefined,
    };
    return cached;
  }

  function aligned(left, right, width) {
    const rightWidth = visibleWidth(right);
    if (!right) return fit(left, width);
    const availableLeft = Math.max(0, width - rightWidth - 2);
    const clippedLeft = fit(left, availableLeft);
    return fit(clippedLeft + " ".repeat(Math.max(availableLeft > 0 ? 2 : 0, width - visibleWidth(clippedLeft) - rightWidth)) + right, width);
  }

  return {
    render(width) {
      if (disposed || width <= 0) return [];
      width = Math.floor(width);
      const stats = sessionStats();
      const model = ctx.model;
      const modelId = clean(model?.id || l("未选择模型", "No model selected"));
      const provider = clean(model?.provider);
      const level = clean(getThinkingLevel?.() ?? ctx.thinkingLevel ?? "off");
      const window = number(stats.context?.contextWindow) || number(model?.contextWindow);
      const reportedPercent = stats.context?.percent;
      const percent = typeof reportedPercent === "number" && Number.isFinite(reportedPercent) ? Math.max(0, reportedPercent) : undefined;
      const percentage = percent === undefined ? "?" : `${percent.toFixed(width < 40 ? 0 : 1)}%`;
      const windowLabel = window ? tokens(window) : "?";
      const tone = (percent ?? 0) > 90 ? "error" : (percent ?? 0) > 70 ? "warning" : "accent";
      let contextLabel = `${percentage}/${windowLabel}`;
      if (width >= 70) {
        const cells = width >= 100 ? 8 : 6;
        const filled = percent === undefined ? 0 : Math.min(cells, Math.round(percent / 100 * cells));
        const bar = fg(tone, "━".repeat(filled)) + fg("dim", "─".repeat(cells - filled));
        contextLabel = `CTX [${bar}] ${fg(tone, contextLabel)}`;
      } else contextLabel = fg(tone, `${width >= 40 ? "CTX " : ""}${contextLabel}`);

      let firstLine;
      if (width < 14) {
        // Tiny terminals cannot fit full labels: reserve a short context indicator.
        const compactContext = percent === undefined ? "?" : `${Math.round(percent)}%`;
        const right = fit(fg(tone, compactContext), Math.max(1, Math.floor(width / 2)));
        firstLine = aligned(fg("text", modelId), right, width);
      } else {
        const contextWidth = visibleWidth(contextLabel);
        const leftWidth = Math.max(1, width - contextWidth - 2);
        const thinking = width >= 70 ? ` · ${l("思考", "Thinking")} ${level}` : width >= 40 ? ` · ${level}` : "";
        const nameWidth = Math.max(1, leftWidth - visibleWidth(thinking));
        const name = width < 40 || !provider ? modelId : `${provider}/${modelId}`;
        const left = fg("text", fit(name, nameWidth)) + (visibleWidth(thinking) + 2 <= leftWidth ? fg("muted", thinking) : "");
        firstLine = aligned(left, contextLabel, width);
      }

      const manager = ctx.sessionManager;
      const cwd = displayCwd(typeof manager.getCwd === "function" ? manager.getCwd() : ctx.cwd);
      const branch = clean(footerData.getGitBranch?.());
      const location = cwd + (branch ? ` · ${branch}` : "");
      const usage = stats.totals;
      const parts = [`↑${tokens(usage.input)}`, `↓${tokens(usage.output)}`];
      if (width >= 40 && usage.cacheRead) parts.push(`R${tokens(usage.cacheRead)}`);
      if (width >= 40 && usage.cacheWrite) parts.push(`W${tokens(usage.cacheWrite)}`);
      if (width >= 70 && usage.cost) parts.push(`$${usage.cost.toFixed(3)}`);
      // Preserve a useful path fragment even when token labels are long.
      const usageWidth = Math.max(1, width - Math.min(12, Math.floor(width / 3)) - 2);
      const secondLine = aligned(fg("dim", location), fit(fg("muted", parts.join(" ")), usageWidth), width);
      const lines = [firstLine, secondLine];
      const statuses = Array.from(footerData.getExtensionStatuses?.() ?? [])
        .filter(([key, value]) => !SELF_STATUSES.has(key) && value !== undefined && String(value).trim())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => String(value).replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim());
      if (statuses.length) lines.push(fit(statuses.join("  "), width));
      return lines.map((line) => fit(line, width));
    },
    // Rendering uses the live theme, while usage scans stay cached across animation frames.
    invalidate() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
      cached = undefined;
    },
  };
}
