import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { modules } from "./pi-runtime.mjs";

// Real extension ordering, official prompt builder and runner; no model,
// credentials, live configuration or actual conversation is accessed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, "work"); await mkdir(work, { recursive: true });
const scratch = await mkdtemp(join(work, "prompt-ordering-"));
const agent = join(modules, "@earendil-works/pi-coding-agent/dist");
const load = (path) => import(pathToFileURL(path));
const { loadExtensionsCached, clearExtensionCache } = await load(join(agent, "core/extensions/loader.js"));
const { ExtensionRunner } = await load(join(agent, "core/extensions/runner.js"));
const { buildSystemPrompt, buildSystemPromptSections, normalizeBuildSystemPromptOptions } = await load(join(agent, "core/system-prompt.js"));
const errors = [], notices = [], checks = [];
const ctx = { mode: "tui", ui: { setStatus() {}, notify(message) { notices.push(message); } } };
const originalOptions = normalizeBuildSystemPromptOptions({
  cwd: scratch, selectedTools: ["read", "bash"], toolSnippets: { read: "BASE read tool", bash: "BASE bash tool" },
  toolGuidelines: { read: ["BASE tool rule"] }, promptGuidelines: ["BASE prompt rule"],
  appendSystemPrompt: "KEEP original addendum exactly", contextFiles: [{ path: "AGENTS.md", content: "KEEP original project constraint" }],
  skills: [{ name: "base", description: "KEEP base skill", filePath: "skills/base/SKILL.md" }],
  sections: { date: "KEEP date section exactly" },
});
const originalBytes = JSON.stringify(originalOptions);
const wrapPersona = (text) => `<umi_persona>\n${text}\n</umi_persona>`;
let sequence = 0;
async function fixture(name, body) {
  const path = join(scratch, `${name}-${++sequence}.ts`);
  await writeFile(path, `export default function(pi) { pi.on("before_agent_start", (event, ctx) => { ${body} }); }\n`);
  return path;
}
async function setup(paths) {
  clearExtensionCache();
  const loaded = await loadExtensionsCached(paths, scratch);
  assert.deepEqual(loaded.errors, []);
  const extension = loaded.extensions.find((extension) => extension.commands.has("mascot"));
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, scratch, {}, {});
  runner.createContext = () => ctx; runner.onError((error) => errors.push(error));
  return { runner, command: (args) => extension.commands.get("mascot").handler(args, ctx) };
}
try {
  for (const name of ["index.ts", "lib", "prompts", "package.json"]) await cp(join(root, name), join(scratch, name), { recursive: true });
  await mkdir(join(scratch, "assets"));
  for (const name of ["status-copy.json", "status-phrases.json", "status-copy.en.json", "status-phrases.en.json", "ui-zh-CN.json"]) await cp(join(root, "assets", name), join(scratch, "assets", name));
  await writeFile(join(scratch, "config.json"), JSON.stringify({ enabled: false, animation: false, language: "zh-CN", compactPrompt: true, persona: true }));
  const plugin = join(scratch, "index.ts");
  const before = await fixture("before", 'event.systemPromptOptions.sections.memory_before = "KEEP earlier memory section";');
  const after = await fixture("after", `
    const o = event.systemPromptOptions;
    if (o.forceSystemPrompt !== undefined) throw new Error("The companion must not force the prompt");
    o.sections = { ...o.sections, memory_after: "KEEP later memory section", subagents: "KEEP later subagent instructions" };
    o.selectedTools.push("late_tool"); o.hiddenTools.push("bash");
    o.toolSnippets.late_tool = "KEEP late tool description";
    o.toolGuidelines.read.push("KEEP late read guideline"); o.promptGuidelines.push("KEEP late prompt guideline");
    o.contextFiles.push({path: "LATE.md", content: "KEEP late project constraint"});
    o.skills.push({name: "late", description: "KEEP late skill", filePath: "skills/late/SKILL.md"});
  `);
  const instance = await setup([before, plugin, after]);
  for (const language of ["zh-CN", "en"]) for (const compact of [false, true]) for (const personaOn of [false, true]) {
    await instance.command(`language ${language}`); await instance.command(`prompt ${compact ? "on" : "off"}`); await instance.command(`persona ${personaOn ? "on" : "off"}`);
    const result = await instance.runner.emitBeforeAgentStart({ prompt: "offline fixture" }, originalOptions);
    const options = result.systemPromptOptions, text = buildSystemPrompt(options), sections = buildSystemPromptSections(options);
    assert.equal(options.forceSystemPrompt, undefined); assert.equal(options.customPrompt, undefined);
    assert.equal(sections.preamble, buildSystemPromptSections(originalOptions).preamble);
    for (const content of ["KEEP earlier memory section", "KEEP later memory section", "KEEP later subagent instructions", "KEEP late tool description", "KEEP late read guideline", "KEEP late prompt guideline", "KEEP late project constraint", "KEEP late skill", "KEEP original addendum exactly", "KEEP original project constraint", "KEEP date section exactly"]) assert.ok(text.includes(content), content);
    assert.ok(!sections.tools.includes("BASE bash tool"));
    assert.ok(sections.tools.includes("late_tool"));
    const template = (await readFile(join(scratch, "prompts", language === "en" ? "umi-persona.en.md" : "umi-persona.md"), "utf8")).trim();
    assert.equal(text.includes(wrapPersona(template)), personaOn);
    assert.equal(text.split(template).length - 1, personaOn ? 1 : 0);
    if (compact) assert.ok(sections.docs.includes(language === "en" ? "Before implementing Pi work" : "处理 Pi 工作前"));
    else assert.equal(sections.docs, buildSystemPromptSections(originalOptions).docs);
    assert.equal(JSON.stringify(originalOptions), originalBytes);
  }
  checks.push("Real before→companion→after ordering preserves earlier/later memory and subagent sections, later added/hidden tools, tool and prompt guidelines, late context and skills, and caller input for all Chinese/English × docs on/off × persona on/off combinations");

  const customAfter = await fixture("custom-after", `
    const o = event.systemPromptOptions;
    o.sections.tools = "KEEP downstream custom tools exactly";
    o.sections.rules = "KEEP downstream custom rules exactly";
    o.sections.docs = "KEEP downstream custom docs exactly";
  `);
  const custom = await setup([plugin, customAfter]);
  for (const settings of [{}, { sections: { ...originalOptions.sections, tools: "KEEP upstream tools exactly", docs: "KEEP upstream docs exactly" } }, { customPrompt: "KEEP custom SYSTEM.md exactly" }]) {
    const result = await custom.runner.emitBeforeAgentStart({ prompt: "offline fixture" }, { ...originalOptions, ...settings });
    const text = buildSystemPrompt(result.systemPromptOptions);
    assert.equal(result.systemPromptOptions.forceSystemPrompt, undefined);
    for (const content of ["KEEP downstream custom tools exactly", "KEEP downstream custom rules exactly", "KEEP downstream custom docs exactly"]) assert.ok(text.includes(content));
    if (settings.customPrompt) assert.equal(result.systemPromptOptions.customPrompt, settings.customPrompt);
  }
  const priorCustom = await setup([plugin]);
  const customOptions = { ...originalOptions, sections: { ...originalOptions.sections, docs: "KEEP upstream custom docs exactly", tools: "KEEP upstream tools exactly", rules: "KEEP upstream rules exactly" } };
  const customText = buildSystemPrompt((await priorCustom.runner.emitBeforeAgentStart({ prompt: "offline fixture" }, customOptions)).systemPromptOptions);
  for (const content of Object.values(customOptions.sections)) assert.ok(customText.includes(content));
  checks.push("Upstream custom docs/tools/rules remain exact, downstream custom sections replace their native or condensed counterparts normally, and custom SYSTEM.md remains an opaque unchanged preamble");

  const forcedBefore = await fixture("forced-before", 'return { systemPrompt: "KEEP opaque earlier force exactly" };');
  const forcedAfter = await fixture("forced-after", 'return { systemPrompt: "KEEP opaque later force exactly" };');
  // The generic after fixture intentionally rejects force, so use a section-only
  // follower for this already-opaque path owned by the earlier extension.
  const passiveAfter = await fixture("passive-after", 'event.systemPromptOptions.sections.later = "KEEP later ignored by existing opaque mode";');
  const opaque = await setup([forcedBefore, plugin, passiveAfter]);
  await opaque.command("language zh-CN"); await opaque.command("persona on");
  const template = (await readFile(join(scratch, "prompts/umi-persona.md"), "utf8")).trim();
  const opaqueResult = await opaque.runner.emitBeforeAgentStart({ prompt: "offline fixture" }, originalOptions);
  assert.equal(buildSystemPrompt(opaqueResult.systemPromptOptions), `KEEP opaque earlier force exactly\n\n${template}`);
  const lastForce = await setup([plugin, forcedAfter]);
  assert.equal(buildSystemPrompt((await lastForce.runner.emitBeforeAgentStart({ prompt: "offline fixture" }, originalOptions)).systemPromptOptions), "KEEP opaque later force exactly");
  assert.deepEqual(errors, []);
  checks.push("Existing opaque force text keeps its exact prefix with the requested persona appended; a later whole-prompt owner keeps normal last-writer precedence, with no new companion-forced mode");
  console.log(JSON.stringify({ passed: true, modelRequests: 0, checks }, null, 2));
} finally {
  if (scratch.startsWith(work + sep) && scratch.slice(work.length + 1).startsWith("prompt-ordering-")) await rm(scratch, { recursive: true, force: true });
}
