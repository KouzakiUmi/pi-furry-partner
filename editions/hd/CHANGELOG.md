# 更新记录

本文件记录 HD 源码历史，不代表每节都有可下载 Release。当前源码为 2.5.1-preview.6，尚未创建新的独立 HD Release；同一 main 的根目录原资源版已发布 v2.5.1。HD 后续使用 hd-v 标签且 latest=false，当前安装见 [HD 指南](docs/guide.zh-CN.md)。旧版章节中的分支与双平台包描述属于历史。

## 2.5.1-preview.6 · 未发布

### 简体中文

- 统一用户通过的29段动作配色，保留自然阴影、透明度、原生时序、画布和支点。喜欢使用单独复核后的围巾提亮、减饱和与轻微衣料校偏，不改原动作、三颗爱心或单层下摆。
- 开场复用完整挥爪招呼；戳一戳按闲时、忙碌和等待情境选择已通过的轻弹、抖耳或晃脑袋，避免连续重复。连点不重置或排队，真实任务与回答能及时接管。
- 互动从真实首帧可见后计时；暂停自动动画时，主动戳一戳仍可播放一次，结束后恢复静止。继续使用单个计时器与有界缓存。
- 高清与Pi索引素材从同一批已批准候选派生，保留原采样和共同调色板；冻结旧29源供历史原像素验证，源档不进入Pi或DSH安装包。
- 保留preview.5的错误反应、连续工具接续、2秒状态等待和动作最短可见时长。本目录只构建 Pi HD，DSH 在独立仓库维护；HD 仅含插画，原像素位于根目录原资源版。

### English

- Unify the reviewed29 motion colors while retaining native lighting, alpha, geometry, anchors and timing. Affection uses its separately approved scarf/material correction, preserving the original acting, hearts and cape.
- Reuse the accepted wave for startup and vary native poke responses by idle, busy or waiting context. Repeated clicks do not restart or queue a reaction, and real task updates can interrupt it.
- Start finite interactions at actual presentation. Explicit pokes can play once while automatic animation is paused, then return to a static state with the existing single timer.
- Derive both host resources from the same approved candidates and common indexed palette. Retain a source-only pre-color bank for historical pixel checks without including it in either installer.

## 2.5.1-preview.5 · 未发布

### 简体中文

- 修复 Pi 与 DSH 单次工具失败不触发错误表情；识别显式工具失败、命令工具结构化非零退出码，以及 DSH 官方命令输出的严格末尾退出状态，不扫描一般正文关键词。
- 失败表情立即显示1800ms，保留真实忙碌状态、工具数量与后续工具更新；一次命令失败不冒充整轮失败。回答、等待用户、取消等状态可立即接管，重复或未知结果不延长表情。
- 暂停动画时仍显示并自动结束短暂失败表情，继续复用单个计时器。保留preview.4的2秒工具间等待、连续同动作接续与原有可见驻留。
- 加入用户最终通过的蹭蹭眯眼循环：107帧高清／54帧Pi，固定640世界构图与原生时序。原有28段画面与节奏保留，共29段；新配色试点仍待方向评审，不混入本包。

### English

- Show a finite1800ms failure expression for genuine tool errors and nonzero shell exits on both hosts, including DSH's official trailing exit-status format.
- Preserve live task/tool facts, urgent interruptions and deduplication. Paused playback still clears the expression using the existing single timer.
- Retain continuous same-action playback and the bounded next-state gap. Add the user-approved107-frame nuzzle loop with54 native-time Pi samples, preserving the prior28 clips. Color-consistency samples remain review-only.

## 2.5.1-preview.4 · 未发布

### 简体中文

- Pi 与 DSH 在最后一个工具完成后保留当前动作，等待真正的下一状态，最多2秒；工具数量立即归零，业务状态保持准确，不把显示保留冒充工具仍在执行。
- 连续读取、连续编辑和使用相同动画的连续工具沿用原播放时钟；键盘保留在打字循环，不重复拿出／收起，也不从首帧重播。
- 消息／步骤开始、空分块与正常消息结束属于占位，不取消或延长等待；非空思考／回答、新工具、用户等待和终止按真实事件接管。超时后忙碌会话回到思考，整轮完成仍按原规则处理。
- 2秒业务截止时间独立于暂停／隐藏的动画时钟，不新增常驻计时器；继续保留1200ms可见驻留、加载上限和紧急打断。28段已批准素材与用户配置保持不变。

### English

- Both hosts retain the last tool animation for up to2 seconds while waiting for an actual next state, without changing completed-tool counts or task facts.
- Consecutive calls mapped to the same animation continue its playback clock. Typing keeps its loop instead of repeatedly entering or exiting the keyboard sequence.
- Placeholder lifecycle events cannot cancel or renew the gap. Real content, tools, interactions and terminal events take over normally; the bounded handoff uses wall time even while frames are paused.

## 2.5.1-preview.3 · 未发布

### 简体中文

- 修复 DSH 新会话接口：前台会话绑定、事件窗口通知、真实流式事件及工具完成的 `toolCallId`；历史加载不回放旧任务，切会话释放旧监听。
- Pi 与 DSH 统一动作最短可见时长：普通动作至少展示1200ms，首帧真正可见后起算；短编辑完整进入400ms、敲键盘至少800ms、退出400ms，真实工具状态立即结束。
- 只跟进最新待切状态，避免积压过期动作；回答、错误、等待用户和主动互动可立即抢占。加载失败的视觉等待有上限。
- Pi 在工具事件到达时保留动作候选，避免同一刷新间隔内开始、结束的编辑只剩抬手。暂停回退保持阅读用放大镜、执行和编辑用键盘。
- 三条待机保持完整4458ms原生周期，高清107帧与Pi54帧均到达原生末帧后再随机轮换，不因普通动作驻留逻辑缩短或冻结。
- 继续使用已批准的28段素材；蹭蹭试片尚待源表演评审，不进入本包。新增两端实际集成与真实素材时序回归。

### English

- Follow current DSH foreground Session bindings, observable event windows, stream events and real tool-result IDs without replaying idle history.
- Keep activity facts live while both hosts give ordinary actions1200ms of actual visible presentation. Short work completes its400ms entry,800ms typing and400ms exit; stale targets do not form a queue.
- Capture Pi tool starts before batched paint, preserve urgent interruptions and bounded loading, and keep all three native4458ms idle cycles intact.
- Retain the28 approved motion clips. The pending nuzzle source is excluded.

## 2.5.1-preview.2 · 未发布

### 简体中文

- 修复大画布索引显示：Pi利用固定横向余量保持头身尺度和双爪完整，DSH高清与索引回退遵循同一paintRect；原23条画面保持。
- 主线 Pi 与 DSH 仅提供高清插画；像素选择、像素标题、像素启动 seed 和像素运行资源退出主线分发，仅由 Legacy 保留。
- 历史像素风格输入和配置迁移到 `umi`，旧标题配置迁移为 `illustration`。安装器只修改对应顶层值，保留其余配置、格式与原始备份。
- 修正阅读与执行的动作对应：阅读用放大镜，执行／编辑用键盘。同步修复暂停、加载回退和阅读打断键盘转场的情况。
- 恢复两端完整 H3 点头：保持107帧高清／54帧Pi原时间抽样，手动与自动触发均播完4458ms后回到待机，原19条影片的画面与QA不变。新增经用户确认的完整挥爪动作，加入已批准的完整伸懒腰，保留896画布与世界锚点；新增用户认可的前倾微歪头探看，保持双爪原位、640世界尺度与原生时间。加入已认可的晃脑袋、收敛后的抖耳和双爪贴地的开心小弹；小弹保持107帧高清／54帧Pi原时间及完整896世界尺度。蹭蹭仍在接触姿势设计评审，不混入正式资源。
- 增加经评审待机片的完整周期随机轮换与下一片预取，不连续重复、不逐帧重抽、不变速或缩放。用户已通过正面放松与向右留意两条新待机，和原左看组成三片轮换；不把随机逻辑测试当作素材验收。

### English

- Render registered extended indexed frames at the original character scale in Pi; DSH indexed fallback follows the same paintRect as HD. Preserve the prior23 clip artwork.
- Main Pi and DSH builds now provide HD illustration only. Pixel selectors, headers, startup seeds and runtime artwork remain exclusive to Legacy.
- Migrate historical pixel inputs/settings to `umi` and old header settings to `illustration`. Preserve unrelated preference bytes and the original installer backup.
- Route reading to the magnifier and execution/editing to the keyboard, including pause/loading fallbacks and direct reading preemption of keyboard cleanup.
- Restore approved H3 nod playback on both hosts:107 HD frames/54 native-time Pi samples, complete4458ms manual and automatic playback, and unchanged visual payloads/QA for the original nineteen clips. Add the user-approved complete wave clip; Add the approved full stretch with its896 canvas and fixed world anchor, plus the user-approved forward-leaning curious peek with planted paws, fixed640 world scale and native timing; The approved head sway, restrained ear reaction and grounded happy bounce are included; bounce retains107 HD frames/54 native-time Pi samples and its full896 world. Nuzzle remains at the contact-pose design review gate and is not included in runtime artwork.
- Add review-gated whole-cycle random idle selection and next-clip prefetch without immediate repetition, per-frame rerolls, retiming or scaling. The approved center and right idle clips join the original left glance as a three-clip pool; fixture tests do not approve artwork.

## 2.5.1-preview.1 · 2026-10-23

### 简体中文

- 发布全动态动作打磨预览：19段主动作采用12条新片与7条已认可原片，保持原速、完整动作周期与已批准的键盘进出场组合。
- 等待与倾听恢复眼星等实心脸内的误透明；等待保留独立静止问号。保持640世界锚点与各动作paintRect，不按每帧透明边界缩放。
- Pi按真实帧时间调度，DSH按高清帧边界调度，增加有界预取、延迟回退及恢复；修复小数毫秒循环边界偶尔选到前一帧的问题。
- DSH附件改为dsh-furry-partner-前缀，Pi使用pi-furry-partner-前缀；内部插件标识与配置兼容。Legacy使用独立legacy-v2.4.x标签与明确标题，不占用Latest。
- 原始像素、标题、独立说话口型与保留动作保持。八项旧辅助手势尚无新的连续素材，继续保留既有回退。
- 两端完整自动化回归、来源/像素校验、真实归档逐项回读与解包读取器验证通过；本版本按预发布提供，实际宿主安装观感与性能仍需验证。

### English

- Preview the motion polish using twelve newly approved clips and seven retained clips across nineteen main actions, preserving native timing and the accepted keyboard chain.
- Restore opaque face details in waiting/listening and keep the waiting question mark stationary. Preserve the640px world, anchors and per-clip paint rectangles without per-frame fitting.
- Schedule Pi and DSH at authored frame deadlines with bounded HD lookahead, delayed-frame fallback and recovery. Fix fractional loop boundaries selecting the previous frame.
- Name DSH downloads with dsh-furry-partner- and Pi downloads with pi-furry-partner-. Keep plugin identity/configuration compatible. Legacy uses a separate legacy-v2.4.x tag line and never becomes Latest.
- Preserve original pixel artwork, titles, independent speech mouths and retained actions. Eight auxiliary legacy gestures still use their existing fallback.
- Both host suites, source/pixel checks, archive entry readback and unpacked production readers passed. This is a prerelease; installed-host visual/performance validation remains pending.

## 2.5.0 · 2026-10-23

### 简体中文

- 全动态版正式发布为 v2.5.0：main 源码默认启用完整插画动作，提供 Pi 精简包与 DSH 完整高清包。legacy 分支独立维护 v2.4.1，只优化代码并保留 v2.4.0 全部原资源；main 不再发行高清重制产品线。
- 沿用 preview.6 已验收的 17 段角色动作与两段键盘过渡，动作和资源文件保持不变；后续动作与性能优化在正式发布后另行处理。
- 保留 v2.4.0 原始 100px 像素素材、原简单帧与全部旧风格输入别名；公开风格补全只列出插画与像素两项。
- 纳入 `/mascot` 子命令与参数的分层补全，支持大小写无关的前缀与中英文说明；Pi 1.3.0 提示词回归按显式支持集合核验，未知版本继续拒绝改写。
- 构建配置、源码默认与包版本统一；构建器按配置识别 edition 并严格核对默认声明。发行 tag 精确对应全动态包，旧 v2.4.5 与 v2.5.0-preview.6 tag 保留历史。
- 已安装 preview.6 的用户需使用 v2.5.0 对应平台包更新并重启宿主；Pi 更新保留已有 2.x 配置与备份恢复基线。

### English

- Release the full-animation edition as v2.5.0. Main enables complete illustration motion by default and provides Pi-core and DSH full-art packages. Legacy v2.4.1 is maintained on its own branch with code improvements and all original v2.4.0 artwork; main no longer ships the HD-remaster line.
- Retain the 17 approved character clips and two keyboard transitions from preview.6. Motion and resource files are unchanged; further motion and performance work follows this release.
- Preserve original 100px pixel artwork, simple frames and historical style aliases. Public style completion lists only illustration and pixel.
- Include hierarchical `/mascot` command and argument completion, case-insensitive prefixes and localized descriptions. Pi 1.3.0 prompt tests use the explicit support allowlist; unknown versions still fail closed.
- Align build configuration, source defaults and package versions. The builder resolves configured editions and verifies the default declaration; release tags select the exact platform packages. Historical v2.4.5 and v2.5.0-preview.6 tags are retained.
- Upgrade an installed preview.6 using the v2.5.0 platform package and restart the host. Pi updates preserve existing 2.x preferences and the backup/recovery baseline.

## 未发布

### 简体中文

- 原生中文界面、Pi 文档提示精简与内置命令补全翻译把 Pi 1.3.0 纳入已验证支持范围；Pi 1.2.0 行为不变，其他版本仍保留 Pi 原生行为。
- 补上 Pi 1.3.0 改写的 `/share` 英文说明（Radius 制品或 GitHub 秘密 Gist），命令名、参数提示与补全结果保持不变。
- 为 Pi 1.3.0 新增的「会话分享目标」设置项补充中文标签与说明；测试逐项核对当前 Pi 的设置标签，新增或改名的项必须显式评审，不会静默回退英文。
- CI 分别安装 Pi 1.2.0 与 1.3.0 运行完整测试；中文界面、提示词与命令翻译的版本守卫改为显式白名单。
- 测试不再把 1.2.0 写死在版本断言里，改用共享的支持版本集合；不受支持的补丁版本仍需显式兼容审计。
- 精简中英文呜咪口吻模板的重复表述：合并关键内容与代码/JSON 规则，示例只保留一套并删掉与正文重复的短例；规则不减少，中文模板 19 行减到 17 行、英文 17 行减到 15 行。
- 角色名统一为 Umi：口吻模板改为 `prompts/umi-persona.md`，插画素材使用 `assets/reactions/umi`，原像素素材保留在 `assets/reactions/pixel`；旧风格 ID 通过别名映射到对应素材。英文口吻模板不再出现中文名“呜咪”。

### English

- Native Chinese UI, concise Pi documentation hints and built-in command descriptions now cover Pi 1.3.0. Pi 1.2.0 behavior is unchanged, and other versions keep Pi's native behavior.
- Added the Pi 1.3.0 `/share` wording (Radius artifact or secret GitHub gist); command names, argument hints and completion results stay intact.
- Added the Chinese label and description for Pi 1.3.0's new "Session share destination" setting. The test now checks every installed setting label, so new or renamed settings need an explicit review instead of silently falling back to English.
- CI now runs the full suite against both Pi 1.2.0 and 1.3.0; version guards use an explicit allowlist.
- Test fixtures no longer hardcode 1.2.0; unsupported patch versions still require an explicit compatibility audit.
- Trimmed duplicated wording in both Umi voice templates: merged the key-content and code/JSON rules, kept a single example set and removed short examples that repeated the body text. No rule was dropped; the Chinese template drops from 19 to 17 lines and the English one from 17 to 15.
- Standardized the character name to Umi: the persona template is now `prompts/umi-persona.md`, illustration assets use `assets/reactions/umi`, and original pixel assets remain in `assets/reactions/pixel`. Compatibility aliases preserve the corresponding artwork for older style IDs. The English persona template no longer contains the Chinese name.

## 2.5.0-preview.6 · 全动态预发布

### 简体中文

- 全动态版与原逻辑高清版统一由一个仓库构建，保留 Pi 和 DSH 的宿主入口；本版本按预发布提供，不替代稳定版。
- 插画使用 17 项完整动作和两段 400ms 键盘进出过渡；动作选择保留真实工作状态、说话与用户交互的优先级。
- 完整动画仅用于插画。两种产品共用原始 100px 像素素材与原简单动作，移除重制像素动画；历史风格 ID 保留对应别名。
- 索引动画使用保持调色板、像素索引、透明项和时钟不变的 gzip 二进制载荷；保留旧 JSON 读取兼容。高清帧缓存增加失活释放、有界预取和内存预算。
- 分别提供 Pi 的 `pi-core` 包与 DSH 的完整高清包，以及各自的 SHA-256 和逐文件验证报告。包选择与发行标记不依赖共享 `package.json` 的单一版本号。
- 保留上游 Kitty Graphics Protocol 支持、标题动画与稳定眨眼修复；旧局部耳爪变形未重新启用。

### English

- Build the full-animation and HD-remaster editions from one repository, retaining both Pi and DSH entry points. This is a prerelease and does not replace the stable edition.
- Illustration uses 17 complete motion clips plus two 400ms keyboard transitions, with real work state, speech and explicit interaction priorities preserved.
- Complete animation is illustration-only. Both editions retain the original 100px pixel artwork and simple motion; regenerated pixel animations are removed and historical style aliases remain supported.
- Indexed animation uses gzip binary transport without changing palettes, indices, transparency or clocks; legacy JSON remains readable. Native frame caching releases inactive resources and bounds prefetch and memory.
- Provide separate Pi-core and DSH full-art packages, with SHA-256 checksums and per-file verification reports. Edition tags are resolved from the build configuration.
- Retain upstream Kitty support, the header timeline and stable eyelids. Legacy local ear/paw deformation has not been re-enabled.

## 2.4.5 · 原逻辑高清稳定版

### 简体中文

- 原逻辑高清版与全动态版共用仓库源码，通过发行配置明确区分；普通版不会加载全动态 catalog 或误选完整动画序列。
- 修复高清静态素材标记把简单动作一并禁用的问题：恢复普通版安全的整体微动，继续保护新图免受旧局部耳爪 mask 变形；已有完整影片不叠加第二套动作。
- 保留稳定眼区眨眼、原有标题循环及已核准的 grumpy 配色来源修复，保留用户配置与原始像素素材。纳入已验收的放大镜与埋头搜索斗篷去绿噪、透明边缘修复，保护主体轮廓、尾巴、透镜和纸张。
- 合并上游 Kitty 渲染、弹层回退、窗口变化重传和释放修复；感谢 [@srcres258](https://github.com/srcres258) 的 [PR #1](https://github.com/KouzakiUmi/pi-furry-partner/pull/1)。
- 分别提供 Pi-core 和 DSH 完整高清包，并随包提供 SHA-256 与逐文件验证报告。旧局部耳爪变形未重新启用。

### English

- Share repository sources with the full-animation edition while keeping explicit edition boundaries. HD-remaster does not load the full-animation catalog or select its complete motion sequences.
- Restore safe whole-image micro-motion that had been suppressed by the remastered static-frame flag. Legacy local ear/paw masks remain disabled for the new artwork, and baked movies do not receive duplicate motion.
- Preserve stable eyelids, the original header timeline, the approved grumpy color-source correction, user preferences and original pixel artwork. Include the accepted cape green-spill and transparent-edge cleanup for the magnifier and buried-search sequences, protecting the subject silhouette, tail, lens and papers.
- Merge upstream Kitty rendering, overlay fallback, viewport upload refresh and cleanup fixes. Thanks to [@srcres258](https://github.com/srcres258) for [PR #1](https://github.com/KouzakiUmi/pi-furry-partner/pull/1).
- Provide Pi-core and DSH full-art packages with SHA-256 checksums and per-file reports. Legacy local ear/paw deformation has not been re-enabled.

## 2.4.0 · 2026-10-19

### 简体中文

- 新增 Kitty Graphics Protocol 渲染器；`auto` 根据终端能力选择 Kitty、Sixel 或字符块，也可用 `/mascot render kitty` 手动选择。编辑器与标题头像均支持透明 PNG 条带、稳定图像 ID 和有界帧缓存。
- 视口大小变化时重新注册缓存 PNG，避免全屏重画后仅放置已被终端清除的图像；图像尺寸独立声明，保持源素材受限时的预期列宽。overlay 期间让出图像区域，关闭后恢复。
- 完整自动化兼容目标仍为 Pi 1.2.0；Pi 1.3.0 通过针对性真实模块回归及此前 NixOS / Kitty 实机验证。Pi 1.3 的原生中文与文档提示精简仍按版本守卫回退，不宣称完整套件通过。
- 感谢 [@srcres258](https://github.com/srcres258) 在 [PR #1](https://github.com/KouzakiUmi/pi-furry-partner/pull/1) 中贡献 Kitty 渲染支持及 Pi 1.3 / NixOS 验证。
- 下载 `pi-furry-partner-v2.4.0.zip`，或使用 `pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.4.0`；升级后重启 Pi。

### English

- Added a Kitty Graphics Protocol renderer. `auto` selects Kitty, Sixel or character blocks using terminal capabilities; `/mascot render kitty` selects it explicitly. Editor and header portraits use transparent PNG stripes, stable image IDs and a bounded frame cache.
- Re-register cached PNGs when viewport dimensions change so fullscreen redraws upload cleared images again. Explicit placement dimensions preserve the requested cell width for source-limited artwork. Portraits yield to overlays and return when they close.
- Pi 1.2.0 remains the full automated compatibility target. Pi 1.3.0 has targeted real-module regression coverage and prior native NixOS / Kitty validation. Native Chinese UI and concise documentation prompts still fall back behind their version guards on Pi 1.3; this is not a full-suite compatibility claim.
- Thanks to [@srcres258](https://github.com/srcres258) for Kitty rendering support and Pi 1.3 / NixOS validation in [PR #1](https://github.com/KouzakiUmi/pi-furry-partner/pull/1).
- Download `pi-furry-partner-v2.4.0.zip`, or use `pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.4.0`. Restart Pi after upgrading.

## 2.3.3 · 2026-10-16

### 简体中文

- 中文系统提示词及代码中的中文默认文本同步加入“必须使用中文思考和回复。”。
- 修复输入框已释放后，Pi 在切换布局、重新加载或退出期间再次测量渲染旧实例导致的 `Motion player has been disposed` 崩溃。释放后的旧输入框忽略渲染与交互，重复释放保持安全；增加真实 Pi 输入框生命周期回归。
- 新增 GitHub Actions 远程发布流程：版本 tag 触发运行时、集成、安装及静态页验证，通过后生成源码 ZIP、SHA-256 校验文件并发布 Release。
- 中英文安装文档及安装完成提示补充 Sixel 高清显示要求、Windows Terminal 1.22+、自动选择规则和字符块回退方法。
- 下载并解压 `pi-furry-partner-v2.3.3.zip`，在项目目录运行 `pwsh -NoProfile -File .\install.ps1`；或使用 `pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.3.3`。升级后重新启动 Pi。
- 保持现有 Pi 版本兼容范围；本次不增加 Pi 1.3 的原生提示词兼容支持。

### English

- Added “必须使用中文思考和回复。” (must think and reply in Chinese) to the Chinese system prompt and its matching default text.
- Fixed `Motion player has been disposed` crashes when Pi measures an outgoing editor after layout changes, reload or shutdown. Retired editors ignore late rendering and interaction, disposal is idempotent, and real Pi editor lifecycle regression coverage verifies the boundary.
- Added remote GitHub Actions releases: version tags run runtime, integration, installer and static-site checks before packaging a source ZIP and SHA-256 checksum and publishing the Release.
- Added Sixel display requirements, Windows Terminal 1.22+, automatic renderer selection and character-block fallback guidance to bilingual installation docs and installer output.
- Extract `pi-furry-partner-v2.3.3.zip` and run `pwsh -NoProfile -File .\install.ps1` from the project directory, or use `pi install git:github.com/KouzakiUmi/pi-furry-partner@v2.3.3`. Restart Pi after upgrading.
- Existing Pi compatibility boundaries remain in place; this release does not add native prompt compatibility for Pi 1.3.

## 2.3.2 · 2026-10-16

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
