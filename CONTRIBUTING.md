# 参与开发 · Contributing

欢迎报告问题、改进文案、修复终端兼容问题，或增加清楚且容易维护的功能。提交问题前可以先看[使用指南与常见问题](docs/guide.zh-CN.md#常见问题)。中文和英文反馈都可以。

## 先了解项目边界

- 项目名是 `pi-furry-partner`，发布主题是 `pi-furry-night`；`/mascot` 命令保留兼容。
- 当前实际验证目标是 Windows、Pi **1.2.0**、PowerShell 5.1 / 7。其他平台的改进欢迎提交，请附上实际验证环境。
- 角色显示、界面中文、默认提示词中文精简、角色口吻分别控制。功能修改应保留这些开关的独立性。
- 原生界面兼容层不修改 Pi 安装文件；未知版本或结构应回退原行为。用户正文、工具输出、路径和内部保存值不进入普通翻译表。
- 代码和文档是 Apache-2.0；呜咪角色及相关图像、动画是保留全部权利的素材。具体范围见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。提交通用渲染代码不代表取得角色素材的再利用许可。

## 本地环境

需要 Git 和 Node.js。完整测试使用 Pi 1.2.0 的真实模块，Node 版本也需要满足 Pi 的要求（该版本要求 Node **22.19.0 或以上**）。PowerShell 安装测试在 Windows 下运行。

```sh
git clone https://github.com/KouzakiUmi/pi-furry-partner.git
cd pi-furry-partner
npm install --no-save --package-lock=false @earendil-works/pi-coding-agent@1.2.0 @earendil-works/pi-tui@1.2.0
npm test
```

测试模块查找顺序为：显式 `PI_TEST_MODULES`、项目的 `node_modules`、受管理 Pi 安装、Pi 用户级 npm 目录。已有兼容模块时无需再安装一份；也可以显式指定模块目录。

```powershell
$env:PI_TEST_MODULES = 'D:\Dev\pi-runtime\node_modules'
npm test
```

`PI_TEST_MODULES` 指向同时包含 `@earendil-works/pi-coding-agent` 与 `@earendil-works/pi-tui` 的 **node_modules 目录**。不要指向某个包的 `dist`。指定目录后不要求个人目录中存在特定启动器或版本记录。

## 检查与预览

在项目根目录运行：

```powershell
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\installer.ps1 -WorkDir '.\work\installer-tests'
```

第一条运行状态、素材、布局、渲染、鼠标、原生组件、补全和提示词边界检查。安装测试使用临时 `AgentDir`，验证备份、旧版迁移、配置保留和卸载恢复；不针对真实的 `~/.pi` 进行安装。测试报告会由测试脚本重新生成，不要将个人路径、认证信息或会话日志提交到仓库。

`preview.html` 是本地效果演示，可以直接在浏览器打开；它不控制实际 Pi 会话。需要查看真实加载行为时，在单独的测试用 Pi 配置中加载当前源码，避免把包管理来源和手动复制目录叠加。运行截图、窗口尺寸、终端版本与界面模式应一并记录。

正式展示图由生产动画代码离线导出，另需带 Pillow 和 numpy 的 Python：

```powershell
node .\scripts\build_motion_preview.mjs
```

动画与素材的重建脚本可能覆盖导出文件。只修改文案或安装逻辑时，无需重新生成整套图片。代码不需要新增 API Key；重新生成 AI 绘制原稿则是独立的美术工作，不属于运行插件的必要步骤。

## 可选展示页

项目的主要展示入口是 [GitHub 仓库 README](https://github.com/KouzakiUmi/pi-furry-partner#readme)。`site/` 中另外保留一份独立静态展示页，尚未作为网站发布；运行插件不需要构建它，也不会在普通代码推送时自动上线。

展示页使用生产环境同款状态与动画模块，在浏览器中演示姿态、两种风格和独立开关；演示控件不改变真实 Pi 配置。构建和静态检查无需第三方前端依赖：

```sh
npm run build:site
npm run test:site
```

构建结果在 `dist/`。用任意本地静态 HTTP 服务打开该目录；若已安装 Python，可执行：

```sh
python -m http.server 8000 --directory dist
```

然后访问 `http://127.0.0.1:8000/`。这里通过 HTTP 加载本地动画数据，不建议直接双击 `dist/index.html`。保留的 Pages 工作流只供以后明确需要独立网站时手动使用；当前发布不启用它。

## 提交问题

描述实际操作、期望结果和观察到的结果，并尽量附上：

- Pi、操作系统、终端与 PowerShell 版本。
- `regular` / `fullscreen` 模式、窗口行列数、Sixel / blocks 渲染方式。
- 使用的安装路线、扩展版本、是否还保留旧名插件或其它自定义编辑器。
- 可复现的最短步骤，以及已去除私人内容的截图或错误信息。

不要附上 API Key、认证码、完整会话或含私人路径的未经清理日志。可以用 `/mascot demo <状态>` 重现纯视觉问题，避免为了截图向模型发送请求。

## 提交改动

1. 让一个修改围绕一个明确问题，并在说明里写清触发条件与修改后的行为。
2. 改动状态节奏、鼠标或布局时，补充能体现行为边界的检查；简单文案修正无需镜像实现的测试。
3. 保留原生输入、补全、IME、快捷键和选择行为；不要直接向终端写入未经 Pi 布局管理的动画。
4. 修改中文兼容层时，用实际 Pi 组件验证显示和保存值，覆盖关闭、卸载、未知版本及动态内容不变的情况。
5. 修改提示词时，验证自定义 `SYSTEM.md`、`AGENTS.md`、技能、工具规则和动态上下文，保留 persona 的独立开关。
6. 运行与改动相关的检查，并在提交说明里写明实际通过的环境与尚未验证的部分。

新增第三方依赖或素材应注明来源与许可。角色资产的授权不能通过代码许可推定。

## 代码入口

状态与渲染模块的职责见 [架构说明](docs/architecture.md)。主要用户命令位于 `index.ts`；口语文案位于 `assets/status-copy.json` 与 `assets/status-phrases.json`；两个独立提示词模板位于 `prompts/`。
