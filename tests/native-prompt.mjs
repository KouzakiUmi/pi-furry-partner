import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compactNativePrompt, compactNativePromptSections, addPersonaSection, DEFAULT_PI_PREAMBLE, DEFAULT_ZH_PREAMBLE, DEFAULT_EN_PREAMBLE, SUPPORTED_PROMPT_PI_VERSIONS } from "../lib/native-prompt.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
import { agentDir, version, modules } from "./pi-runtime.mjs";
const { buildSystemPrompt, buildSystemPromptSections } = await import(pathToFileURL(join(modules, "@earendil-works/pi-coding-agent/dist/core/system-prompt.js")).href);
const checks = [];
const contextText = "Keep AGENTS exactly.\n<rules>\n- Be concise in your responses\n</rules>\n" + DEFAULT_PI_PREAMBLE;
const baseOptions = {
  cwd: "C:\\项目\\with spaces", selectedTools: ["read", "bash"], hiddenTools: [],
  toolSnippets: { read: "DYNAMIC read snippet\n<rules>\nINNER TOOL TEXT\n</rules>", bash: "DYNAMIC bash snippet" },
  toolGuidelines: { read: ["Keep READ guideline exactly"], bash: ["Keep BASH guideline exactly"] },
  promptGuidelines: ["Keep prompt-level guideline exactly"],
  appendSystemPrompt: "EXTENSION ADDENDUM EXACT\nBe concise in your responses\n可选表达风格原文，独立保留。",
  contextFiles: [{ path: "C:/项目/AGENTS.md", content: contextText }],
  skills: [{ name: "fixture-skill", description: "DYNAMIC skill description < & >", filePath: "C:/项目/skills/fixture/SKILL.md" }],
  sections: { date: "Current date: 2026-10-16", extra_extension: "EXTRA EXTENSION EXACT\n<docs>Do not match me</docs>" },
};
const apply = (options = baseOptions, extra = {}) => compactNativePrompt({ systemPrompt: buildSystemPrompt(options), piVersion: version, systemPromptOptions: options, ...extra });
assert.deepEqual(SUPPORTED_PROMPT_PI_VERSIONS, ["1.2.0", "1.3.0", "1.4.0"]);
assert.ok(SUPPORTED_PROMPT_PI_VERSIONS.includes(version), "This offline fixture requires an explicitly reviewed Pi runtime");

const original = buildSystemPrompt(baseOptions), localized = apply();
assert.equal(localized.changed, true);
assert.deepEqual(localized.parts.filter((part) => part.changed).map((part) => part.name), ["preamble", "tools", "rules", "docs"]);
assert.ok(localized.systemPrompt.startsWith(DEFAULT_ZH_PREAMBLE + "\n\n<tools>"));
assert.ok(!localized.systemPrompt.includes("- Be concise in your responses\n- Show file paths clearly when working with files\n</rules>"));
checks.push("Installed reviewed Pi preamble, tools introduction, builtin rules and complete docs skeleton are recognized and localized");

const suffix = original.slice(original.indexOf("\n\n<addendum>"));
const english = apply(baseOptions, { language: "en" });
assert.ok(english.systemPrompt.startsWith(DEFAULT_EN_PREAMBLE + "\n\n<tools>"));
assert.ok(english.systemPrompt.endsWith(suffix));
assert.ok(english.systemPrompt.length < original.length);
assert.deepEqual(english.parts.filter((part) => part.changed).map((part) => part.name), ["preamble", "tools", "rules", "docs"]);
for (const text of [baseOptions.toolSnippets.read, ...baseOptions.toolGuidelines.read, ...baseOptions.promptGuidelines, contextText]) assert.ok(english.systemPrompt.includes(text));
for (const path of new Set([...original.matchAll(/docs\/[a-z-]+\.md|examples\/extensions\/|tui\.md/g)].map((match) => match[0]))) assert.equal(english.systemPrompt.split(path).length, original.split(path).length);
assert.match(english.systemPrompt, /Read every Pi \.md file completely/);
assert.match(english.systemPrompt, /Before implementing/);
assert.equal((await readFile(join(root, "prompts/pi-system-en.md"), "utf8")).trim(), DEFAULT_EN_PREAMBLE);
assert.equal(apply(baseOptions, { language: "en", enabled: false }).systemPrompt, original);
assert.equal(apply(baseOptions, { language: "en", systemPrompt: english.systemPrompt }).reason, "already-localized");
assert.equal(apply(baseOptions, { language: "unknown" }).systemPrompt, original);
for (const custom of [{ customPrompt: "EXACT user SYSTEM.md" }, { forceSystemPrompt: "EXACT earlier extension" }, { sections: { tools: "EXACT custom tools", rules: "EXACT custom rules", docs: "EXACT custom docs" } }]) {
  const options = { ...baseOptions, ...custom };
  const result = apply(options, { language: "en" });
  if (custom.sections) for (const text of Object.values(custom.sections)) assert.ok(result.systemPrompt.includes(text));
  else assert.equal(result.systemPrompt, buildSystemPrompt(options));
}
checks.push("English compaction preserves tool/context bytes, all doc paths and complete-read rules; independent off, custom/forced prompts, custom sections and idempotence match Chinese safeguards");
assert.ok(localized.systemPrompt.endsWith(suffix));
for (const text of [baseOptions.toolSnippets.read, baseOptions.toolSnippets.bash, ...baseOptions.toolGuidelines.read, ...baseOptions.toolGuidelines.bash, ...baseOptions.promptGuidelines, contextText]) assert.ok(localized.systemPrompt.includes(text));
const sections = buildSystemPromptSections(baseOptions);
for (const language of ["zh-CN", "en"]) {
  const result = compactNativePromptSections({ systemPrompt: original, systemPromptOptions: baseOptions, piVersion: version, language });
  assert.deepEqual(Object.keys(result.sections), ["docs"]);
  const runtimeSections = buildSystemPromptSections({ ...baseOptions, sections: { ...baseOptions.sections, ...result.sections } });
  for (const key of Object.keys(sections)) if (key !== "docs") assert.equal(runtimeSections[key], sections[key], `Runtime must keep ${key} exact`);
  assert.notEqual(runtimeSections.docs, sections.docs);
  assert.equal(baseOptions.forceSystemPrompt, undefined);
}
const personaOptions = { sections: { before: "KEEP existing section" }, customPrompt: "KEEP SYSTEM.md" };
addPersonaSection(personaOptions, "LOCAL voice");
assert.equal(personaOptions.customPrompt, "KEEP SYSTEM.md"); assert.equal(personaOptions.forceSystemPrompt, undefined);
assert.deepEqual(personaOptions.sections, { before: "KEEP existing section", umi_persona: "LOCAL voice" });
const forcedPersonaOptions = { sections: {}, forceSystemPrompt: "KEEP opaque earlier override" };
addPersonaSection(forcedPersonaOptions, "LOCAL voice");
assert.equal(forcedPersonaOptions.forceSystemPrompt, "KEEP opaque earlier override\n\nLOCAL voice");
checks.push("Runtime integration replaces only verified native docs, preserves all other structured sections and original custom SYSTEM text, adds persona independently and never introduces forced mode");
for (const name of ["addendum", "project_context", "skills", "cwd", "date", "extra_extension"]) assert.ok(localized.systemPrompt.includes(sections[name]));
assert.equal(localized.systemPrompt.indexOf(sections.project_context) < localized.systemPrompt.indexOf(sections.skills), true);
checks.push("Dynamic tool snippets/guidelines and the whole ordered addendum/project/skills/cwd/date/extension suffix remain exact, including nested fake tags");

const paths = [...original.matchAll(/docs\/[a-z-]+\.md|examples\/extensions\/|tui\.md/g)].map((match) => match[0]);
for (const path of new Set(paths)) assert.equal(localized.systemPrompt.split(path).length, original.split(path).length);
assert.match(localized.systemPrompt, /完整阅读/); assert.match(localized.systemPrompt, /交叉引用/);
assert.match(localized.systemPrompt, /分类器、图像等非语言模型/); assert.match(localized.systemPrompt, /勿用当前工作目录/);
checks.push("All documentation topic paths, complete-file reading, cross-reference, directory-resolution and non-LLM model rules are retained");

for (const selectedTools of [["bash"], ["powershell"], ["bash", "powershell"]]) {
  const result = apply({ ...baseOptions, selectedTools });
  assert.ok(result.systemPrompt.includes(selectedTools.length === 2 ? "用 bash 或 PowerShell" : selectedTools[0] === "bash" ? "用 bash 执行 ls、rg、find" : "用 PowerShell 列出、搜索和查找文件"));
}
for (const selectedTools of [["bash", "grep"], ["powershell", "find"], ["bash", "ls"]]) {
  const result = apply({ ...baseOptions, selectedTools });
  assert.ok(!result.systemPrompt.includes("用 bash 执行") && !result.systemPrompt.includes("用 PowerShell 列出"));
}
checks.push("All three conditional shell-rule variants keep their original activation conditions; dedicated find/grep/ls tools suppress the shell rule");

const dedupOptions = { ...baseOptions, toolGuidelines: { read: ["Be concise in your responses", "  Keep duplicate exactly  ", "Keep duplicate exactly"] }, promptGuidelines: ["Show file paths clearly when working with files"] };
const dedup = apply(dedupOptions).systemPrompt;
const rules = dedup.slice(dedup.indexOf("<rules>"), dedup.indexOf("</rules>", dedup.indexOf("<rules>")) + 8);
// The fixture's read snippet includes a nested fake rules tag; inspect the real
// rendered section from the official builder instead of parsing arbitrary tags.
const dedupRules = buildSystemPromptSections(dedupOptions).rules;
assert.ok(dedup.includes(dedupRules.replace("Use bash for file operations like ls, rg, find", "用 bash 执行 ls、rg、find 等文件操作。")));
assert.ok(!dedupRules.includes("Keep duplicate exactly\n- Keep duplicate exactly"));
checks.push("Rule provenance and Pi's deduplication order preserve dynamic guidelines even when their wording matches a builtin");

for (const name of ["tools", "rules", "docs"]) {
  const options = { ...baseOptions, sections: { ...baseOptions.sections, [name]: "CUSTOM SECTION EXACT\nEnglish stays\n" + DEFAULT_PI_PREAMBLE } };
  const result = apply(options);
  assert.ok(result.systemPrompt.includes(buildSystemPromptSections(options)[name]));
  assert.equal(result.parts.find((part) => part.name === name)?.reason, "custom-section-preserved");
}
checks.push("Per-section custom tools/rules/docs content is preserved without blocking safe localization of independent defaults");

for (const customPrompt of ["My SYSTEM.md prompt", DEFAULT_PI_PREAMBLE + "\n\n<tools>custom override</tools>"]) {
  const options = { ...baseOptions, customPrompt };
  assert.equal(apply(options).systemPrompt, buildSystemPrompt(options));
  assert.equal(apply(options).reason, "custom-system-prompt");
}
for (const forceSystemPrompt of ["", original]) {
  const options = { ...baseOptions, forceSystemPrompt };
  assert.equal(apply(options).systemPrompt, forceSystemPrompt);
  assert.equal(apply(options).reason, "forced-system-prompt");
}
checks.push("User/project SYSTEM.md and forced prompts remain opaque and exact, even if they happen to begin with the native sentence");

for (const piVersion of ["1.2.1", "1.3.1", "1.5.0", "2.0.0", undefined, ""]) {
  const result = apply(baseOptions, { piVersion });
  assert.equal(result.systemPrompt, original); assert.equal(result.reason, "unsupported-version");
}
assert.equal(compactNativePrompt({ systemPrompt: original, piVersion: version }).reason, "missing-options");
assert.equal(apply(baseOptions, { systemPrompt: "Earlier extension replaced the preamble" }).reason, "unrecognized-preamble");
assert.equal(apply(baseOptions, { basePrompt: " \n" }).reason, "empty-base");
checks.push("Unknown versions, missing event options, altered preambles and empty templates fail closed");

for (const enabled of [false, false]) assert.equal(apply(baseOptions, { enabled }).systemPrompt, original);
assert.equal(apply(baseOptions, { systemPrompt: localized.systemPrompt }).systemPrompt, localized.systemPrompt);
assert.equal(apply(baseOptions, { systemPrompt: localized.systemPrompt }).reason, "already-localized");
assert.equal((await readFile(join(root, "prompts/pi-system-zh.md"), "utf8")).trim(), DEFAULT_ZH_PREAMBLE);
checks.push("The independent switch returns each fresh original prompt unchanged when off; localization is idempotent and the saved base template matches the default");

const alteredTools = original.replace("DYNAMIC bash snippet", "ANOTHER UNKNOWN TOOL SNIPPET");
const partial = apply(baseOptions, { systemPrompt: alteredTools });
assert.equal(partial.systemPrompt, DEFAULT_ZH_PREAMBLE + alteredTools.slice(DEFAULT_PI_PREAMBLE.length));
const alteredDocs = original.replace("- Always read pi .md files completely", "- SOME UPDATED VENDOR DOC RULE");
const keepDocs = apply(baseOptions, { systemPrompt: alteredDocs });
assert.ok(keepDocs.systemPrompt.endsWith(alteredDocs.slice(alteredDocs.indexOf("\n\n<docs>"))));
checks.push("An unknown section skeleton stops matching at its boundary; all following text stays byte-for-byte unchanged");

const none = apply({ ...baseOptions, selectedTools: [], skills: [], toolSnippets: {} });
assert.match(none.systemPrompt, /<tools>\n（无）\n\n此外，项目可能还提供其他自定义工具。/);
const hidden = apply({ ...baseOptions, selectedTools: ["read", "bash"], hiddenTools: ["bash"] });
assert.ok(!hidden.systemPrompt.includes("- bash: DYNAMIC bash snippet"));
assert.ok(hidden.systemPrompt.includes(sections.skills));
checks.push("Empty tool placeholders and hidden declarations retain Pi's semantics without dropping visible skills");

const windowsPaths = original.replace(/- Main documentation: [^\n]+/, "- Main documentation: C:\\with spaces\\(pi)\\README.md")
  .replace(/- Additional docs: [^\n]+/, "- Additional docs: C:\\项目\\docs")
  .replace(/- Examples: [^\n]+/, "- Examples: C:\\项目\\examples (extensions, custom tools, SDK)");
const pathResult = apply(baseOptions, { systemPrompt: windowsPaths });
for (const path of ["C:\\with spaces\\(pi)\\README.md", "C:\\项目\\docs", "C:\\项目\\examples"]) assert.ok(pathResult.systemPrompt.includes(path));
assert.equal(pathResult.parts.find((part) => part.name === "docs").changed, true);
checks.push("Dynamic Windows paths, spaces, parentheses and Chinese directory names remain exact");

const stats = (text) => ({ characters: [...text].length, whitespaceWords: text.trim().split(/\s+/u).length });
const report = { passed: checks.length, piVersion: version, noModelOrNetworkRequests: true, independentOfPersona: true,
  checks, comparison: { before: stats(original), after: stats(localized.systemPrompt), parts: localized.parts,
    note: "whitespaceWords is a whitespace-delimited count, not a Chinese word or model-token estimate. No rule is removed; only verified native wording is translated/condensed." },
  preservedRuleTopics: ["professional coding assistant and four file/command capabilities", "project-dependent custom tools", "conditional shell file operations", "concise replies", "clear file paths", "read Pi docs only for Pi topics", "three absolute documentation roots", "relative docs/example path resolution", "all topic indexes", "read docs/examples/cross-references before implementing", "read complete Pi markdown and follow related docs"],
};
await writeFile(join(root, "tests/native-prompt-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
