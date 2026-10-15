# 更新记录

本项目采用带 `v` 前缀的发布 tag。安装可固定到某个 tag，详见 [README](README.md#安装)。

## 2.3.0 · 2026-10-16

### 简体中文

- 将气泡宽度与头像尺寸解耦：普通头像保持 16 × 8 格，正常终端气泡扩到 20 列并让输入框右移 4 列，宽屏可到 24 列，窄屏收紧；英文保留自然短句与两侧爪子间隔。

- 命令、默认配置、预览与中英文文档统一使用 `umi` / `umi-pixel`。旧 `wumi` / `wumi-pixel` 继续作为兼容别名；安装升级只迁移根配置中的旧风格值，其余用户字段保持原样。
- 新增默认语言 `auto`：根据语言环境、Windows UI 文化或运行时区域设置选择中文或英文；`/mascot language auto|en|zh-CN|status` 可以重新检测或保存手动选择。已有显式语言偏好继续保留。
- `prompt` 按当前语言精简已验证的 Pi 文档章节，关闭时恢复原生章节。原生身份句、工具、规则和动态上下文继续由 Pi 构造；角色口吻通过独立 `umi_persona` 章节注入，修复整串强制替换会屏蔽后续扩展更新的问题。`persona`、`prompt`、`locale` 继续独立开关，自定义系统提示词和项目规则保持原文。
- 新增 `/mascot poke` 与全屏模式点击头像：短暂 `>w<` 闭眼、晃动和随机第一人称回应。空闲时更活泼，工作时反应更轻，结束后回到当前动作，工具与任务计时持续运行。
- 将播放/暂停按钮改为显示当前状态的“表情：开 / 关”。关闭循环微动时，真实状态仍会切换静态表情，修复短工具动作结束后卡在旧姿态的问题；主动戳一戳仍有短暂反馈。
- 运行时举放大镜左右查看输出，与修改代码时的打字动作区分；插画版和像素版同步补齐。空闲输入时会侧身把爪子放到耳边倾听、轻轻点头，停顿或发送后回到相应状态。
- 增加请求准备、等待首个模型输出、已收到思考内容但仍等正文的指示与秒数。关闭动画时也保留每秒一次的文字计时；收到真实内容、执行工具或结束时切换，不推测服务端排队原因。
- 明确狼种族的角色设定，增强自然语气词和拟声词；技术交流保留温柔活泼的第一人称口吻，关键事实和严格格式依然优先。
- `umi-pixel` 保留原角色造型，对嘴部等细线加入局部采样保护与轻微色彩整理，避免细笔画缩小后消失。

### English

- Decoupled caption width from portrait size: the normal avatar stays 16 × 8 cells, captions use 20 cells and move the editor four cells right, with 24-cell wide-screen and compact narrow-screen layouts. English retains natural short phrases with clear paw spacing.

- Standardized commands, default preferences, previews and bilingual documentation on `umi` / `umi-pixel`. Earlier `wumi` / `wumi-pixel` values remain compatibility aliases; upgrades migrate only the root style value and retain other user fields.
- Added default `auto` language detection from locale settings, Windows UI culture or the runtime locale. Use `/mascot language auto|en|zh-CN|status` to detect again or save a manual choice; existing explicit preferences remain intact.
- `prompt` condenses the verified Pi documentation section in the resolved language; off restores the native section. Pi still builds its identity sentence, tools, rules and dynamic context. An independent `umi_persona` section replaces whole-prompt forcing, preserving downstream extension updates. `persona`, `prompt` and `locale` stay independent; custom prompts and project rules remain exact.
- Added `/mascot poke` and fullscreen portrait clicks: a brief `>w<` face, a wiggle and a random first-person reply. Idle responses are playful; busy responses are gentler. Umi returns to the current activity without interrupting work or resetting tool clocks.
- Replaced Play/Pause with the current state, `Motion: On / Off`. Disabling idle motion still updates static expressions for real activity, fixing a paused short-tool pose that could latch. Explicit pokes retain their short reaction.
- Running now raises a magnifier and scans the output, distinct from editing's typing paws, in illustrated and pixel styles. Local idle typing prompts an ear-cupping, gently nodding listening pose; a pause or submission returns to the appropriate activity.
- Added request preparation, first-output waiting and thinking-before-answer indicators with elapsed seconds. A once-per-second text heartbeat remains when animation is off. Real output, tools and completion control the indicator without guessing server queue or network causes.
- Clarified Umi's wolf identity and encouraged natural interjections and playful sounds. Technical conversation keeps a gentle, lively first-person voice while facts and strict formats retain priority.
- Preserved the original `umi-pixel` character design while protecting fine mouth strokes during sampling and lightly cleaning up line colors.

## 2.2.0 · 2026-10-16

### 简体中文

- 重新制作干净的 xx 眼吃瘪表情，修复原眼线残留与补白痕迹；搜索披风贴合俯身透视，保留尾巴配色。
- 眼口共用修复底图；说话统一上唇锚点、相邻开合和停顿，眨眼保留当前嘴型。惊醒增加短促左右抖动并衰减回中。
- 输入框补齐左右竖边和四角，同步预留内容宽度、光标、补全和鼠标命中位置。

- GitHub 主页的中文与英文版本采用一致的视觉层级，顶部提供清晰的语言入口；补充英文使用指南。
- 新增 `/mascot language en|zh-CN|status`，保存语言偏好。角色短句、气泡、输入区控件、快捷操作与详情面板随语言切换，保留当前任务、输入草稿和动作节奏。
- `locale`、`prompt`、`persona` 继续独立。英文模式使用原生英文界面和默认系统提示词；切回中文时按原偏好应用中文兼容层。角色口吻按语言选用单独的中文或英文模板，下一轮生效。
- 缺少语言字段的已有配置默认使用 `zh-CN`；自定义名字、副标题、代码、工具输出和项目指令保持原文。

### English

- Replaced pasted-over xx eyes with a clean reaction master and repaired the searching cloak perspective while keeping the tail colors.
- Reused clean face textures, anchored speech to one upper lip, added neighboring mouth shapes and pauses, and kept the active mouth during blinks. Waking from a doze now includes a short, decaying side-to-side shiver.
- Closed the editor frame with side rails and corners, with matching content width, cursor, completion and mouse coordinates.

- Matched the Chinese and English GitHub homepages, added prominent language navigation, and added an English user guide.
- Added `/mascot language en|zh-CN|status` with a saved preference. Companion copy, bubbles, editor controls, quick actions and detail panels switch language while preserving the task, input draft and animation timing.
- Kept `locale`, `prompt` and `persona` independent. English mode uses Pi's native English UI and default prompt; returning to Chinese restores the previous patch preference. Separate persona templates follow the chosen language on the next request.
- Existing configurations without a language field default to `zh-CN`. Custom names, subtitles, code, tool output and project instructions retain their original text.

## 2.1.1 · 2026-10-16

- 将角色英文名统一更正为 **Umi**，中文名“呜咪”保持不变。
- 更新 README、完整指南、许可中的英文称呼与可选展示页，并将安装示例指向 `v2.1.1`。
- 为兼容已有配置，`wumi`、`wumi-pixel` 风格 ID、提示词文件名及素材路径继续保留。此次名称修正不改变动画、状态切换或工作行为。

## 2.1.0 · 2026-10-16

首次以 **pi-furry-partner** 名称公开发布。角色名字仍是“呜咪 · Umi”，既有 `/mascot` 命令继续使用。

### 发布与迁移

- 包名、扩展目录和公开文档统一为 `pi-furry-partner`；配套主题命名为 `pi-furry-night`。
- 增加旧名 `pi-wink-companion` 自动目录的迁移、备份与归档，避免新旧扩展重复加载。
- 保留 2.x `config.json`、用户已选界面模式，以及首次安装前的恢复记录；首次缺少界面模式时使用 `fullscreen`。
- 以 GitHub README 作为精心排版的仓库主页，提供中英文介绍、完整中文指南、架构与贡献文档；额外保留可选静态展示页源码，暂不单独发布网站。
- 代码与文档采用 Apache-2.0，呜咪角色与视觉素材保留全部版权并单独说明。

### 输入区搭档

- 完整设定的插画风呜咪与 80 × 80、48 色像素风；保留早期头像风格及标题布局。
- 根据真实事件响应思考、文本输出、阅读、修改、运行、搜索、等待、成功、失败、取消和上下文整理。
- 加入托下巴、双爪打字、埋进资料堆、尾巴波浪、挥爪 wink 与 xx 眼吃瘪动作，配合眨眼、呼吸、微晃和耳抖。
- 说话使用 `w / — / o / O` 四种嘴型；无新文本时恢复闭嘴。
- 约 5 秒睡醒过程，等用户时歪头问号，等待 10 秒后打盹，恢复活动时约 650ms 惊醒。
- 短修改与运行姿态至少保留约 1.2 秒，退出打字到思考另设缓冲，降低快速工具切换的干扰。
- 固定输入区布局、三行居中爪爪气泡和第一人称口语短句；工作状态整合到输入框顶边。

### 操作与信息

- 按实时 TUI 模式切换 `fullscreen` 可点击控件与 `regular` 快捷键提示，支持读取当前原生键位。
- `Ctrl+Alt+W` / `/mascot menu` 提供 11 项快捷操作，使用 Pi 原生模型、思考和会话处理流程。
- 增加只读用量与工具详情面板，紧凑 footer 使用真实上下文、token、缓存和费用来源。
- 对弹窗遮挡、模式切换、滚动历史、Sixel 图像条带与扩展释放增加验证。

### 中文与可选口吻

- 为 Pi 1.2.0 已知的原生固定界面文案与 24 个内置命令补全说明提供中文兼容层；设置主列表支持搜索中文标签与说明。
- 精确识别 Pi 默认系统提示词的固定段落并改写成简洁中文，保留项目、自定义与动态内容。
- `locale`、`prompt`、`persona` 三个开关独立；角色口吻默认关闭，不与默认提示词中文精简合并。
- 未识别的 Pi 版本或结构保留原文，兼容层不改写 Pi 安装文件。

### 开发验证

- 分层检查事件状态、视觉节奏、素材、输入区布局、鼠标、Sixel、补全、原生中文组件和系统提示词保留边界。
- PowerShell 5.1 / 7 隔离安装与恢复验证；真实 Pi / Windows ConPTY 启动与数据流检查。
- 提供便携测试运行时查找与 `PI_TEST_MODULES` 覆盖，不依赖特定个人启动器布局。

## 2.0 及更早版本

此前以 `pi-wink-companion` 名称进行本地迭代，逐步从启动标题头像扩展为输入框旁的状态搭档。本次发布统一公开命名与文档；这些版本未在本仓库补造独立发布 tag。
