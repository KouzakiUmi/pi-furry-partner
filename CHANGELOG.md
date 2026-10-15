# 更新记录

本项目采用带 `v` 前缀的发布 tag。安装可固定到某个 tag，详见 [README](README.md#安装)。

## 未发布 · Unreleased

### 简体中文

- 完整检查四套输入框风格和两套标题头像。修复旧插画、原像素风格在启动、打瞌睡、眨眼、完成、错误及戳戳表情中遗留的开眼上睫、灰色抗锯齿重影和虹膜色点，保留真实眉毛、发丝、嘴型、调色板和透明轮廓。
- 修复标题原像素版 wink 的旧上眼线，同步 native 帧和四档终端回退；其他帧与时间轴保持不变。清理角色版睡眠眼区的游离灰色痕迹。
- 闭眼检查图直接读取最终播放素材，明确区分历史对照与当前结果。增加按实际保存风格加载启动首帧、十秒等待后打盹及标题 wink 的回归检查，避免仅验证默认角色版而遗漏旧风格。

### English

- Audited all four editor styles and both header portraits. Removed leftover open-eye lashes, gray antialiasing shadows and iris pixels from legacy illustration/pixel startup, dozing, blinking, success, error and poke expressions while preserving real brows, hair, mouths, palettes and alpha.
- Fixed the pixel header wink in native frames and all four terminal fallback sizes without changing other frames or timing. Removed detached gray eye shadows from Umi's sleeping pose.
- Generate eye review images from the final animation assets and clearly label historical references. Added regression coverage for the saved style's actual startup frame, dozing after ten seconds and header winks, including legacy styles rather than only the default Umi artwork.

## 2.3.1 · 2026-10-16

### 简体中文

- 将中英文角色状态和相关通知统一为自然的第一人称口吻，覆盖输入回执、等待回复、思考、工具执行、等待用户、收尾和兜底文案；保留真实计时、模型与用量信息以及错误详情。
- 修复全屏拖选后头像出现黑条、后续输出停止的问题。Pi 的原生选区切片会复制以 BEL 结束的私有 APC 光标／假光标标记；残留标记此前让传输解析器的 `pendingEscape` 持续等待 ST，连 `END_SYNC` 和后续文本也被暂存。
- 仅剥离有限白名单中的 Pi 私有标记 `pi:c`、`pi:fc`、`pi:/fc`，保留标准 APC 的 ST 结束规则和其他终端协议。补充真实光标标记选区及任意分片写入边界回归，检查同步输出结束、Sixel 重画与后续文字恢复。
- 2.3.0 的图像 OSC 锚点去重继续负责避免条带错列；本次修复单独处理光标标记终止解析。保留原生拖选、输入、按钮、Esc 与 Enter 行为，不以拦截选择事件规避问题。验证范围为真实 Pi 1.2 / 1.3 模块与协议模型，不宣称自动完成 Windows Terminal 实机画面验收。

### English

- Made bilingual companion status lines and related notices conversational and first-person, including input receipt, waiting, thinking, tool activity, user questions and wrap-up messages. Real timing, model/usage information and error details remain explicit.
- Fixed black portrait stripes and stalled output after fullscreen text selection. Pi's native selection slices can duplicate private caret/fake-cursor APC markers terminated by BEL. Leftover markers previously kept `pendingEscape` waiting for ST, buffering `END_SYNC` and subsequent text as well.
- Strip only the finite allowlist of Pi markers `pi:c`, `pi:fc` and `pi:/fc`. Standard APC still requires ST, and other terminal protocols retain their behavior. Added regression coverage for real caret-marker selection and every split-write boundary, checking synchronized-output completion, Sixel redraw and subsequent text.
- The 2.3.0 image-OSC anchor deduplication still prevents misplaced stripes; this fix separately handles caret-marker termination. Native selection, input, controls, Escape and Enter remain available. Verification uses real Pi 1.2 / 1.3 modules and protocol models; it is not a claim of automated native Windows Terminal screen acceptance.

## 2.3.0 · 2026-10-16

### 简体中文

- `/mascot demo` 和 `/mascot demo all` 使用独立的 70.9 秒巡演时间轴，包含倾听、戳戳、7.4 秒放大镜展示、各 7.2 秒的搜索与整理，以及 12.5 秒等待后的打盹和惊醒。单动作演示保留输入倾听与戳戳；`demo off` 或新真实任务退出，不改配置、草稿、工具或模型。
- 修复全屏跨行拖选时自有 OSC 图像标记被原生选区切片复制，导致 Sixel 条带错列重画的问题：同绘制批次按行与 token 保留首个有效锚点并检查横向边界。释放拖选后继续输入、按钮、Esc、Enter 的行为已在 Pi 1.2 / 1.3 的真实鼠标路由中回归。
- 将气泡宽度与头像尺寸解耦：普通头像保持 16 × 8 格，正常终端气泡扩到 20 列并让输入框右移 4 列，宽屏可到 24 列，窄屏收紧；英文保留自然短句与两侧爪子间隔。

- 命令、默认配置、预览与中英文文档统一使用 `umi` / `umi-pixel`。旧 `wumi` / `wumi-pixel` 继续作为兼容别名；安装升级只迁移根配置中的旧风格值，其余用户字段保持原样。
- 新增默认语言 `auto`：根据语言环境、Windows UI 文化或运行时区域设置选择中文或英文；`/mascot language auto|en|zh-CN|status` 可以重新检测或保存手动选择。已有显式语言偏好继续保留。
- `prompt` 按当前语言精简已验证的 Pi 文档章节，关闭时恢复原生章节。原生身份句、工具、规则和动态上下文继续由 Pi 构造；角色口吻通过独立 `umi_persona` 章节注入，修复整串强制替换会屏蔽后续扩展更新的问题。`persona`、`prompt`、`locale` 继续独立开关，自定义系统提示词和项目规则保持原文。
- 新增 `/mascot poke` 与全屏模式点击头像：按原眼角比例绘制日系弧形挤眼，眼线中心略厚、外端收细；配合缩脸、带弧线的阻尼回弹、滞后耳抖和随机第一人称回应。像素版保护眼线连通，空闲时更活泼、工作时更轻，工具与任务计时持续运行。
- 将播放/暂停按钮改为显示当前状态的“表情：开 / 关”。关闭循环微动时，真实状态仍会切换静态表情，修复短工具动作结束后卡在旧姿态的问题；主动戳一戳仍有短暂反馈。
- 放大镜扫描使用 MiniMax-H3 从已确认的角色原画生成连续动作，再离线抠图、抽帧；头部、握爪和镜片一起左右查看，镜片经过眼睛时呈现放大效果。运行时只播放完整画帧，不再变形或叠化镜框，修复双框重影与左侧斗篷边缘失真。插画与像素版共用播放节奏，兼容旧两帧与六帧素材包。
- 搜索和整理改用同一套 MiniMax-H3 完整连续帧：72 幅画面、72 步、每圈 6580ms，保留尾尖深灰、中段浅灰、尾根白色与白毛臀部相连。甩尾、拱头、斗篷和纸页动作已经烘焙，运行时不再叠加旧局部形变，修复尾巴和身体连接处的割裂。
- 绿色亮度信号先生成独立的 16 位灰度遮罩，反相为 Alpha，再恢复前景颜色并以同一预乘采样核缩小。640px 母版与视频保留柔和透明边缘；240px 终端外沿以原调色板近似配套黑底抗锯齿，80px 保留硬像素覆盖，不改原始 21 帧、调色板或戳戳素材。
- 修改代码继续打字；空闲输入时会侧身把爪子放到耳边倾听、轻轻点头，停顿或发送后回到相应状态。
- 增加请求准备、等待首个模型输出、已收到思考内容但仍等正文的指示与秒数。关闭动画时也保留每秒一次的文字计时；收到真实内容、执行工具或结束时切换，不推测服务端排队原因。
- 明确狼种族的角色设定，增强自然语气词和拟声词；技术交流保留温柔活泼的第一人称口吻，关键事实和严格格式依然优先。
- `umi-pixel` 保留原角色造型，对嘴部等细线加入局部采样保护与轻微色彩整理，避免细笔画缩小后消失。
- GitHub 中英文主页新增呜咪角色实拍和简短介绍；仅公开裁剪、缩小并清除元数据的照片，角色与照片保留全部版权。

### English

- `/mascot demo` and `/mascot demo all` use an independent 70.9-second tour, including listening, poking, a 7.4-second magnifier stage, 7.2 seconds each for searching and compaction, and a 12.5-second wait followed by dozing and a startled wake-up. Single-state demos retain typing and poke interactions. `demo off` or a new real task exits without changing settings, drafts, tools or models.
- Fixed fullscreen selection slices copying private OSC image markers and repainting Sixel stripes in the wrong column. Each draw batch keeps the first valid anchor per row/token and checks horizontal bounds. Actual Pi 1.2 / 1.3 mouse routing verifies multi-row drag/release followed by typing, controls, Escape and Enter.
- Decoupled caption width from portrait size: the normal avatar stays 16 × 8 cells, captions use 20 cells and move the editor four cells right, with 24-cell wide-screen and compact narrow-screen layouts. English retains natural short phrases with clear paw spacing.

- Standardized commands, default preferences, previews and bilingual documentation on `umi` / `umi-pixel`. Earlier `wumi` / `wumi-pixel` values remain compatibility aliases; upgrades migrate only the root style value and retain other user fields.
- Added default `auto` language detection from locale settings, Windows UI culture or the runtime locale. Use `/mascot language auto|en|zh-CN|status` to detect again or save a manual choice; existing explicit preferences remain intact.
- `prompt` condenses the verified Pi documentation section in the resolved language; off restores the native section. Pi still builds its identity sentence, tools, rules and dynamic context. An independent `umi_persona` section replaces whole-prompt forcing, preserving downstream extension updates. `persona`, `prompt` and `locale` stay independent; custom prompts and project rules remain exact.
- Added `/mascot poke` and fullscreen portrait clicks: curved, tapered squeeze-eyes follow the original eye proportions, with protected pixel lines, a cheek scrunch, an arcing damped rebound, delayed ear twitches and random first-person replies. Idle reactions are playful; busy ones are gentler, without interrupting work or resetting tool clocks.
- Replaced Play/Pause with the current state, `Motion: On / Off`. Disabling idle motion still updates static expressions for real activity, fixing a paused short-tool pose that could latch. Explicit pokes retain their short reaction.
- Rebuilt the magnifier scan with MiniMax-H3 from the approved character artwork, then keyed and sampled it offline. The head, gripping paw and lens scan together; the eye is enlarged as the lens passes in front of it. Runtime plays complete cels without lens deformation or dissolves, fixing duplicate rims and left-side cloak distortion. Illustrated and pixel styles share the timing; older two- and six-frame packs remain compatible.
- Searching and compaction share a complete MiniMax-H3 sequence: 72 cels and 72 steps over 6580ms. The dark-gray tip, light-gray middle and white tail root remain connected to the white rump. Tail, head, cloak and paper movement is baked into the cels, replacing additional local runtime warps and repairing the disconnected-looking tail/body motion.
- Green-signal luminance now produces an independent 16-bit grayscale matte, inverted for alpha before foreground-color recovery and matched premultiplied resizing. The 640px masters and film retain soft alpha. The 240px terminal edge approximates antialiasing over the matching black background using the original palette; the 80px version keeps hard pixel coverage. Original 21-frame sheets, palettes and poke assets remain unchanged.
- Editing keeps its typing paws. Local idle typing prompts an ear-cupping, gently nodding listening pose; a pause or submission returns to the appropriate activity.
- Added request preparation, first-output waiting and thinking-before-answer indicators with elapsed seconds. A once-per-second text heartbeat remains when animation is off. Real output, tools and completion control the indicator without guessing server queue or network causes.
- Clarified Umi's wolf identity and encouraged natural interjections and playful sounds. Technical conversation keeps a gentle, lively first-person voice while facts and strict formats retain priority.
- Preserved the original `umi-pixel` character design while protecting fine mouth strokes during sampling and lightly cleaning up line colors.
- Added a costume photograph and a short Umi introduction to both GitHub READMEs. Only the cropped, downscaled, metadata-free photograph is published; character and photograph remain All Rights Reserved.

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
