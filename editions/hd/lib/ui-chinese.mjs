import { readFileSync } from "node:fs";

// Pi does not currently expose locale hooks. This deliberately narrow adapter
// for the reviewed 1.2.0, 1.3.0 and 1.4.0 releases translates native UI display
// views, before their normal width/layout calculations. It never changes
// terminal bytes, native input or saved values.
export const SUPPORTED_UI_PI_VERSIONS = Object.freeze(["1.2.0", "1.3.0", "1.4.0"]);
const catalogue = JSON.parse(readFileSync(new URL("../assets/ui-zh-CN.json", import.meta.url), "utf8"));
const routers = new WeakMap();
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const plain = (text) => String(text).replace(CSI, "");
const nativeClasses = {
  SettingsSelectorComponent: "settings", ThinkingSelectorComponent: "thinking",
  ModelSelectorComponent: "model", SessionSelectorComponent: "session", TreeSelectorComponent: "tree",
  ThemeSelectorComponent: "theme", OAuthSelectorComponent: "oauth", LoginDialogComponent: "login",
  ExtensionSelectorComponent: "selector", ExtensionInputComponent: "input", ExtensionEditorComponent: "editor",
};
const dictionary = (text) => catalogue.texts[text] ?? text;
function outerStyle(original, translated) {
  if (plain(original) === translated) return original;
  const prefix = original.match(/^(?:\x1b\[[0-?]*[ -/]*[@-~])*/)?.[0] ?? "";
  const suffix = original.match(/(?:\x1b\[[0-?]*[ -/]*[@-~])*$/)?.[0] ?? "";
  return prefix + translated + suffix;
}
function fixedHint(text) {
  let match;
  if ((match = /^(\s*)(.+) submit\s+(.+) newline\s+(.+) cancel\s+(.+) external editor$/.exec(text))) return `${match[1]}${match[2]} 提交  ${match[3]} 换行  ${match[4]} 取消  ${match[5]} 外部编辑器`;
  if ((match = /^(\s*)(.+) to select · (.+) to set as default · (.+) to cancel$/.exec(text))) return `${match[1]}${match[2]} 选择 · ${match[3]} 设为默认 · ${match[4]} 取消`;
  if ((match = /^(\s*)(.+) cycles thinking levels in-session$/.exec(text))) return `${match[1]}${match[2]} 切换当前会话的思考档位`;
  if ((match = /^(\s*)(.+) to save · (.+) to cancel$/.exec(text))) return `${match[1]}${match[2]} 保存 · ${match[3]} 取消`;
  if ((match = /^(\s*)Type to filter · Enter to select · Esc to go back$/.exec(text))) return `${match[1]}输入以筛选 · Enter 选择 · Esc 返回`;
  if ((match = /^(\s*)Enter to select · Esc to go back$/.exec(text))) return `${match[1]}Enter 选择 · Esc 返回`;
  if ((match = /^(\s*)Type to search · Enter\/Space to change · Esc to cancel$/.exec(text))) return `${match[1]}输入以搜索 · Enter/Space 更改 · Esc 取消`;
  if ((match = /^(\s*)Enter\/Space to change · Esc to cancel$/.exec(text))) return `${match[1]}Enter/Space 更改 · Esc 取消`;
  if ((match = /^(\s*)↑↓ navigate\s+(.+) select\s+(.+) cancel$/.exec(text))) return `${match[1]}↑↓ 移动  ${match[2]} 选择  ${match[3]} 取消`;
  if ((match = /^(\s*)(.+) submit\s+(.+) cancel$/.exec(text))) return `${match[1]}${match[2]} 提交  ${match[3]} 取消`;
  if ((match = /^\((.+) to cancel\)$/.exec(text))) return `（${match[1]} 取消）`;
  if ((match = /^\((.+) to cancel, (.+) to submit\)$/.exec(text))) return `（${match[1]} 取消，${match[2]} 提交）`;
  if ((match = /^\((.+) to close\)$/.exec(text))) return `（${match[1]} 关闭）`;
  return text;
}
function settingsDescription(id, text) {
  if (catalogue.texts[text]) return catalogue.texts[text];
  let match;
  if (id === "follow-up-mode" && (match = /^(.+) queues follow-up messages until agent stops\. 'one-at-a-time': deliver one, wait for response\. 'all': deliver all at once\.$/.exec(text))) return `${match[1]} 将后续消息排队，等待当前执行停止。one-at-a-time：每次投递一条；all：一次投递全部。`;
  if (id === "model-thinking" && (match = /^Override the default thinking level for specific models\. (.+) cycles in-session\.$/.exec(text))) return `为指定模型设置默认思考档位；${match[1]} 切换当前会话的档位。`;
  return text;
}
function scopedText(scope, component) {
  const { root, kind } = scope, direct = root.children?.includes(component);
  // Lists may contain arbitrary English model/provider/session names. Only
  // direct fixed chrome or the setting submenu's owned text is eligible.
  const extensionHint = ["selector", "input", "editor"].includes(kind) && direct && component === root.children?.filter((child) => typeof child.text === "string").at(-1) && component !== root.titleText;
  const loginHint = kind === "login" && root.contentContainer?.children?.includes(component) && (() => {
    const children = root.contentContainer.children, index = children.indexOf(component);
    return index > 0 && children[index - 1] === root.input;
  })();
  if (!(kind === "settings" || direct || loginHint)) return undefined;
  const source = plain(component.text);
  if (["selector", "input", "editor"].includes(kind)) return extensionHint ? fixedHint(source) : undefined;
  if (kind === "login") {
    if (direct && /^Login to .+/.test(source)) return source.replace(/^Login to /, "登录 ");
    return loginHint ? fixedHint(source) : undefined;
  }
  if (kind === "oauth") return ["Select provider to configure:", "Select provider to logout:"].includes(source) ? dictionary(source) : undefined;
  if (kind === "session") return source === "Rename Session" ? dictionary(source) : fixedHint(source);
  if (kind === "tree") return source === "  Session Tree" ? dictionary(source) : undefined;
  if (kind === "model") {
    if (component === root.scopeText && source === "Scope: all | scoped") return "范围：全部 | 已选";
    if (component === root.scopeHintText) return source.replace(/ scope \(all\/scoped\)$/, " 范围（全部/已选）");
    return source === "Only showing models from configured providers. Use /login to add providers." ? dictionary(source) : fixedHint(source);
  }
  if (kind === "settings") {
    const title = /^Thinking Level for (.+)$/.exec(source);
    if (title) return `思考档位：${title[1]}`;
    const step = /^Step (\d+\/\d+) · (.+)$/.exec(source);
    if (step) return `第 ${step[1]} 步 · ${dictionary(step[2])}`;
  }
  return dictionary(fixedHint(source));
}
function viewItems(list, translate, call) {
  if (!Array.isArray(list.items) || !Array.isArray(list.filteredItems)) return call();
  const items = list.items, filtered = list.filteredItems, views = new Map(items.map((item) => [item, translate(item)]));
  list.items = items.map((item) => views.get(item));
  list.filteredItems = filtered.map((item) => views.get(item) ?? translate(item));
  try { return call(); } finally { list.items = items; list.filteredItems = filtered; }
}
function settingView(item) {
  const entry = catalogue.settings[item.id];
  if (!entry || item.label !== entry[0]) return item;
  return { ...item, label: entry[1], description: typeof item.description === "string" ? settingsDescription(item.id, item.description) : item.description };
}
function filterChineseSettings(list, call) {
  const items = list.items, filtered = list.filteredItems, selectedIndex = list.selectedIndex;
  if (!Array.isArray(items) || !Array.isArray(filtered)) return call();
  const originals = new Map();
  const aliases = items.map((item) => {
    const display = settingView(item);
    if (display === item) return item;
    const alias = { ...item, label: `${item.label}\n${display.label}\n${display.description ?? ""}` };
    originals.set(alias, item); return alias;
  });
  list.items = aliases;
  let complete = false;
  try {
    const result = call();
    list.filteredItems = list.filteredItems.map((item) => originals.get(item) ?? item);
    complete = true; return result;
  } finally {
    list.items = items;
    // A foreign/native filter can throw after assigning its temporary results.
    // Do not leave aliases, a partial selection or changed item identities.
    if (!complete) { list.filteredItems = filtered; list.selectedIndex = selectedIndex; }
  }
}
function optionView(kind, item) {
  let label = item.label, description = item.description;
  const sourceDescription = String(description ?? ""), baseDescription = sourceDescription.replace(/ · default$/, "");
  const thinking = (kind === "thinking" || kind === "settings") && Object.hasOwn(catalogue.thinkingLevels, item.value) && Object.hasOwn(catalogue.texts, baseDescription);
  if (thinking && typeof label === "string" && label.trim().replace(/^✓\s*/, "") === item.value) {
    label = label.replace(item.value, catalogue.thinkingLevels[item.value]);
    description = dictionary(baseDescription) + (sourceDescription.endsWith(" · default") ? " · 默认" : "");
  } else if (kind === "theme" && description === "(current)") description = "（当前）";
  else if (kind === "settings") {
    if (item.value === "/" && label === "  automatic") label = "  自动";
    if (item.value === "__none__" && label === "No models available") label = dictionary(label);
    if (item.value === "__clear__" && label === "  (clear override)") label = "  （清除覆盖）";
    if (typeof description === "string") description = dictionary(description);
  }
  return label === item.label && description === item.description ? item : { ...item, label, description };
}
function temporaryMethod(component, key, transform, call) {
  if (!component || typeof component[key] !== "function") return call();
  const own = Object.getOwnPropertyDescriptor(component, key), original = component[key];
  const wrapped = function (...args) { return transform(original.apply(this, args), args[0]); };
  Object.defineProperty(component, key, { configurable: true, writable: true, value: wrapped });
  try { return call(); } finally {
    if (Object.getOwnPropertyDescriptor(component, key)?.value === wrapped) {
      if (own) Object.defineProperty(component, key, own); else delete component[key];
    }
  }
}
function chromeRows(rows, width, kind, component, tuiUI) {
  if (!Array.isArray(rows)) return rows;
  const pairs = kind === "session" ? {
    "Resume Session (Current Folder)": "恢复会话（当前目录）", "Resume Session (All)": "恢复会话（全部）",
    "Sort: ": "排序：", "Name: ": "名称：", "Threaded": "分支", "Recent": "最近", "Fuzzy": "相关度",
    "Current Folder": "当前目录", "All": "全部", "Named": "已命名", "Loading ": "加载中 ",
    "Delete session?": "删除此会话？", "confirm": "确认", "cancel": "取消", "scope": "范围", "sort": "排序", "named": "仅命名", "delete": "删除", "path": "路径", "rename": "重命名",
    "regex": "正则", "exact": "精确", "(on)": "（开）", "(off)": "（关）",
  } : kind === "tree-help" ? { "label time": "标签时间", "move": "移动", "page": "翻页", "branch": "分支", "copy": "复制", "label": "标签", "filters": "筛选", "cycle": "切换" } : { "Type to search:": "输入以搜索：" };
  return rows.map((line, row) => {
    // Session error/status strings can include filesystem/user data.
    if (kind === "session" && row > 0 && component.statusMessage) return line;
    // SearchLine contains the user's query after its first fixed prefix.
    if (kind === "tree-search") return tuiUI.truncateToWidth(line.replace("Type to search:", "输入以搜索："), width, "");
    const segments = line.split(/(\x1b\[[0-?]*[ -/]*[@-~])/g);
    const translated = segments.map((part) => part.startsWith("\x1b[") ? part : Object.entries(pairs).reduce((value, [en, zh]) => value.replaceAll(en, zh), part)).join("");
    return tuiUI.truncateToWidth(translated, width, "");
  });
}
function withHelpers(scope, tuiUI, call) {
  if (scope.kind === "session") return temporaryMethod(scope.root.header, "render", (rows, width) => chromeRows(rows, width, "session", scope.root.header, tuiUI), call);
  if (scope.kind === "tree") {
    const children = scope.root.children ?? [], help = children.find((child) => child.constructor?.name === "TreeHelp"), search = children.find((child) => child.constructor?.name === "SearchLine");
    return temporaryMethod(help, "render", (rows, width) => chromeRows(rows, width, "tree-help", help, tuiUI), () =>
      temporaryMethod(search, "render", (rows, width) => chromeRows(rows, width, "tree-search", search, tuiUI), call));
  }
  return call();
}
function hook(router, target, key, around) {
  if (!target || typeof target[key] !== "function") return;
  const own = Object.getOwnPropertyDescriptor(target, key), original = target[key];
  if (own && (!own.configurable || typeof own.value !== "function")) return;
  const wrapped = function (...args) { return around.call(this, () => original.apply(this, args), args); };
  Object.defineProperty(target, key, { ...(own ?? { configurable: true, writable: true }), value: wrapped });
  router.hooks.push(() => {
    if (Object.getOwnPropertyDescriptor(target, key)?.value !== wrapped) return;
    if (own) Object.defineProperty(target, key, own); else delete target[key];
  });
}

export function installChineseUi({ agentUI = {}, tuiUI = {}, version, isEnabled = () => true } = {}) {
  const supported = SUPPORTED_UI_PI_VERSIONS.includes(String(version ?? "")) && typeof tuiUI.Text?.prototype.render === "function" && typeof tuiUI.truncateToWidth === "function";
  const coverage = { locale: "zh-CN", version: String(version ?? "unknown"), versions: [...SUPPORTED_UI_PI_VERSIONS], supported, mode: "scoped-native-ui-compatibility", classes: [], settings: Object.keys(catalogue.settings), settingsSearch: "Native settings main list: Chinese label/description aliases plus unchanged English filtering; all other lists retain native search", limits: [...catalogue.coverageLimits] };
  if (!supported) return { coverage, dispose() {} };
  const key = tuiUI.Text.prototype;
  let router = routers.get(key);
  if (!router) {
    router = { observers: new Set(), hooks: [], scopes: [], classes: [], mainSettings: new WeakMap() }; routers.set(key, router);
    const enabled = () => [...router.observers].some((observer) => { try { return observer(); } catch { return false; } });
    hook(router, agentUI.SettingsSelectorComponent?.prototype, "getSettingsList", function (call) {
      const list = call();
      if (list && typeof list === "object") router.mainSettings.set(list, this);
      return list;
    });
    for (const [name, kind] of Object.entries(nativeClasses)) {
      const prototype = agentUI[name]?.prototype;
      if (!prototype || typeof prototype.render !== "function") continue;
      hook(router, prototype, "render", function (call) {
        if (kind === "settings") this.getSettingsList?.();
        if (!enabled()) return call();
        const scope = { kind, root: this }; router.scopes.push(scope);
        try { return withHelpers(scope, tuiUI, call); } finally { router.scopes.pop(); }
      });
      router.classes.push(name);
    }
    for (const Class of new Set([tuiUI.Text, tuiUI.TruncatedText].filter(Boolean))) hook(router, Class.prototype, "render", function (call) {
      const scope = router.scopes.at(-1);
      if (!scope || typeof this.text !== "string") return call();
      const translation = scopedText(scope, this);
      if (translation === undefined || translation === plain(this.text)) return call();
      const source = this.text; this.text = outerStyle(source, translation);
      try { return call(); } finally { this.text = source; }
    });
    hook(router, tuiUI.SettingsList?.prototype, "render", function (call) {
      return router.scopes.at(-1)?.kind === "settings" ? viewItems(this, settingView, call) : call();
    });
    hook(router, tuiUI.SettingsList?.prototype, "handleInput", function (call) {
      const root = router.mainSettings.get(this);
      if (!root || !enabled()) return call();
      router.scopes.push({ kind: "settings", root });
      try { return call(); } finally { router.scopes.pop(); }
    });
    hook(router, tuiUI.SettingsList?.prototype, "applyFilter", function (call, args) {
      // Preserve the exact native English ranking, including exact-match
      // bonuses. Chinese/mixed queries use native fuzzyFilter over aliases.
      if (!enabled() || !router.mainSettings.has(this) || router.scopes.at(-1)?.kind !== "settings" || typeof args[0] !== "string" || !/\p{Script=Han}/u.test(args[0])) return call();
      return filterChineseSettings(this, call);
    });
    hook(router, tuiUI.SettingsList?.prototype, "addHintLine", function (call, args) {
      const result = call();
      if (router.scopes.at(-1)?.kind === "settings" && Array.isArray(args[0])) {
        const lines = args[0], last = lines.at(-1);
        if (typeof last === "string") {
          const text = fixedHint(this.searchEnabled ? "  Type to search · Enter/Space to change · Esc to cancel" : "  Enter/Space to change · Esc to cancel");
          lines[lines.length - 1] = tuiUI.truncateToWidth(typeof this.theme?.hint === "function" ? this.theme.hint(text) : outerStyle(last, text), args[1], "");
        }
      }
      return result;
    });
    hook(router, tuiUI.SelectList?.prototype, "render", function (call) {
      const kind = router.scopes.at(-1)?.kind;
      return ["settings", "thinking", "theme"].includes(kind) ? viewItems(this, (item) => optionView(kind, item), call) : call();
    });
  }
  coverage.classes = [...router.classes];
  // A distinct callback permits callers to reuse the same isEnabled function.
  const observer = () => isEnabled(); router.observers.add(observer);
  let disposed = false;
  return { coverage, dispose() {
    if (disposed) return; disposed = true; router.observers.delete(observer);
    if (router.observers.size) return;
    for (const restore of [...router.hooks].reverse()) restore();
    routers.delete(key);
  } };
}
