// Local UI actions only. Native handlers are supplied by Pi after constructing
// the CustomEditor, so look them up at click time instead of capturing them.
export const QUICK_ACTIONS = [
  { id: "model", label: "换个模型聊聊", native: "app.model.select", idleOnly: true },
  { id: "thinking", label: "切换思考强度", native: "app.thinking.cycle", idleOnly: true },
  { id: "usage", label: "看看这次的用量" },
  { id: "tools", label: "看看可用的工具" },
  { id: "resume", label: "找回之前的会话", native: "app.session.resume", idleOnly: true },
  { id: "tree", label: "看看这段对话的分支", native: "app.session.tree", idleOnly: true },
  { id: "fork", label: "从这里分一条新对话", native: "app.session.fork", idleOnly: true },
  { id: "copy", label: "复制最近一条回答", native: "app.message.copy" },
  { id: "expand", label: "展开／收起工具输出", native: "app.tools.expand" },
  { id: "thinking-text", label: "显示／收起思考过程", native: "app.thinking.toggle" },
  { id: "external", label: "在外部编辑器里写输入", native: "app.editor.external", idleOnly: true },
];
const clean = (value) => String(value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim();
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const format = (value) => finite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "未提供";

export function buildUsageDetails(ctx, getThinkingLevel = () => "off") {
  const entries = ctx.sessionManager?.getEntries?.() || [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  const reported = new Set();
  let hasUsage = false, hasCost = false, messages = 0, toolResults = 0;
  for (const entry of entries) {
    if (entry.type === "message") {
      if (["user", "assistant"].includes(entry.message?.role)) messages++;
      if (entry.message?.role === "toolResult") toolResults++;
    }
    const usage = ["usage", "compaction", "branch_summary"].includes(entry.type) ? entry.usage
      : entry.type === "message" && ["assistant", "toolResult"].includes(entry.message?.role) ? entry.message.usage : undefined;
    if (!usage) continue;
    hasUsage = true;
    for (const key of ["input", "output", "cacheRead", "cacheWrite"]) if (finite(usage[key])) { totals[key] += usage[key]; reported.add(key); }
    if (finite(usage.cost?.total)) { totals.cost += usage.cost.total; hasCost = true; }
  }
  const context = ctx.getContextUsage?.();
  const window = context?.contextWindow ?? ctx.model?.contextWindow;
  return [
    `模型：${clean(ctx.model?.provider) || "未提供"} / ${clean(ctx.model?.id) || "尚未选择"}`,
    `思考强度：${clean(getThinkingLevel()) || "off"}`,
    `上下文：${format(context?.tokens)} / ${format(window)} tokens${finite(context?.percent) ? `（${context.percent.toFixed(1)}%）` : ""}`,
    "",
    ...(hasUsage ? [`已记录输入：${format(reported.has("input") ? totals.input : undefined)} tokens`, `已记录输出：${format(reported.has("output") ? totals.output : undefined)} tokens`,
      `缓存读取：${format(reported.has("cacheRead") ? totals.cacheRead : undefined)} tokens`, `缓存写入：${format(reported.has("cacheWrite") ? totals.cacheWrite : undefined)} tokens`] : ["当前会话还没有已记录的用量。"]),
    `已记录费用：${hasCost ? `$${totals.cost.toFixed(6)}` : "未提供"}`,
    `对话消息：${messages}　工具结果：${toolResults}`,
    "",
    `会话：${clean(ctx.sessionManager?.getSessionName?.() || ctx.sessionManager?.getSessionId?.()) || "未命名"}`,
    `目录：${clean(ctx.cwd) || "未提供"}`,
    "这是打开面板时的快照；用量与费用只取 Pi 已记录的数据。",
  ];
}

export function createQuickActions({ ctx, pi, getEditor, isBlocked = () => false, showDetails, onChange = () => {} }) {
  let locked = false, disposed = false;
  const idle = () => ctx.isIdle?.() !== false;
  const handler = (item) => item.native && getEditor()?.actionHandlers?.get(item.native);
  const available = (item) => (!item.idleOnly || idle()) && (!item.native || typeof handler(item) === "function");
  const perform = async (id) => {
    if (disposed || isBlocked()) return false;
    const item = QUICK_ACTIONS.find((action) => action.id === id);
    if (!item) return false;
    if (!available(item)) {
      ctx.ui.notify(item.idleOnly && !idle() ? "我还在忙这一步，等停下来再切换呀。" : "这个入口现在还没准备好。", "info");
      return false;
    }
    if (item.native) {
      // Pi retains its own model filters, session navigation and clipboard
      // behavior. No synthetic prompt, slash-command submission or new request.
      await handler(item)();
      if (!disposed) onChange();
      return true;
    }
    if (id === "usage") {
      await showDetails("我记下的会话用量", buildUsageDetails(ctx, () => pi.getThinkingLevel?.()));
      return true;
    }
    const active = new Set(pi.getActiveTools?.() || []);
    const tools = [...(pi.getAllTools?.() || [])].sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
    if (!tools.length) { ctx.ui.notify("我这里还没有可查看的工具。", "info"); return true; }
    const labels = tools.map((tool) => `${active.has(tool.name) ? "●" : "○"} ${clean(tool.name)}`);
    const selected = await ctx.ui.select("我有哪些工具呀？（● 已启用）", labels);
    if (disposed || isBlocked()) return false;
    const index = labels.indexOf(selected);
    if (index < 0) return false;
    const tool = tools[index], parameters = tool.parameters || {}, required = new Set(parameters.required || []);
    await showDetails(`工具 · ${clean(tool.name)}`, [
      `状态：${active.has(tool.name) ? "已启用" : "未启用"}`, "",
      clean(tool.description) || "这个工具没有提供说明。", "", "参数：",
      ...Object.entries(parameters.properties || {}).map(([name, field]) => `${clean(name)}${required.has(name) ? " *" : ""} · ${clean(field?.type) || "未注明类型"}${field?.description ? ` · ${clean(field.description)}` : ""}`),
      "", "这里只查看定义，不执行工具，也不更改启用状态。",
    ]);
    return true;
  };
  return {
    async run(id = "menu") {
      if (disposed || locked || isBlocked()) return false;
      locked = true;
      try {
        if (id !== "menu") return await perform(id);
        const choices = QUICK_ACTIONS.filter(available);
        const labels = choices.map((item) => item.label + (item.id === "thinking" ? ` · ${clean(pi.getThinkingLevel?.() || "off")}` : ""));
        const selected = await ctx.ui.select(idle() ? "想用哪个小帮手呀？" : "我还在忙，这些小帮手可以先用", labels);
        if (disposed || isBlocked()) return false;
        const choice = choices[labels.indexOf(selected)];
        return choice ? await perform(choice.id) : false;
      } catch (error) {
        if (!disposed) ctx.ui.notify(`这个入口没打开：${clean(error?.message || error)}`, "warning");
        return false;
      } finally { locked = false; }
    },
    dispose() { disposed = true; },
  };
}
