// Pi 1.2 built-in command descriptions only. The two English forms account for
// a SlashCommand's optional argumentHint, which CombinedAutocompleteProvider
// prepends to its description. Command names and argument syntax stay intact.
const BUILTINS = [
  ["settings", "Open settings menu", "打开设置菜单"],
  ["model", "Select model (opens selector UI)", "选择模型（打开选择器）", "<provider/model>"],
  ["tree", "Navigate session tree (switch branches)", "浏览会话树（切换分支）"],
  ["thinking", "Set thinking level", "设置思考等级", "<level>"],
  ["scoped-models", "Enable/disable models for Ctrl+P cycling", "启用或停用 Ctrl+P 轮换的模型"],
  ["export", "Export session (HTML default, or specify path: .html/.jsonl)", "导出会话（默认 HTML，也可指定 .html/.jsonl 路径）"],
  ["import", "Import and resume a session from a JSONL file", "从 JSONL 文件导入并恢复会话"],
  ["share", "Share session as a secret GitHub gist", "创建未公开列出的 GitHub Gist 来分享会话"],
  ["bug", "Report a bug to the Pi developers", "向 Pi 开发者报告问题", "<description>"],
  ["copy", "Copy last agent message to clipboard", "复制上一条 AI 回答到剪贴板"],
  ["name", "Set session display name", "设置会话显示名称"],
  ["session", "Show session info and stats", "查看会话信息和统计"],
  ["changelog", "Show changelog entries", "查看更新记录"],
  ["hotkeys", "Show all keyboard shortcuts", "查看全部快捷键"],
  ["fork", "Create a new fork from a previous user message", "从先前的用户消息分叉新会话"],
  ["clone", "Duplicate the current session at the current position", "在当前位置复制当前会话"],
  ["trust", "Save project trust decision for future sessions", "保存本项目的信任选择，供以后会话使用"],
  ["login", "Configure provider authentication", "配置提供方认证", "<provider>"],
  ["logout", "Remove provider authentication", "移除提供方认证"],
  ["new", "Start a new session", "开始新会话"],
  ["compact", "Manually compact the session context", "手动压缩会话上下文"],
  ["resume", "Resume a different session", "恢复另一个会话"],
  ["reload", "Reload keybindings, extensions, skills, prompts, themes, and context files", "重新加载快捷键、扩展、技能、提示词、主题和上下文文件"],
  ["quit", "Quit pi", "退出 pi"],
];
const translations = new Map(BUILTINS.map(([name, english, chinese, hint]) => [name,
  new Map([[english, chinese], ...(hint ? [[`${hint} — ${english}`, `${hint} — ${chinese}`]] : [])])]));
const marker = Symbol("pi-furry-partner.command-chinese");

/** Wrap Pi's public provider without replacing its completion implementation. */
export function createChineseAutocompleteFactory({ isEnabled = () => true } = {}) {
  const factoryId = {};
  return function chineseAutocomplete(current) {
    const previous = Object.getOwnPropertyDescriptor(current, marker)?.value;
    if (previous?.factoryId === factoryId && previous.provider === current && previous.getSuggestions === current.getSuggestions) return current;
    // Inherit additional provider metadata while explicitly forwarding public
    // methods with their original receiver (including providers with #fields).
    const provider = Object.create(current);
    const getSuggestions = async (...args) => {
      const result = await current.getSuggestions(...args);
      if (!isEnabled() || !result) return result;
      const [lines, cursorLine, cursorCol, options] = args;
      const command = String(lines?.[cursorLine] ?? "").slice(0, cursorCol).trimStart();
      // File completion (including forced /absolute paths), skill names and
      // command arguments are not command-name suggestions. A file named
      // "settings" therefore cannot enter this translation branch.
      if (options?.force || !command.startsWith("/") || /[\s/\\]/u.test(command.slice(1)) || result.prefix !== command) return result;
      let changed = false;
      const items = result.items.map((item) => {
        const description = translations.get(item.value)?.get(item.description);
        if (description === undefined) return item;
        changed = true;
        return { ...item, description };
      });
      return changed ? { ...result, items } : result;
    };
    Object.defineProperties(provider, {
      getSuggestions: { value: getSuggestions, configurable: true, writable: true, enumerable: true },
      applyCompletion: { value: (...args) => current.applyCompletion(...args), configurable: true, writable: true, enumerable: true },
      triggerCharacters: { get: () => current.triggerCharacters, configurable: true, enumerable: true },
      [marker]: { value: { factoryId, provider, getSuggestions } },
    });
    if (typeof current.shouldTriggerFileCompletion === "function") {
      Object.defineProperty(provider, "shouldTriggerFileCompletion", {
        value: (...args) => current.shouldTriggerFileCompletion(...args), configurable: true, writable: true, enumerable: true,
      });
    }
    return provider;
  };
}
