# 参与开发 · Contributing

欢迎报告问题、改进文案、修复终端兼容问题，或增加清楚且容易维护的功能。提交问题前可以先看[使用指南与常见问题](docs/guide.zh-CN.md#常见问题)。中文和英文反馈都可以。

## 先了解项目边界

- 项目名是 `pi-furry-partner`，发布主题是 `pi-furry-night`；`/mascot` 命令保留兼容。
- 当前实际验证目标是 Windows、Pi **1.2.0**、PowerShell 5.1 / 7。其他平台的改进欢迎提交，请附上实际验证环境。
- Pi 1.2.0 的完整测试通过；Pi 1.3 另通过实际编辑器集成、活动、倾听、响应计时、Sixel 与鼠标回归。1.3 的完整运行会在显式 1.2.0 提示词 fixture 处停止，不能写成“1.3 全套通过”。原生中文与文档提示精简仍严格守卫 1.2.0；CI 当前也固定安装 1.2.0。
- 角色显示、界面中文、Pi 文档提示精简、角色口吻分别控制；`language` 支持默认的 `auto` 系统语言检测，也可明确选择简体中文或英文。功能修改应保留这些偏好的独立性，切换语言不应重置任务、草稿或中文补丁开关。
- 原生界面兼容层不修改 Pi 安装文件；未知版本或结构应回退原行为。用户正文、工具输出、路径和内部保存值不进入普通翻译表。
- 代码和文档是 Apache-2.0；呜咪角色及相关图像、动画是保留全部权利的素材。具体范围见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。提交通用渲染代码不代表取得角色素材的再利用许可。

## 远程发布

更新 `package.json`、下载链接及 `CHANGELOG.md` 后，将匹配版本的 `v` 前缀 tag 推送到 GitHub（例如 `v2.3.3`）。`Build and publish release` 工作流复用完整验证流程，通过后从该提交的 Git 跟踪文件生成 ZIP 和 SHA-256 校验文件，再发布为最新 GitHub Release。版本 tag 必须与包版本一致，更新记录必须包含对应版本章节；构建不会包含本地 `work/` 或用户配置。

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

Sixel 回归需要覆盖 Pi 的真实选区绘制，而不只模拟按钮命中：跨多行输入发送 SGR press / drag / release，检查同批次每个角色条带只在原头像列出现，随后继续输入、点按钮、Esc、Enter。选区切片可能复制零宽 OSC 标记；传输层必须按同批次的 `(row, token)` 去重，保留首个有效锚点并检查图像横向范围。不要通过吞掉原生拖选事件来掩盖重画问题。

选区回归必须带真实的 `CURSOR_MARKER`。Pi 的私有 `ESC _pi:c BEL`、`ESC _pi:fc BEL`、`ESC _pi:/fc BEL` 也可能被复制；宿主只移除首个硬件光标标记，剩余标记不能让流式解析器一直等待标准 APC 的 ST 结束符。传输层仅剥离这三种有限白名单标记，按每个字节边界拆分写入检查，并验证 `END_SYNC`、图像输出及随后输入的文字均能通过。标准 APC、OSC、DCS 等协议的终止规则保持原样；不要把图像 OSC 去重视为已覆盖所有拖选冻结原因。这些是协议模型与真实 Pi 模块回归，不能写成 Windows Terminal 实机画面自动验收通过。

`preview.html` 是本地效果演示，可以直接在浏览器打开；它不控制实际 Pi 会话。需要查看真实加载行为时，在单独的测试用 Pi 配置中加载当前源码，避免把包管理来源和手动复制目录叠加。运行截图、窗口尺寸、终端版本与界面模式应一并记录。

正式展示图由生产动画代码离线导出，另需带 Pillow 和 numpy 的 Python：

```powershell
node .\scripts\build_motion_preview.mjs
```

动画与素材的重建脚本可能覆盖导出文件。只修改文案或安装逻辑时，无需重新生成整套图片。代码不需要新增 API Key；重新生成 AI 绘制原稿则是独立的美术工作，不属于运行插件的必要步骤。

## 角色视频与透明边缘

正式连续动作以已审核的 MiniMax-H3 片段为离线来源，运行时只读取预计算的完整索引帧，不调用生成服务、解码 MP4 或依赖 Python。放大镜的来源视频、提示词、来源记录和最终时序分别在 `assets/poses/watch-h3-source.mp4`、`watch-h3-prompt.txt`、`watch-h3-provenance.json` 和 `watch-video-metadata.json`；旧六张原画仍保留作参考。来源记录应包含模型、哈希、实际帧率、帧数和时长，不提交密钥、签名 URL、账号或生成任务标识。

搜索与整理共用 `search-h3-source.mp4`，对应的提示词、来源记录和时序在同目录的 `search-h3-prompt.txt`、`search-h3-provenance.json` 与 `search-video-metadata.json`。正式素材为 72 幅画面、72 个步骤，6580ms 一圈；`scripts/build_search_video.py` 从已审核的相同灰度遮罩／Alpha 流程导出 240px 与 80px 索引帧，`lib/search.mjs` 负责验证和加载。旧搜索地标只保留作兼容，不在视频素材上叠加形变。

背景处理按“绿色亮度 → 独立灰度遮罩 → 反相 Alpha → 恢复前景”执行。为避免白毛被当作背景，绿色信号使用 `max(0, G - max(R, B))`，相对边框估计的背景绿色信号归一化为背景 matte；前景 `Alpha = 1 - matte`。恢复 straight RGB 后，将预乘 RGB 与 Alpha 用同一 Lanczos 核做整画布缩放，再还原 straight RGB。不要把灰度遮罩当作角色亮度，也不要用删绿通道、侵蚀轮廓或硬切 Alpha 来替代这条流程。

独立背景 matte 与前景 Alpha 以 16 位 PNG 保存；640px RGBA 母版与影片侧车保留 8 位分数 Alpha。768 → 640 只用统一全画布缩放，不逐帧裁剪、fit 或自动居中。放大镜正式素材包含 64 个源视频画面与 1 个局部闭眼画面，66 个时序步骤合计 6580ms；原始 generic QC 的 WARN 与人工验收理由保留在元数据中，不把主观接受改写成程序 PASS。

终端索引帧没有独立的连续 Alpha 通道：240px 版仅在与外部透明区域连通的边缘，把分数覆盖度合成到配套黑底，再映射回原 palette；不改不透明内部。80px 版保留硬像素覆盖与既有风格。该终端近似不回写母版或影片 Alpha，也不新增 palette 颜色。正式视频动作的尾巴、头部、纸页与镜片运动已经烘焙进完整帧，运行时不得叠加旧局部 warp、光流或帧间 dissolve。

重建需要 Pillow、NumPy、ffmpeg，以及已审核的选择 manifest 和对应对照 PNG；完整 640px 工作帧不随仓库重复发布。以下以已准备的 `work/watch-review/selection.json` 为例，帧序号必须从 0 开始，manifest 中的 `sourceFrame`、相对文件名、时长和哈希必须对应真实输入：

```powershell
New-Item -ItemType Directory -Force work/watch-raw | Out-Null
ffmpeg -hide_banner -loglevel error -i assets/poses/watch-h3-source.mp4 -map 0:v:0 -an -fps_mode passthrough -start_number 0 work/watch-raw/watch_%05d.png
python scripts/build_watch_matte.py --selection work/watch-review/selection.json --raw-frames work/watch-raw --out work/watch-matte
python scripts/build_watch_video.py --manifest work/watch-matte/manifest.json --stage work/watch-stage --terminal-aa-background 000000
```

先检查 staged 帧、matte、深浅背景与实际播放，再决定是否使用 `--apply` 写回正式资产；普通代码和文案修改不需要执行这些构建。不得改写原始 21 帧反应表、调色板或戳戳补丁来容纳新动作。完整母版遵循固定 canvas 与相同锚点；不通过倒放、叠化或扭曲来修补坏帧。源码的画面计数和播放步骤数分开验证，严格递增的来源帧序号、真实总时长、最短帧时长、首尾轮廓和眨眼眼区以外像素均需核对。

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

不要附上 API Key、认证码、完整会话或含私人路径的未经清理日志。可以用 `/mascot demo` 看完整 70.9 秒巡演，或用 `/mascot demo <状态>` 重现单一视觉问题，避免为了截图向模型发送请求。完整巡演不改草稿、配置或真实工具状态；`demo off` 或新的真实任务会退出。

## 提交改动

1. 让一个修改围绕一个明确问题，并在说明里写清触发条件与修改后的行为。
2. 改动状态节奏、鼠标或布局时，补充能体现行为边界的检查；简单文案修正无需镜像实现的测试。
3. 保留原生输入、补全、IME、快捷键和选择行为；不要直接向终端写入未经 Pi 布局管理的动画。
4. 修改中文兼容层时，用实际 Pi 组件验证显示和保存值，覆盖关闭、卸载、未知版本及动态内容不变的情况。
5. 修改提示词时，验证自定义 `SYSTEM.md`、`AGENTS.md`、技能、工具规则和动态上下文，保留 persona 的独立开关。中英文模式分别验证：只通过结构化 `docs` 章节精简文档提示，身份、工具与规则保持原生并支持后续动态扩展；关闭时撤掉该章节替换。角色口吻使用自己的开关、独立 `umi_persona` 章节及对应语言模板，不返回整串强制系统提示词。
6. 运行与改动相关的检查，并在提交说明里写明实际通过的环境与尚未验证的部分。

新增第三方依赖或素材应注明来源与许可。角色资产的授权不能通过代码许可推定。

## 代码入口

状态与渲染模块的职责见 [架构说明](docs/architecture.md)。主要用户命令位于 `index.ts`；状态口语文案与对应英文资源位于 `assets/`，中英文角色口吻模板及供离线格式化使用的前言位于 `prompts/`。同时更新 [中文 README](README.md)、[English README](README.en.md) 与两份使用指南，避免安装、语言和独立开关的说明出现差异。
