// Pure, per-run localization of verified Pi defaults. Never edits vendor files,
// user SYSTEM.md, project instructions, tool guidelines, skills or addenda.
export const NATIVE_PROMPT_PI_VERSION = "1.2.0";
export const DEFAULT_PI_PREAMBLE = "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
export const DEFAULT_ZH_PREAMBLE = "你是运行在 Pi 编程代理环境中的专业助手。通过读取文件、执行命令、编辑代码和创建文件帮助用户完成任务。";

const TOOLS_INTRO = "In addition to the tools above, you may have access to other custom tools depending on the project.";
const ZH_TOOLS_INTRO = "此外，项目可能还提供其他自定义工具。";
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

/**
 * Localize only Pi 1.2.0 defaults proven by the current event options and exact
 * prefix content. The untouched suffix is copied byte-for-byte and in order.
 * Unknown/custom/forced prompts fail closed. This function is independent of
 * expression-style settings; callers compose those separately after this step.
 * Pass the fresh before_agent_start prompt each run. enabled:false returns it
 * unchanged, so disabling restores native behavior without a vendor edit.
 */
export function compactNativePrompt({ systemPrompt, piVersion, systemPromptOptions, enabled = true, basePrompt = DEFAULT_ZH_PREAMBLE } = {}) {
  if (typeof systemPrompt !== "string") throw new TypeError("systemPrompt must be a string");
  const original = systemPrompt, parts = [];
  const unchanged = (reason) => ({ systemPrompt: original, changed: false, matched: false, reason, parts });
  if (!enabled) return unchanged("disabled");
  if (piVersion !== NATIVE_PROMPT_PI_VERSION) return unchanged("unsupported-version");
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
    note(name, before, after, reason); return true;
  };
  const finish = () => ({ systemPrompt: output + original.slice(cursor), changed: output + original.slice(cursor) !== original,
    matched: true, reason: "matched-default-sections", parts, untouchedSuffixCharacters: [...original.slice(cursor)].length });
  const custom = systemPromptOptions.sections || {};
  const selected = systemPromptOptions.selectedTools || ["read", "bash", "edit", "write"];
  const declared = selected.filter((name) => !(systemPromptOptions.hiddenTools || []).includes(name));
  const visible = declared.filter((name) => !!systemPromptOptions.toolSnippets?.[name]);
  const toolList = visible.length ? visible.map((name) => `- ${name}: ${systemPromptOptions.toolSnippets[name]}`).join("\n") : "(none)";
  const tools = `${toolList}\n\n${TOOLS_INTRO}`;
  if (!take("tools", custom.tools || tools, custom.tools || `${visible.length ? toolList : "（无）"}\n\n${ZH_TOOLS_INTRO}`, custom.tools ? "custom-section-preserved" : undefined)) return finish();
  const entries = defaultRules(systemPromptOptions, declared);
  const rules = entries.map(({ text }) => `- ${text}`).join("\n");
  const localizedRules = entries.map(({ text, builtin }) => `- ${builtin ? RULE_TRANSLATIONS.get(text) || text : text}`).join("\n");
  if (!take("rules", custom.rules || rules, custom.rules || localizedRules, custom.rules ? "custom-section-preserved" : undefined)) return finish();
  if (custom.docs) {
    take("docs", custom.docs, custom.docs, "custom-section-preserved");
    return finish();
  }
  const docsMatch = original.slice(cursor).startsWith("\n\n") && docsPattern.exec(original.slice(cursor + 2));
  if (docsMatch) {
    output += "\n\n" + wrap("docs", chineseDocs(docsMatch[1], docsMatch[2], docsMatch[3]));
    cursor += 2 + docsMatch[0].length;
    note("docs", docsMatch[0], wrap("docs", chineseDocs(docsMatch[1], docsMatch[2], docsMatch[3])));
  } else parts.push({ name: "docs", changed: false, reason: "unrecognized-section" });
  return finish();
}
