# Pi HD 使用指南

[English](guide.en.md) · [HD 首页](../README.md) · [全部文档](../../../docs/README.md) · [发布规则](../../../docs/release-line.md)

本指南只适用于 main 的 `editions/hd/`。当前 HD 源码版本为 **2.5.1-preview.6**，仅提供高清插画；已发布 `hd-v2.5.1-preview.6`（latest=false），安装包附在该 Release。仓库 Latest 是根目录原资源版 v2.5.1，不是 HD 下载入口。DSH 的安装与设置请查 [DSH 独立仓库](https://github.com/KouzakiUmi/dsh-furry-partner)。

## 安装与更新

一次只加载一种 Pi 版本。原资源版与 HD 保留相同插件标识和主题名以便替换升级，不能同时安装来叠加功能。先退出 Pi；切换来源时先卸载旧来源，保留备份。包管理安装与脚本安装也应择一。

源码方式先获取整个仓库，再从 HD 子目录安装。在仓库根目录执行：

```sh
pi install ./editions/hd
```

或者进入 `editions/hd/`，在 Windows PowerShell 运行本目录的安装器：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
pi
```

直接执行 `pi install git:github.com/KouzakiUmi/pi-furry-partner@main`，或把这个 Git URL 固定到 `hd-v…`，都会读取仓库根目录清单，不能据此选择 HD。HD 应使用本地子目录，或日后 HD Release 的专用构建包。

构建命令均在 `editions/hd/` 中运行：

```sh
npm run build:animated
python tools/audit-edition-bundles.py --edition full-animation
```

产物为 `dist/releases/pi-furry-partner-hd-full-animation-2.5.1-preview.6-pi-core.tgz` 及校验／审计文件。构建不安装、不推送、不发布。下载专用 tgz 后解压，进入内层 `package/` 再运行其安装脚本，或交由 Pi 包管理器加载该本地包。

## 版本、终端与布局

自动化覆盖 Windows、Pi **1.2.0 / 1.3.0 / 1.4.0**、Windows PowerShell **5.1 / 7**。中文界面与文档提示精简只启用已审阅版本和结构，未知版本保留 Pi 原行为。先安装并配置 Pi 和模型服务。

`/mascot render auto|kitty|sixel|blocks` 选择图像后端；协议支持由实际终端决定。`/mascot layout editor` 显示完整侧边动作，`layout header` 使用独立标题头像。窄窗口可能收起侧边图像以保留输入空间。`fullscreen` 使用 Pi 原生鼠标路由，`regular` 保留终端鼠标并显示快捷键提示。自动化绘制检查不等同于所有终端的目视验收。

## 动作、补全与暂停

```text
/mascot action nod
/mascot action shy
/mascot action all
/mascot action off
```

Tab 补全、动作菜单与 `lib/gestures.mjs` 的 17 项定义一致：wave, nod, peek, stretch, ear-flick, nuzzle, bounce, head-shake, joy, grumpy, sad, cry, shy, flustered, surprise, proud, affection。单项播放会结束，`all` 循环，`off` 停止。任务、提问、输入与主动互动拥有优先级；动作不提交模型请求或改写草稿。

17 项是可点选的小动作和表情；`assets/animated/catalog.json` 的 **29 个完整片段**还包括任务状态、三条待机和键盘过渡，并对应 **58 个索引入口**。八个辅助动作和九种表情当前均为 4458ms；实际时长由已批准 catalog 覆盖旧的名义时长，详见[动作定义](shared-gesture-modules.md)。

阅读使用放大镜 `watch`；编辑和执行使用 `work-enter → work → work-exit`，完整进入和退出各 400ms。普通短动作从真实首帧可见起保留至少 1200ms；短工作包含至少 800ms 键盘循环。最后工具结束后只可保留安全视觉阶段最多 2000ms，真实 phase/toolCount 即时结束，不排过期动作队列。回答、等待、报错、取消与主动互动可以抢占。

`/mascot pause` 暂停循环，真实状态继续更新；显式戳戳仍可有限播放。戳一戳分两段：先显示 HD 原画挤眼姿态并整帧轻轻回弹 1.2 秒，再按闲时、忙碌或等待情境接一段 1.2 秒的轻弹、抖耳或晃脑袋，不连续重复同一回应。资源缺失或暂停使用 HD 自己的原画静态姿态，不启用原资源版形变播放器。HD 仅支持 `umi` 插画，旧像素配置迁移到插画，不提供第二套像素素材。

## 语言、控件与独立设置

`/mascot language auto|en|zh-CN|status` 控制界面语言；`auto` 跟随系统。默认名字随语言变化，自定义名字保留。`/mascot menu` 或 `Ctrl+Alt+W` 打开快捷菜单。

| 命令 | 用途 |
| --- | --- |
| `poke` | 本地戳戳互动，不发送消息 |
| `on` / `off` / `pause` / `play` | 显示和循环动画 |
| `layout editor|header` / `style umi` | 布局和唯一插画风格 |
| `size auto|small|compact|normal|large` | 角色尺寸 |
| `render auto|kitty|sixel|blocks` / `info compact|native` | 图像与信息布局 |
| `locale on|off|status` | 已知 Pi 版本的中文显示兼容层 |
| `prompt on|off|status` | 下一轮精简已识别的原生文档提示 |
| `persona on|off|status` | 下一轮追加独立角色口吻 |
| `demo [all|状态|off]` / `wink` | 显示演示；与 action 的 17 个小动作不同 |

语言、中文显示、提示精简和角色口吻分别保存；切换语言不清空任务和输入。用户正文、工具输出、自定义系统提示和未知结构不会进入通用翻译替换。

## 备份卸载与恢复

脚本安装使用阶段目录和备份，保留已有 2.x 偏好；关闭 Pi 后在同一产品目录运行 `uninstall.ps1`。恢复按当前设置是否仍等于安装值判断，避免覆盖用户后续修改。包管理安装应使用相同来源的 Pi 卸载机制。不要同时保留脚本目录和包管理条目来重复加载。

## 排错与开发

先用 `/mascot` 核对状态；看不到动作时检查 `on`、`play`、`layout editor` 和窗口尺寸。图像异常时切换 `render blocks` 并在本地终端复现，记录 Pi 版本、终端、尺寸、渲染模式和最短步骤。

开发、隔离测试与素材审阅见[贡献指南](../CONTRIBUTING.md)。代码与文档为 Apache-2.0，角色图像和动画按 [ASSET_LICENSE.md](../ASSET_LICENSE.md) 保留全部权利。制作记录只解释历史审批，不代表当前待安装状态。
