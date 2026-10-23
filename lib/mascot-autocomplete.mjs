import { DEMO_STATES } from "./activity.mjs";
import { LANGUAGES, localize } from "./language.mjs";
import { STYLES } from "./styles.mjs";

const copy = (zh, en) => Object.freeze({ zh, en });
const value = (name, zh, en) => Object.freeze({ name, description: copy(zh, en) });
const statusValues = () => [
  value("on", "开启", "Enable"),
  value("off", "关闭", "Disable"),
  value("status", "查看当前状态", "Show the current status"),
];

const COMMANDS = Object.freeze([
  { name: "language", description: copy("选择显示语言", "Choose the display language"), values: [
    ...LANGUAGES.map((name) => value(name, name === "auto" ? "跟随系统语言" : `切换为 ${name}`, name === "auto" ? "Follow the system language" : `Switch to ${name}`)),
    value("status", "查看当前语言", "Show the current language"),
  ] },
  { name: "menu", description: copy("打开快捷操作菜单", "Open the quick actions menu") },
  { name: "poke", description: copy("轻轻戳一下呜咪", "Give Umi a gentle poke") },
  { name: "layout", description: copy("选择角色布局", "Choose the companion layout"), values: [
    value("editor", "显示在输入框旁", "Show beside the editor"),
    value("header", "显示为启动标题", "Show in the startup header"),
  ] },
  { name: "style", description: copy("选择角色外观", "Choose the companion style"), values: STYLES.map((name) => value(name,
    "插画风呜咪",
    "Illustrated Umi")) },
  { name: "pause", description: copy("暂停循环动画", "Pause looping animation") },
  { name: "play", description: copy("播放循环动画", "Play looping animation") },
  { name: "on", description: copy("显示角色", "Show the companion") },
  { name: "off", description: copy("隐藏角色", "Hide the companion") },
  { name: "size", description: copy("选择角色尺寸", "Choose the companion size"), values: ["auto", "small", "compact", "normal", "large"].map((name) => value(name, `尺寸：${name}`, `Size: ${name}`)) },
  { name: "render", description: copy("选择图像渲染方式", "Choose the image renderer"), values: ["auto", "kitty", "sixel", "blocks"].map((name) => value(name, `渲染：${name}`, `Renderer: ${name}`)) },
  { name: "info", description: copy("选择底部信息样式", "Choose the footer style"), values: [
    value("compact", "使用紧凑信息栏", "Use the compact footer"),
    value("native", "使用 Pi 原生信息栏", "Use Pi's native footer"),
  ] },
  { name: "locale", description: copy("控制 Pi 中文界面偏好", "Control the Pi Chinese UI preference"), values: statusValues() },
  { name: "prompt", description: copy("控制 Pi 文档提示精简", "Control concise Pi documentation prompts"), values: statusValues() },
  { name: "persona", description: copy("控制呜咪角色语气", "Control Umi's character voice"), values: statusValues() },
  { name: "demo", description: copy("预览角色动画", "Preview companion animation"), values: [
    value("all", "循环预览全部动画", "Cycle through every animation"),
    ...DEMO_STATES.map((name) => value(name, `预览 ${name} 动画`, `Preview the ${name} animation`)),
    value("off", "退出动画预览", "Stop the animation preview"),
  ] },
  { name: "wink", description: copy("预览睡醒或眨眼动画", "Preview the waking or wink animation") },
].map((command) => Object.freeze({ ...command, values: command.values && Object.freeze(command.values) })));

function description(language, text) {
  return localize(language, text.zh, text.en);
}

/** Return complete /mascot argument strings for Pi's argument completer. */
export function getMascotArgumentCompletions(argumentPrefix, language = "auto") {
  const prefix = String(argumentPrefix ?? "").trimStart();
  const separator = prefix.search(/\s/u);

  if (separator === -1) {
    const query = prefix.toLowerCase();
    const matches = COMMANDS.filter((command) => command.name.startsWith(query));
    return matches.length ? matches.map((command) => ({
      value: command.values ? `${command.name} ` : command.name,
      label: command.name,
      description: description(language, command.description),
    })) : null;
  }

  const commandName = prefix.slice(0, separator).toLowerCase();
  const command = COMMANDS.find((item) => item.name === commandName);
  if (!command?.values) return null;

  const optionPrefix = prefix.slice(separator).trimStart();
  if (/\s/u.test(optionPrefix)) return null;
  const query = optionPrefix.toLowerCase();
  const matches = command.values.filter((item) => item.name.toLowerCase().startsWith(query));
  return matches.length ? matches.map((item) => ({
    value: `${command.name} ${item.name}`,
    label: item.name,
    description: description(language, item.description),
  })) : null;
}
