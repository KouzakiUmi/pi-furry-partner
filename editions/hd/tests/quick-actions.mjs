import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuickActions, buildUsageDetails, QUICK_ACTIONS } from "../lib/quick-actions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const fixture = () => {
  const state = { busy: false, blocked: false, editor: { actionHandlers: new Map() }, select: async () => undefined };
  const calls = [], notices = [], dialogs = [], details = [], forbidden = [];
  let changes = 0, entryScans = 0;
  for (const item of QUICK_ACTIONS.filter((item) => item.native)) state.editor.actionHandlers.set(item.native, () => calls.push(item.native));
  const fail = (name) => () => { forbidden.push(name); throw new Error(`Forbidden operation: ${name}`); };
  const ctx = { mode: "tui", cwd: "C:\\workspace", model: { provider: "offline", id: "test", contextWindow: 100000 },
    isIdle: () => !state.busy, getContextUsage: () => ({ tokens: 1000, percent: 1, contextWindow: 100000 }),
    sessionManager: { getEntries: () => { entryScans++; return []; }, getSessionName: () => "test session" },
    ui: { select: async (title, options) => { dialogs.push({ title, options: [...options] }); return state.select(title, options); }, notify: (message, type) => notices.push({ message, type }),
      setEditorText: fail("setEditorText"), pasteToEditor: fail("pasteToEditor") },
    newSession: fail("newSession"), switchSession: fail("switchSession"), compact: fail("compact") };
  const pi = { getThinkingLevel: () => "medium", getActiveTools: () => ["read"], getAllTools: () => [],
    sendUserMessage: fail("sendUserMessage"), sendMessage: fail("sendMessage"), exec: fail("exec"), setActiveTools: fail("setActiveTools") };
  Object.defineProperty(ctx, "credentials", { get: fail("credentials") });
  const controller = createQuickActions({ ctx, pi, getEditor: () => state.editor, isBlocked: () => state.blocked,
    showDetails: async (title, lines) => details.push({ title, lines: [...lines] }), onChange: () => changes++ });
  return { state, calls, notices, dialogs, details, forbidden, ctx, pi, controller, get changes() { return changes; }, get entryScans() { return entryScans; } };
};

{
  const expected = { model: "app.model.select", thinking: "app.thinking.cycle", resume: "app.session.resume", tree: "app.session.tree", fork: "app.session.fork",
    copy: "app.message.copy", expand: "app.tools.expand", "thinking-text": "app.thinking.toggle", external: "app.editor.external" };
  for (const [id, native] of Object.entries(expected)) assert.equal(QUICK_ACTIONS.find((item) => item.id === id)?.native, native, `${id} maps to an actual public Pi application action`);
  const f = fixture(); f.state.editor.actionHandlers.clear();
  // This mirrors InteractiveMode populating the public map after factory return.
  f.state.editor.actionHandlers.set("app.model.select", () => f.calls.push("late-model"));
  assert.equal(await f.controller.run("model"), true); assert.deepEqual(f.calls, ["late-model"]);
  f.state.editor.actionHandlers.set("app.thinking.cycle", () => f.calls.push("late-thinking"));
  assert.equal(await f.controller.run("thinking"), true); assert.deepEqual(f.calls, ["late-model", "late-thinking"]);
  assert.equal(await f.controller.run("unknown"), false); assert.deepEqual(f.forbidden, []);
  assert.equal(f.changes, 2); f.controller.dispose();
  checks.push("Native model/thinking callbacks are resolved from the public action map at click time after host installation; no prompt, editor mutation, shell call or session-control API is used");
}

{
  const f = fixture(); f.state.busy = true;
  for (const item of QUICK_ACTIONS.filter((item) => item.idleOnly)) assert.equal(await f.controller.run(item.id), false, `${item.id} cannot run while active`);
  assert.equal(f.calls.length, 0);
  for (const id of ["copy", "expand", "thinking-text"]) assert.equal(await f.controller.run(id), true);
  assert.deepEqual(f.calls, ["app.message.copy", "app.tools.expand", "app.thinking.toggle"]);
  f.state.select = async () => undefined; assert.equal(await f.controller.run(), false);
  const offered = f.dialogs.at(-1).options;
  for (const item of QUICK_ACTIONS.filter((item) => item.idleOnly)) assert.ok(!offered.some((label) => label.startsWith(item.label)));
  for (const id of ["usage", "tools", "copy"]) assert.ok(offered.includes(QUICK_ACTIONS.find((item) => item.id === id).label));
  assert.deepEqual(f.forbidden, []); f.controller.dispose();
  checks.push("Busy runs disable model, thinking, external editing and session navigation while keeping read-only usage/tools and native copy/display toggles available");
}

{
  const f = fixture(), pending = deferred();
  f.state.select = () => pending.promise;
  const first = f.controller.run(); await tick();
  assert.equal(await f.controller.run(), false); assert.equal(await f.controller.run("model"), false); assert.equal(f.dialogs.length, 1);
  f.state.busy = true; pending.resolve(QUICK_ACTIONS.find((item) => item.id === "model").label);
  assert.equal(await first, false); assert.equal(f.calls.length, 0, "Busy is rechecked after the selector closes");
  f.state.busy = false;
  const again = deferred(); f.state.select = () => again.promise;
  const next = f.controller.run(); await tick(); f.state.blocked = true;
  again.resolve(QUICK_ACTIONS.find((item) => item.id === "copy").label);
  assert.equal(await next, false); assert.equal(f.calls.length, 0);
  assert.equal(await f.controller.run("copy"), false); f.state.blocked = false;
  assert.equal(await f.controller.run("copy"), true); f.controller.dispose();
  checks.push("A pending menu locks duplicate clicks; busy and overlay-blocked state are checked again after asynchronous selection, and the lock is released after cancellation");
}

{
  const f = fixture(), pending = deferred();
  f.state.select = () => pending.promise;
  const first = f.controller.run(); await tick();
  f.state.editor = { actionHandlers: new Map([["app.message.copy", () => f.calls.push("new-editor-copy")]]) };
  pending.resolve(QUICK_ACTIONS.find((item) => item.id === "copy").label);
  assert.equal(await first, true); assert.deepEqual(f.calls, ["new-editor-copy"]);
  const missing = deferred(); f.state.select = () => missing.promise;
  const next = f.controller.run(); await tick(); f.state.editor.actionHandlers.clear();
  missing.resolve(QUICK_ACTIONS.find((item) => item.id === "copy").label);
  assert.equal(await next, false); assert.equal(f.calls.length, 1); f.controller.dispose();
  checks.push("Menus dispatch to the current editor after replacement and fail safely when the selected native action disappears instead of retaining a stale callback");
}

{
  const f = fixture(), pending = deferred();
  f.state.editor.actionHandlers.set("app.model.select", () => pending.promise);
  const first = f.controller.run("model"); await tick(); assert.equal(await f.controller.run("thinking"), false);
  f.controller.dispose(); f.controller.dispose(); pending.resolve(); assert.equal(await first, true);
  assert.equal(f.changes, 0, "A disposed controller never redraws its old editor after an asynchronous native operation");
  assert.equal(await f.controller.run(), false);
  const menu = fixture(), choice = deferred(); menu.state.select = () => choice.promise;
  const result = menu.controller.run(); await tick(); menu.controller.dispose(); choice.resolve(QUICK_ACTIONS[0].label);
  assert.equal(await result, false); assert.equal(menu.calls.length, 0);
  checks.push("Native asynchronous actions share the reentry lock, disposal is idempotent, and late selector/action completion cannot call or redraw a disposed editor");
}

{
  const f = fixture();
  f.state.editor.actionHandlers.delete("app.session.resume");
  f.state.select = async (_title, labels) => labels.find((label) => label.startsWith(QUICK_ACTIONS.find((item) => item.id === "thinking").label));
  assert.equal(await f.controller.run(), true); assert.equal(f.calls.at(-1), "app.thinking.cycle");
  assert.ok(f.dialogs.at(-1).options.some((label) => label.endsWith(" · medium")));
  assert.ok(!f.dialogs.at(-1).options.includes(QUICK_ACTIONS.find((item) => item.id === "resume").label));
  f.state.editor.actionHandlers.set("app.model.select", () => { throw new Error("native\nfailed"); });
  assert.equal(await f.controller.run("model"), false); assert.ok(f.notices.some((notice) => notice.type === "warning" && !notice.message.includes("\n")));
  f.controller.dispose(); checks.push("Menu labels reflect the current thinking level, unavailable native flows are omitted and native failures produce a sanitized notice without submitting fallback commands");
}

{
  const f = fixture();
  const usage = (input, output, cacheRead = 0, cacheWrite = 0, total = 0) => ({ input, output, cacheRead, cacheWrite, cost: { total } });
  const entries = Object.freeze([
    { type: "message", message: { role: "user", usage: usage(999999, 999999, 999999, 999999, 999) } },
    { type: "message", message: { role: "assistant", usage: usage(100, 20, 30, 40, 0.01) } },
    { type: "message", message: { role: "toolResult", usage: usage(2, 3, 4, 5, 0.02) } },
    { type: "usage", usage: usage(10, 2, 3, 4, 0.03) },
    { type: "compaction", usage: usage(5, 6, 7, 8, 0.04) },
    { type: "branch_summary", usage: usage(1, 2, 3, 4, 0.05) },
    { type: "message", message: { role: "assistant" } },
  ]);
  const serialized = JSON.stringify(entries); let scans = 0;
  f.ctx.sessionManager.getEntries = () => { scans++; return entries; };
  f.ctx.model = { provider: "test\nprovider", id: "model\x1b[31m", contextWindow: 100000 };
  f.ctx.getContextUsage = () => ({ tokens: 1234, contextWindow: 100000, percent: 1.234 });
  const lines = buildUsageDetails(f.ctx, () => "high"), text = lines.join("\n");
  for (const expected of ["已记录输入：118", "已记录输出：33", "缓存读取：47", "缓存写入：61", "$0.150000", "1,234 / 100,000", "1.2%", "对话消息：3", "工具结果：1", "思考强度：high"]) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes("999,999") && !text.includes("\x1b")); assert.equal(scans, 1); assert.equal(JSON.stringify(entries), serialized);
  assert.equal(await f.controller.run("usage"), true); assert.equal(scans, 2, "Usage is scanned only when opening the snapshot panel");
  assert.equal(f.details.length, 1); assert.deepEqual(f.forbidden, []); f.controller.dispose();
  checks.push("Read-only usage snapshots reconcile assistant/tool-result/usage/compaction/branch-summary records, ignore user usage, retain actual context/cost and sanitize labels without mutating entries or touching credentials");
}

{
  const f = fixture();
  f.ctx.sessionManager.getEntries = () => [{ type: "usage", usage: { input: 0, output: NaN, cacheRead: -2, cost: {} } }];
  f.ctx.model = undefined; f.ctx.getContextUsage = () => undefined;
  const text = buildUsageDetails(f.ctx).join("\n");
  assert.ok(text.includes("已记录输入：0 tokens")); assert.ok(text.includes("已记录输出：未提供")); assert.ok(text.includes("缓存读取：未提供"));
  assert.ok(text.includes("已记录费用：未提供")); assert.ok(text.includes("上下文：未提供 / 未提供")); assert.ok(!text.includes("$0.000000"));
  f.ctx.sessionManager.getEntries = () => [];
  assert.ok(buildUsageDetails(f.ctx).some((line) => line.includes("还没有已记录的用量")));
  f.controller.dispose(); checks.push("Missing models/context/usage remain explicitly unknown, sparse reported zeroes stay zero and absent costs are never invented as free usage");
}

{
  const f = fixture(), toolArray = Object.freeze([
    { name: "write", description: "Write\nfiles", parameters: { required: ["path"], properties: { path: { type: "string", description: "Target\npath" }, content: { type: "string" } } } },
    { name: "read", description: "Read files", parameters: { properties: { path: { type: "string" } } } },
  ]);
  f.pi.getAllTools = () => toolArray;
  f.state.select = async (_title, labels) => { assert.deepEqual(labels, ["● read", "○ write"]); return labels[1]; };
  assert.equal(await f.controller.run("tools"), true);
  const text = f.details.at(-1).lines.join("\n");
  assert.ok(f.details.at(-1).title.includes("write")); assert.ok(text.includes("未启用") && text.includes("path *") && text.includes("string"));
  assert.deepEqual(toolArray.map((tool) => tool.name), ["write", "read"], "Tool listing sorts a copy instead of mutating the host catalogue");
  assert.deepEqual(f.forbidden, []); f.controller.dispose();
  checks.push("Tool details sort and mark the active catalogue, show required parameter metadata and never execute tools, enable tools, access credentials or mutate the host list");
}

const sourceSha256 = createHash("sha256").update(await readFile(join(root, "lib/quick-actions.mjs"))).digest("hex");
const report = { testedAt: new Date().toISOString(), modelRequests: 0, passed: true,
  verification: "Product quick-action router and read-only usage builder with controlled native public action maps, no model/native-window calls", checks, sourceSha256 };
await writeFile(join(root, "tests/quick-actions-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
