// Pure, per-run localization of verified Pi defaults. Never edits vendor files,
// user SYSTEM.md, project instructions, tool guidelines, skills or addenda.
// Pi 1.2.0 and 1.3.0 render byte-identical default preamble, rules and docs
// sections, so one reviewed fixture covers both releases.
export const SUPPORTED_PROMPT_PI_VERSIONS = Object.freeze(["1.2.0", "1.3.0"]);
export const NATIVE_PROMPT_PI_VERSION = SUPPORTED_PROMPT_PI_VERSIONS[0];
export const DEFAULT_PI_PREAMBLE = "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
export const DEFAULT_ZH_PREAMBLE = "你是运行在 Pi 编程代理环境中的专业助手。通过读取文件、执行命令、编辑代码和创建文件帮助用户完成任务。必须使用中文思考和回复。";
export const DEFAULT_EN_PREAMBLE = "You are an expert coding assistant in Pi. Help users by reading files, running commands, editing code, and creating files.";

const TOOLS_INTRO = "In addition to the tools above, you may have access to other custom tools depending on the project.";
const ZH_TOOLS_INTRO = "此外，项目可能还提供其他自定义工具。";
const EN_TOOLS_INTRO = "The project may provide additional custom tools.";
const EN_RULES = new Map([
  ["Use bash or PowerShell for file operations like listing, searching, and finding files", "Use bash or PowerShell to list, search, and find files."],
  ["Use PowerShell for file operations like listing, searching, and finding files", "Use PowerShell to list, search, and find files."],
  ["Use bash for file operations like ls, rg, find", "Use bash for file operations such as ls, rg, and find."],
  ["Be concise in your responses", "Be concise."],
  ["Show file paths clearly when working with files", "Show file paths clearly."],
]);
const RULE_TRANSLATIONS = new Map([
  ["Use bash or PowerShell for file operations like listing, searching, and finding files", "用 bash 或 PowerShell 列出、搜索和查找文件。"],
  ["Use PowerShell for file operations like listing, searching, and finding files", "用 PowerShell 列出、搜索和查找文件。"],
  ["Use bash for file operations like ls, rg, find", "用 bash 执行 ls、rg、find 等文件操作。"],
  ["Be concise in your responses", "回答简洁。"],
  ["Show file paths clearly when working with files", "涉及文件时清楚展示路径。"],
]);
const DOCS_HEADER = "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):";
const DOCS_TAIL = [
  "- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory",
  "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)",
  "- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
  "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
].join("\n");
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const docsPattern = new RegExp("^<docs>\\n" + escape(DOCS_HEADER) +
  "\\n- Main documentation: ([^\\n]+)\\n- Additional docs: ([^\\n]+)\\n- Examples: ([^\\n]+)" +
  escape(" (extensions, custom tools, SDK)\n" + DOCS_TAIL + "\n</docs>"));
const wrap = (name, content) => `<${name}>\n${content}\n</${name}>`;
const measure = (text) => ({ characters: [...text].length, whitespaceWords: text.trim() ? text.trim().split(/\s+/u).length : 0 });

function defaultRules(options, declared) {
  const entries = [], seen = new Set();
  const add = (text, builtin) => {
    if (typeof text !== "string") throw new TypeError("Pi prompt guidelines must be strings");
    const normalized = text.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized); entries.push({ text: normalized, builtin });
  };
  const bash = declared.includes("bash"), powershell = declared.includes("powershell");
  if ((bash || powershell) && !["grep", "find", "ls"].some((name) => declared.includes(name))) {
    add(bash && powershell ? "Use bash or PowerShell for file operations like listing, searching, and finding files"
      : powershell ? "Use PowerShell for file operations like listing, searching, and finding files"
        : "Use bash for file operations like ls, rg, find", true);
  }
  for (const name of declared) for (const rule of options.toolGuidelines?.[name] || []) add(rule, false);
  for (const rule of options.promptGuidelines || []) add(rule, false);
  add("Be concise in your responses", true);
  add("Show file paths clearly when working with files", true);
  return entries;
}

function chineseDocs(readme, docs, examples) {
  return [
    "Pi 文档（仅用户询问 Pi、SDK、扩展、主题、技能或 TUI 时读取）：",
    `- 主文档：${readme}`,
    `- 更多文档：${docs}`,
    `- 示例：${examples}（扩展、自定义工具、SDK）`,
    "- docs/...、examples/... 分别以上述文档、示例目录为根，勿用当前工作目录。",
    "- 主题索引：扩展 docs/extensions.md、examples/extensions/；主题 docs/themes.md；技能 docs/skills.md；提示模板 docs/prompt-templates.md；TUI docs/tui.md；快捷键 docs/keybindings.md；SDK docs/sdk.md；自定义提供商 docs/custom-provider.md；添加模型 docs/models.md；Pi 包 docs/packages.md；环境变量 docs/environment-variables.md；MCP 服务器 docs/mcp.md；codemode 脚本及分类器、图像等非语言模型 docs/codemode.md。",
    "- 处理 Pi 工作前阅读相关文档、示例及 .md 交叉引用；所有 Pi .md 文件须完整阅读，并跟进关联文档（如 TUI API 的 tui.md）。",
  ].join("\n");
}
function englishDocs(readme, docs, examples) {
  return [
    "Pi documentation (read only for questions about Pi, its SDK, extensions, themes, skills, or TUI):",
    `- Main documentation: ${readme}`,
    `- Additional docs: ${docs}`,
    `- Examples: ${examples} (extensions, custom tools, SDK)`,
    "- Resolve docs/... and examples/... under the docs and examples roots above, not the working directory.",
    "- Topics: extensions docs/extensions.md, examples/extensions/; themes docs/themes.md; skills docs/skills.md; prompt templates docs/prompt-templates.md; TUI docs/tui.md; keybindings docs/keybindings.md; SDK docs/sdk.md; custom providers docs/custom-provider.md; models docs/models.md; packages docs/packages.md; environment variables docs/environment-variables.md; MCP docs/mcp.md; codemode scripts and non-LLM models (classifiers, image models) docs/codemode.md.",
    "- Before implementing Pi work, read the relevant docs, examples, and .md cross-references. Read every Pi .md file completely and follow related docs (e.g. tui.md for TUI APIs).",
  ].join("\n");
}

/**
 * Localize only the verified Pi 1.2.0/1.3.0 defaults proven by the current
 * event options and exact prefix content. The untouched suffix is copied
 * byte-for-byte and in order.
 * Unknown/custom/forced prompts fail closed. This function is independent of
 * expression-style settings; callers compose those separately after this step.
 * Pass the fresh before_agent_start prompt each run. enabled:false returns it
 * unchanged, so disabling restores native behavior without a vendor edit.
 */
export function compactNativePrompt({ systemPrompt, piVersion, systemPromptOptions, enabled = true, language = "zh-CN",
  basePrompt = language === "en" ? DEFAULT_EN_PREAMBLE : DEFAULT_ZH_PREAMBLE } = {}) {
  if (typeof systemPrompt !== "string") throw new TypeError("systemPrompt must be a string");
  const original = systemPrompt, parts = [], sectionReplacements = {};
  const unchanged = (reason) => ({ systemPrompt: original, changed: false, matched: false, reason, parts, sectionReplacements });
  if (!enabled) return unchanged("disabled");
  if (!["zh-CN", "en"].includes(language)) return unchanged("unsupported-language");
  if (!SUPPORTED_PROMPT_PI_VERSIONS.includes(piVersion)) return unchanged("unsupported-version");
  if (!systemPromptOptions || typeof systemPromptOptions !== "object") return unchanged("missing-options");
  if (systemPromptOptions.customPrompt) return unchanged("custom-system-prompt");
  if (systemPromptOptions.forceSystemPrompt !== undefined) return unchanged("forced-system-prompt");
  if (typeof basePrompt !== "string" || !basePrompt.trim()) return unchanged("empty-base");
  basePrompt = basePrompt.trim();
  if (original === basePrompt || original.startsWith(basePrompt + "\n\n")) return unchanged("already-localized");
  if (!original.startsWith(DEFAULT_PI_PREAMBLE) || (original.length > DEFAULT_PI_PREAMBLE.length && !original.startsWith("\n\n<", DEFAULT_PI_PREAMBLE.length))) return unchanged("unrecognized-preamble");
  let cursor = DEFAULT_PI_PREAMBLE.length, output = basePrompt;
  const note = (name, before, after, reason = "matched-default") => parts.push({ name, changed: before !== after, reason, before: measure(before), after: measure(after) });
  note("preamble", DEFAULT_PI_PREAMBLE, basePrompt);
  const take = (name, before, after, reason) => {
    const exact = "\n\n" + wrap(name, before);
    if (!original.startsWith(exact, cursor)) {
      parts.push({ name, changed: false, reason: "unrecognized-section" });
      return false;
    }
    output += "\n\n" + wrap(name, after); cursor += exact.length;
    if (before !== after) sectionReplacements[name] = after;
    note(name, before, after, reason); return true;
  };
  const finish = () => ({ systemPrompt: output + original.slice(cursor), changed: output + original.slice(cursor) !== original,
    matched: true, reason: "matched-default-sections", parts, sectionReplacements, untouchedSuffixCharacters: [...original.slice(cursor)].length });
  const custom = systemPromptOptions.sections || {};
  const selected = systemPromptOptions.selectedTools || ["read", "bash", "edit", "write"];
  const declared = selected.filter((name) => !(systemPromptOptions.hiddenTools || []).includes(name));
  const visible = declared.filter((name) => !!systemPromptOptions.toolSnippets?.[name]);
  const toolList = visible.length ? visible.map((name) => `- ${name}: ${systemPromptOptions.toolSnippets[name]}`).join("\n") : "(none)";
  const tools = `${toolList}\n\n${TOOLS_INTRO}`;
  const english = language === "en";
  if (!take("tools", custom.tools || tools, custom.tools || `${visible.length ? toolList : english ? "(none)" : "（无）"}\n\n${english ? EN_TOOLS_INTRO : ZH_TOOLS_INTRO}`, custom.tools ? "custom-section-preserved" : undefined)) return finish();
  const entries = defaultRules(systemPromptOptions, declared);
  const rules = entries.map(({ text }) => `- ${text}`).join("\n");
  const localizedRules = entries.map(({ text, builtin }) => `- ${builtin ? (english ? EN_RULES : RULE_TRANSLATIONS).get(text) || text : text}`).join("\n");
  if (!take("rules", custom.rules || rules, custom.rules || localizedRules, custom.rules ? "custom-section-preserved" : undefined)) return finish();
  if (custom.docs) {
    take("docs", custom.docs, custom.docs, "custom-section-preserved");
    return finish();
  }
  const docsMatch = original.slice(cursor).startsWith("\n\n") && docsPattern.exec(original.slice(cursor + 2));
  if (docsMatch) {
    const localizedDocs = (english ? englishDocs : chineseDocs)(docsMatch[1], docsMatch[2], docsMatch[3]);
    output += "\n\n" + wrap("docs", localizedDocs);
    cursor += 2 + docsMatch[0].length;
    note("docs", docsMatch[0], wrap("docs", localizedDocs));
    sectionReplacements.docs = localizedDocs;
  } else parts.push({ name: "docs", changed: false, reason: "unrecognized-section" });
  return finish();
}

/**
 * Request-time integration uses Pi's structured sections instead of forcing a
 * rendered prompt. Only the large, verified native docs section is replaced.
 * Pi keeps its preamble, tools and rules so later extensions can change tool
 * declarations/guidelines without stale snapshots or accessor interception.
 * The full-string formatter above remains useful for offline inspection.
 */
export function compactNativePromptSections(input) {
  const result = compactNativePrompt(input);
  const docs = result.sectionReplacements.docs;
  return { changed: typeof docs === "string", reason: result.reason,
    sections: typeof docs === "string" ? { docs } : {} };
}

export const PERSONA_SECTION = "umi_persona";
export function addPersonaSection(options, template) {
  if (!options || typeof options !== "object" || !options.sections || typeof options.sections !== "object") throw new TypeError("Pi's structured system prompt options are unavailable");
  if (typeof template !== "string" || !template.trim()) throw new TypeError("The persona template is empty");
  template = template.trim();
  if (options.forceSystemPrompt !== undefined) {
    // Another extension already owns an opaque prompt. Keep its complete text
    // as the exact prefix; never introduce forced mode ourselves.
    options.forceSystemPrompt += `\n\n${template}`;
    return;
  }
  const existing = options.sections[PERSONA_SECTION];
  options.sections[PERSONA_SECTION] = existing ? `${existing}\n\n${template}` : template;
}
