# H3 连续表情动作 / Continuous expression clips

> **历史制作／审计记录**：下文的阶段、旧分支、双平台 API、包名、安装与发布状态均记录当时环境，不是当前使用步骤。当前维护为 main 根目录原资源版 2.5.1 与 editions/hd 的 HD 源码 2.5.1-preview.6（29 个完整片段）；DSH 独立维护。当前入口见[文档索引](../../../docs/README.md)。批准、撤回和失败历史继续保留，不从旧记录推定本机已安装或新素材已获批准。


> 当时执行顺序（历史）：先完成动作素材并逐批评审，再做适配。新 idle 运行接入和素材包仅在项目中暂存，尚未安装到本机 Pi／DSH。
> Historical order: complete and review the animation artwork first. The new idle runtime implementation and exports are staged in the checkout, not installed into either local host.
>
> 历史撤回：用户指出“键盘反了”。`keyboard-ready-v1.png`（SHA `112753be4b359508f53862124a15a944ab13a20f57c195059431e3aac446216e`）及其全部键盘 H3 派生（含 global-v3）撤回，不再作为合格构型、生成参考或接入来源。新的正确方向整图已获批准并进入视频试点，见下文。Umi 面向我们使用键盘：空格行应在画面远／上侧靠 Umi，功能／顶行应在近／下侧靠观众；键位布局整体转 180°，不是左右镜像。历史脚本、spec 与原片冻结保留。
> Historical withdrawal: the original keyboard reference and every video derived from it, including global-v3, face the wrong operator and remain withdrawn. The replacement whole still is now approved and video trials have resumed. Spacebar belongs on the far/upper Umi-facing side, function/top row on the near/lower viewer-facing side: rotate the key layout 180 degrees, never mirror it.

## 当前状态

正确方向参考 `keyboard-facing-v2.png`（SHA `cac4a6b37c20542118a1a10da71c5856aac08d2d9a6573ef93ead2a611131a57`）已由用户“嗯，可以了，再重新做视频。”批准，独立批准记录为 `user-approval-facing-v2.json`。facing-global-v4／compact-v1 与 first-only v5 的键盘朝向和全局支撑有改善，但均因末段停打被内部否决；v5 的内部候选也未证实完整全身循环。移除末帧参考并未单独解决停打，不能把此假设写成已验证原因。ongoing-v6 改为持续工作中的约两次轻微胸肩呼吸，去掉完成任务和末姿态叙事，任务 `453776865018284` 已提交；仍须实际动作、人审与接缝检查。旧方向来源继续撤回，新动作尚未适配或安装。

2026-10-19 更新：ongoing-v6 已出片并完成全 158 帧透明处理，源 SHA `cd157282e4610875a67dd2621db459f8b250b3e5416564b19fae8147e3f4794d`，处理 manifest SHA `2c68de4ea8c9694b53c04ac8aa8a862feafcb8dc4c11fbcc3a59290d98bfa86a`。双爪末秒大部分仍快敲，头胸肩有相对运动，未发现必须阻断人审的结构问题。最后约 0.25 秒及开头有短暂收势，连播节拍仍须人审；不能宣称严格双周期或循环已通过。完整正向 6583ms 预览位于 `http://127.0.0.1:8877/work-keyboard-facing-v6/index.html`；内部状态 `WARN_HUMAN_REVIEW`，未适配或安装，entry/exit 继续等待。

随后用户在上述页面明确回复“没问题，下一批”，ongoing-v6 的完整原片与处理 manifest 已由相邻 `user-approval.json` 精确批准，保留已披露的短暂收势。当前进入正确方向键盘入场／离场两段 once 试点，各一次 H3 请求：无键盘 work → facing-v2；facing-v2 → 无键盘 work。生成与透明处理后再人审，不将此次批准解释为适配或安装授权。旧方向参考与其派生仍撤回。

本批转场结果（2026-10-19）：`work-enter-facing-transition-v1` / `work-exit-facing-transition-v1` 早期检查发现爪臂被源画布裁断，均记录拒绝并停止 alpha。按短幅接触／提前释放重新设计为 `facing-safe-v2`，参考留白增加；每段新源完整 158 帧，已做绿亮度 alpha 与保守白边修复。新的 896×896 审查画布保持角色画布宽 456px，pivot `[448,608]`；批准 v6 只在左右各补 128px、底部补 256px 后顺序展示，不重画、不逐帧拟合。入场源 SHA `7c412f673cda0a2a5266381c04174f07d7587970c9114e629987b9eb8c5c542c`、manifest `1502ceab7b5b2d77c2135cbc9797537d6f1ceeb8befdc45b7883679148fc17aa`；离场源 SHA `79c058088e0197ed06c5a9f7da371a09a4005a28f6f6c0ab9f28caed8dc8e681`、manifest `531020c4b95328a14f81293e486de17313cfae1b3498aeb6fa7abf1aaa46cda1`。两段 `WARN_HUMAN_REVIEW`：入场直臂透视较强，离场启动约 2.2s／释放约 3.2s／完全离画约 4.6s，比规划慢；保留完整片段，未自动裁短。预览 `http://127.0.0.1:8877/keyboard-transitions-20261019/index.html` 包含单段与约 19.75 秒顺序演示，速度线仍独立，未适配或安装。

最新极速要求：“拉键盘的动作做到超快（一瞬间） 丢键盘是那种随便一扔（也超快）”。用户明确授权时间修改，原入场制作400ms／24帧／60fps的正向时间映射，保留抓沿、拉回、松沿换掌与落键；源视频和像素未修改。旧退场本质是双爪推滑，不能单靠加速冒充随手抛出，因此另生成一次4s H3 `work-exit-casual-toss-v3`（task453794880123308）。新源107帧／24fps，SHA `1c2eee6faee1302001cea0ed0112c2b87ccad7481f5d832967db6abfb6cf4e14`；透明处理manifest `4b18cecbe69657b5f969bbc4662683119b61b5dfe88c0d9561d387d4ea80f755`。新动作有单爪托举、释放和键盘独立浅弧飞行，再按真实阶段映射400ms：0–4/5–9/10–18/19–24/25–46/47–64各取1/2/4/3/7/7帧；包含释放24、飞行末46、空场47，不补跳末静图。

两条极速manifest分别 `1ca3a138d2d1227711b08ed340d57b8e98fe0edf55ace56e1bede6944bbb481b` 与 `1863192dc0e322b4ea153d552467f04f4bdbbf7f62cc5eaf8ed4c433e641ca45`。全部选中RGBA与对应canonical逐字节一致，无插值、倒放、混帧或局部修画。打字loop仍1倍速；60fps顺序预览443帧，约7.383s。预览 `http://127.0.0.1:8877/keyboard-instant-20261019/index.html`，独立速度线可开关且默认关闭，未烘入素材。保留新抛掷抬得较高／掌垫简化的差异，状态待用户评审，未适配或安装。

颜色审查（用户“怎么感觉颜色污染了”）：当前键盘动作置于 `COLOR_HOLD_PENDING_WORKFLOW_PILOT`。从批准参考、绿底输入、H3 decoded、native RGBA、最终视频逐级对照，青绿帽色在原片解码阶段已经存在；参考内部alpha250–253也会先混入约+2G。107帧提透明审计发现向内5px的内部候选约1.501%为低alpha，反合成会改变其RGB，不能以修白边阶段的opaque invariant代替整体色彩验收。边缘pass4px是距reliable像素，可能沿低alpha连通区深入，不能泛称只改外轮廓。601/709及limited/full解码试验未带来一致恢复；最终编码抽查只增小幅误差。诊断未生成、未修画、未全局校色，动作批准历史与原片保留。对照 `http://127.0.0.1:8877/keyboard-color-audit-20261019/index.html`，详细记录 `Hi-Res/sources/work-keyboard-pilot-20261018/color-audit-20261019.json`。后续先验一份输入／matte小样并经用户评审，再决定是否重生成或替换流程；不自动批量返工。

English: The corrected facing-v2 whole still is user approved. v4 compact and first-only v5 improved prop orientation and supported upper-body motion but both stopped typing near the end; neither is a verified continuous loop. Removing the ending reference alone did not solve the pause. Ongoing-v6 (task453776865018284) is now processed as all158 forward frames,6583ms. Bilateral typing continues through most of the final second, and supported head/chest/arm motion is visible. The last roughly0.25s and opening have a short settling beat; normal-speed loop judgment remains with the user. This is WARN_HUMAN_REVIEW, not approved, adapted or installed; entry/exit stay held.

Later user decision: “没问题，下一批” explicitly approves the full v6 video, with its source and manifest bound by user-approval.json. The previously disclosed settling beat is retained. This unlocks one correct-facing entry and one exit one-shot pilot; new clips still require human review, and adaptation/installation remain deferred. Wrong-facing sources remain withdrawn.

Transition batch: both first sources clipped character paws and were rejected before alpha processing. Redesigned safe-v2 sources now preserve character completeness and are processed as complete158-frame one-shots with green-luminance alpha and conservative fringe cleanup. Review uses a fixed896 canvas and unchanged456px hero scale/pivot448,608; v6 receives only matching canvas padding for the sequential demonstration. The entry still has a pronounced straight-arm foreground reach; exit preparation is slower than planned (push~2.2s, release~3.2s, complete departure~4.6s). Both remain WARN_HUMAN_REVIEW, with no automatic trimming, adaptation or installation. Independent speed-line FX are not baked into the videos.

Latest user request explicitly authorizes instant timing and a casual toss. Entry now has a400ms phase-aware chronological edit. Exit was regenerated once as a real single-paw lift/flick/release followed by independent airborne movement, rather than relabelling the old two-paw slide. Its new full107-frame source and alpha export are preserved, with a separate400ms/24-frame/60fps edit. All selected RGBA frames remain byte-identical to their canonical sources. The approved typing loop remains1x; the443-frame combined preview lasts about7.383s. Independent optional FX are off by default. High keyboard lift and simplified exposed palm pads remain disclosed; human review and adaptation/installation are still pending.

Color audit hold: cyan/green hood differences are already present before transparency extraction. Slightly translucent reference interiors introduce a small green contribution; the inverse matte also alters some internally green pixels. Fringe-stage opaque invariance is not proof of whole-pipeline color fidelity, and its4px neighborhood is measured from reliable pixels rather than strictly from the outer contour. Tested YUV interpretations did not consistently restore the original palette; final encoding adds comparatively small changes. No new generation or global recoloring was done. Preserve motion decisions and all sources, hold deployment, and review one input/matte pilot before wider rework.

最新待机循环也已由用户“可以，继续”通过，使用批准 `idle-open` 为整段尺度基准，包含连续呼吸、慢眨眼与耳动。Pi 四种样式各 79 帧，DSH 高清 158 帧，周期均为 6583ms；这是一段独立的常用状态循环，不借用手动表情选择。播放时不切换旧的独立闭眼图，不运行旧局部形变；讲话、输入倾听、真实工具和手动动作优先。关闭动画稳定回到批准的待机睁眼图，重新开启从循环起点恢复。高清尚未加载时使用同一时钟下的索引帧。

批准源、处理序列及批准记录在 `Hi-Res/sources/h3-loop-batch-01-20261018/idle-open/`，manifest SHA `e9264bdb4ef0f42a43c0c58df89c4265a29794800ac97b5a0eb0f8d3bb30f96b`。用户已接受慢眨眼、右耳压低回正及首尾细小阴影／轮廓差异；原始全图和既有 watch/search/grumpy 不改。`scripts/export_approved_state_loop.py` 只接入精确人审绑定的完整序列，更新 `state-loops.json` 与高清 `animations.stateLoops`，保留共享调色板。

think 首次提交被 H3 以 HTTP429 / TokenPlan2056 拒绝，额度补充后任务又返回服务端系统错误1033，没有视频。无键盘 work v1 已因左右动作顺序不符被拒，alternating-v2 及其选段因“像砸键盘”被拒。随后完整键盘就位静态图获用户“嗯，制作”批准，但不代表动作获批。键盘 loop v1（`work-keyboard-pilot-20261018/h3/work-loop-v1`）被明确否决：双爪未持续共同参与且速度太慢；both-fast-v2（同目录下 `work-loop-both-fast-v2`）也被明确否决：“光是爪子动不行。你得考虑全局。” 两条均不得用于接入或作为已通过版本。用户最新授权将全局表演规范落地并继续下一条整体编排试点；entry/exit 仍须等待新 loop 人审，适配和安装继续后置。保留全部原片与否决记录，不恢复旧版本。

English: The approved idle loop uses one fixed registration, 79 Pi / 158 DSH frames and a shared 6583ms period; its implementation remains staged under the current artwork-first order. Think returned provider error1033 with no video. Both keyboard loops are USER REJECTED: v1 was too slow with insufficient concurrent paw activity; both-fast-v2 improved the paws but left the overall performance stiff. Neither is approved for integration. The user now authorizes a new whole-body choreography pilot; entry/exit remain held until that loop passes human review, with adaptation and installation deferred.

## 全局表演优先 / Global performance first

- 第一门槛是功能性道具：先从实际操作者视角核对朝向、按键／握持面的用途、爪与道具接触以及受力／支撑，再评审全局动作和爪趾细节。道具画得完整、爪数正确不代表用法正确。独立速度线 FX 可保留；预览中的旧键盘图只作效果底层，其构型已撤回。FX 不修改角色原图，也不能替代可见关键姿态的功能性验收。
- 先写清“角色正在做什么、为何这样动”，再安排主动作及支撑链。头、视线、肩肘、胸腹、接触点与次级跟随应服务同一意图；可有意静止的部位，不要求每个部位都动，也不要求全程跟随。固定镜头、体积比例和统一注册不等于冻结整个头肩躯干，亦不允许整张精灵摇晃来代替关节动作。
- 以键盘为例：双爪持续快敲，趾端短促压放；腕部有支撑，肩肘吸收自然前倾与呼吸，避免前臂抬落砸键。视线先转向键盘或前方，头胸随后响应；围巾、帽耳仅按主动作产生少量滞后，不随机添加独立动作。键盘壳体刚性与位置稳定，角色四趾短甲、灰豆眉、左折耳、连续 X 缝线和配色保持。
- 按时间层安排持续主动作、较慢的姿态／呼吸以及短暂视线变化，写明启动和回归逻辑。不要用精确次数、强制双爪严格反相或全身同步节拍替代表演。循环应同时匹配首末姿态与运动方向／速度，至少对照接缝两侧各数帧；入场拉入与离场甩开独立为一次性片段。
- 审核顺序：道具操作者视角／方向／用法／接触／受力 → 正常速度看整体意图、节奏与连贯性 → 短窗口看支撑、爪趾和关节 → 全帧看完整轮廓、色彩、透明白边 → 接缝上下文 → 用户审查。联系表、数值 PASS、提示词自检均不能代替动态视觉与人审；未实际播放必须明示。全图生成仍可能漂移，“保持不变”不构成像素锁定。否决版本保留溯源并排除接入，不靠局部艺术修补救回。
- `scripts/h3_motion_contract.py` 返回错误字符串列表；空列表仅表示文本自检通过。新 prompt/spec 必须用 `schemaVersion:2`；prepare 与 submit 调用 `validate_motion_contract(contract, prompt, require_schema_version=2)`，非空即停止。schema 2 十个设计字段为 `intent / primaryMotion / supportChain / gazeHead / secondaryMotion / anchors / timingLayers / loopBoundary / reviewOrder / propInteraction`。无道具时 `propInteraction` 明确填字符串 `"none"`；有道具时填对象，`orientation / use / contact / force` 分别说明操作者方向、用法、接触及受力，均不能为空。缺 `schemaVersion` 的历史合同仍按 legacy 1 用原两参数验证，不得据此用于新提交，也不改历史脚本/spec。默认 `globalMotion=true`；有意不动或无次级跟随须说明依据，明确局部／静止表演才可设为 `false`，不得用它绕过全局动作冲突。

English: First check functional props from the actual operator's perspective: orientation, intended use, contact and force/support. Then connect one acting intention to its primary action, support chain, gaze/head response and motivated follow-through. Stable camera, volume and registration allow articulation; they do not freeze the head, shoulders and torso. Not every part needs to move throughout. Review whole performance at normal speed, anatomy, all-frame edges/colors and seam direction/velocity context, then obtain human approval. Entry/exit are separate one-shots. New prompts/specs require schemaVersion 2 and its tenth field, propInteraction: "none" or a mapping with nonempty orientation/use/contact/force. Call validate_motion_contract(contract, prompt, require_schema_version=2) before prepare/submit. Missing versions remain legacy 1 solely for frozen-history verification. Text checks cannot approve prop orientation or rendered motion. Independent FX remain usable, but their old keyboard backdrop is withdrawn as a functional pose.

长度预检 / Length preflight：H3 提示词字符串硬上限为 7000 字符，`validate_motion_contract` 按 `len(prompt)` 检查；原 facing-global-v4 的 7640 字符请求被 HTTP400／2013 拒绝且未创建任务，原回执保留，精简稿独立置于 `compact-v1`，不把参数错误记成成功生成。


2026-10-18 本轮替换：40 个静态状态已经逐批通过并接入。新粗前臂版 **grumpy** H3 也已由用户“没问题”明确通过，现用于 Pi 手动动作／全部巡演与 DSH 小动作选择，完整周期 6583ms；Pi 四种样式各 79 帧，DSH 为 158 帧。入口为 `/mascot action grumpy`。关闭动画会暂停这段手动动作，真实工作立即抢占；不会自动将工具错误解释为生气。

本轮源与批准记录位于 `Hi-Res/sources/h3-next-actions-20261018/emotion-grumpy/`，精确绑定当前粗前臂源图及处理 manifest。处理和接入分别使用 `process_approved_h3_actions.py` 与 `export_approved_emotion_h3.py`，保留绿亮度 alpha、白边修复和全片固定注册。以下撤回说明针对**历史校准批次**，不撤回本轮单独获批的 grumpy；历史旧任务与撤回记录仍原样保留。

用户指出固定材质校色产生颜色污染，已撤回这一批校准后的九格派生素材与 H3 接入。Pi 两种风格的动作目录和 DSH 高清动作目录不再收录这批片段。原视频、逐帧蒙版及历史审核保持原样，旁置 `withdrawal-record.json` 明确记录撤回；**历史审核通过不代表当前允许部署**。

新图以原 `idle-open` / `happy` 为身份、比例与颜色基准，标题原图可补充折耳、四趾掌垫和短甲细节。旧九格只参考表情与手势，不沿用其紧凑比例或配色。先确认新静态图，再生成新 H3 动作。

| ID | 历史动作检查 | 当前接入状态 |
|---|---|---|
| joy | 笑时张合嘴、胸肩呼吸，落地爪保持 | 校准派生已撤回 |
| cry | 手腕、前臂联动揉眼，肩颈回收 | 校准派生已撤回 |
| shy | 第二版修正旧版爪背白点和指甲穿模 | 校准派生已撤回 |
| flustered | 转腕贴脸，再恢复四趾掌心 | 校准派生已撤回 |
| surprise | 预备眨眼、张口、双拳抬起 | 校准派生已撤回 |
| proud | 抬下巴、轻转头，左拳保持叉腰 | 校准派生已撤回 |
| grumpy | 旧版展开闭拳、弯甲已撤回；本轮粗前臂版保持闭拳并轻微撇嘴／胸肩呼吸 | 新版已通过并接入 |
| sad | 第一版虚构胸前饰物 | 未接入 |
| affection | 第一版左爪触及画布边缘 | 未接入 |

## 保留原画的生产流程

新表情处理配置为 `source-native-v1`：只对**整张画布等比缩放**并居中补透明边，不按每帧角色外框拟合，不校色，不做 Y1.10 等非均匀拉伸。640×640 输入的 RGBA 样本保持原样；其他画布使用预乘 alpha 重采样，保持毛边的软透明。标题和原有状态也不应用旧九格实验。

独立静态图可使用：

```text
python scripts/build_expression_reactions.py --source-dir <已确认的九张原图目录>
```

目录包含 `emotion-joy.png` 等九张同尺寸完整画布 PNG；处理不会按不同表情重新裁切或放大。原文件按字节保存到 `Hi-Res/sources/expression-keyframes-BUNDLE_SHA/full-canvas/`，元数据记录各图与整组 SHA。原九格拆图入口保留作历史兼容，仅作原有等比变换，不调用材质映射或纵向拉伸。旧 `expression_color_calibration.py` / `expression_geometry.py` 只保留实验复现，已标记 `withdrawn-user-rejected`、`deploymentAllowed:false`，生产入口不导入它们。

H3 透明处理沿用埋头搜索流程：每个源帧生成独立的 **16 位绿色亮度背景蒙版**，反相为前景 alpha，再还原前景 RGB。它把绿色亮度作为蒙版，不擦除绿色通道。高清输出为固定 640×640 连续 alpha PNG / lossless exact WebP；Pi 为 240px 索引插画与 80px 派生像素资源。

历史片段为 768×768、24fps、158 帧，完整周期约 6.583 秒；原先选取 79 张真实正向帧，步长 83/84ms，总周期 6583ms。新生成必须按实际源时间戳重新测量，不能用历史时长替代实测，也不反向播放或混帧伪造循环。

## 审核与撤回门禁

`scripts/build_expression_video.py process` 只准备未审核帧。`pack` 需要绑定源 SHA 与当前处理清单 SHA 的明确审核，九项必查仍保留：动作、循环、折耳、四趾短甲、可见尾色、完整轮廓、透明边缘、原角色比例、原角色材质颜色。比例和颜色应在原图中成立，不由代码事后修补。

以下情况拒绝打包或高清重建，并保持当前资源：

- 处理目录、审核目录、原片所在目录、归档原片所在目录或 `Hi-Res/animations-640/emotion-ID/` 的邻接撤回记录禁止部署。
- 记录损坏、无法解析，或声明 `deploymentAllowed:false` / `withdrawn...`。旧 `accepted:true` 不能覆盖撤回决定。
- 清单仍声明已撤回的固定 RGB / 非均匀比例实验，即使旁置记录缺失。
- 源帧空白、轮廓触边、最终选帧少于 4px 余量、帧或蒙版变化、九项检查未解决。

撤回不会通过删除历史审核“恢复”。新原画与动作获准后，需要显式进行版本迁移、归档旧动作目录，再发布新版本；构建器不会自动移除撤回记录或静默跳过导致新包不完整。

原视频与处理证明分别归档于 `Hi-Res/sources/h3-expression-ID-SOURCE_SHA-processing-MANIFEST_SHA/`，帧与时间轴在 `Hi-Res/animations-640/emotion-ID/`。回执不保留密钥或下载签名地址。打包共享目录使用互斥锁，逐动作发布；重建发布前再次检查撤回与并发更新。见 [H3 播放实现](h3-gesture-runtime.md)。

## English

Current replacement (2026-10-18): all 40 static states and the new thick-forearm **grumpy** H3 clip are approved. The new clip is available through manual gestures and Show all: 79 Pi frames in each of four styles, 158 DSH HD frames, 6583ms. Use `/mascot action grumpy`. Animation off pauses this manual clip; real work immediately takes priority. It is not an automatic error emotion. Approval and source evidence are stored in `Hi-Res/sources/h3-next-actions-20261018/emotion-grumpy/`. The withdrawal below applies to the historical calibrated batch, whose files and decisions remain unchanged.

The fixed material-color and Y1.10 derivatives were **withdrawn after the user reported color pollution**. The six historical expression clips are no longer listed in the Pi or DSH runtime catalogs. Videos, mattes and old reviews remain as evidence; an adjacent `withdrawal-record.json` overrides historical acceptance.

New artwork takes identity, proportions and colors from the original idle/happy poses. The old nine-cell sheet supplies expressions and gestures only. Static artwork must be confirmed before generating replacement H3 videos.

Production uses `source-native-v1`: uniform full-canvas resize and transparent padding, with no color mapping, non-uniform stretch, per-frame fitting or local warp. A 640px RGBA source remains sample-exact. Transparency uses the independent 16-bit green-luminance matte and inverse alpha/compositing workflow. Timing comes from the actual complete forward source timeline.

All nine anatomy, motion, loop, alpha, proportion and material-color review checks remain mandatory. Packing and full Hi-Res rebuilding refuse withdrawn adjacent sources and historical fixed-calibration metadata, even when old reviews say accepted. Malformed withdrawal records also stop publication. Replacement requires an explicit reviewed version migration; builders do not delete withdrawal records. Character artwork remains **All Rights Reserved**.

### 2026-10-19 颜色重生试点 / Color regeneration pilot
按用户额度偏好，直接生成两份独立 H3 候选，快速选择 A 继续透明处理。保留源图 RGB，仅在输入准备副本中统一补足轻微半透明；无整体调色。A 完整107帧与0.4秒极速版已放入 http://127.0.0.1:8877/keyboard-color-pilot-v4/index.html ，附认可静态参考和旧版配色对照。B 后段兜帽偏青，未选。新 A 的抬爪更高、键盘飞行接近竖直，需要用户一起评审。当前仅退出动作，未替换插件，旧进入与工作动作的颜色待后续处理。
Two H3 candidates retained; A selected for review, B not selected due to late hood cyan drift. No global recoloring. Full source and400ms chronological edit preserved. Exit-only pilot; user approval and runtime installation remain pending.


### 2026-10-19 灰爪／白臂分界修正
用户退回 v4 的爪臂毛色过渡。实际旧请求有首尾参考，但没有抬掌／前臂展开时的毛色依据。v5 加入认可的倾听和双掌全图后，分色改善但复制了倾听挥爪动作，内部淘汰。v6 改用两张原有姿势图＋从认可图裁出的两个爪臂细节，以 Ref2VA 实际传入四张 reference_image，原图 RGB 保留，无局部绘制。灰色覆盖完整爪掌，粉色只在肉垫，腕部毛尖状分界接白色前臂。完整107帧与0.4秒顺序抽帧预览位于 http://127.0.0.1:8877/keyboard-paw-detail-v6/index.html 。原速有举键盘准备停顿，评审页已说明。待用户评审；未安装插件。
English: v4 rejected for wrong paw/forearm zoning. v5 copied full reference gesture and was rejected early. v6 supplies four actual image references, two of which are unchanged-art anatomy crops. Gray full paws join white forearms at a pointed fur boundary; pink stays inside pads. Full source and400ms chronological review export preserved; no runtime installation.


### 2026-10-19 一爪甩飞动作重生 / Single-swat regeneration
用户退回 v6：不够干脆，应该是一爪子甩飞。快速试稿 v7/v8 因放大构图、额外举掌而淘汰；v9 视频约束仍保留慢举动作，淘汰。v10/v11 动作改善但未选。选择从已认可键盘首帧直接生成的 I2VA v12：右爪低位单次横甩、立即脱手、键盘独立飞出并收爪，无举起停顿或二次搬动。实际输入只有认可的垫边首帧；毛色分界、四趾和肉垫要求写入提示，不声称额外图像条件。完整107帧原速与0.4秒顺序抽帧版均保留。源 SHA32135cc53987dd7d1f0d8102d731bb709b2570aa1a0d0bc1b2e218d0e6a2e817。评审：http://127.0.0.1:8877/keyboard-single-swat-v12/index.html 。待人审，未安装。
English: User requested one decisive paw stroke. Rejected sources retained, weak semantics not rescued by speed-up. Selected v12 is fresh first-frame-conditioned H3 generation with one low outward swipe, independent free flight, and recoil. Full source,400ms chronological timing, fixed registration and alpha/fringe proofs retained; user acceptance pending, no runtime install.


### 2026-10-19 整套衔接评审 / Full continuity review
用户要求检查几个片段能否连起来。本轮只制作真实直接切换预览，未生成新视频素材：待机完整一圈 → 拉入0.4秒 → 已认可打字两圈且保持1倍速 → 新版单爪甩出0.4秒 → 回到待机完整一圈，总长27.133秒。原有640画布仅左右各加128留白，统一896画布和448/608锚点，没有逐帧缩放、混帧、淡化、速度线或改色。帧数1628、60fps已核对；整套播放、定位接缝和逐帧已在浏览器检查。
实际接缝仍未全部通过：待机转拉入爪位改变；拉入转打字兜帽变色；甩出转待机爪形和身体轮廓不同。页面保留差异并提供接缝跳转、慢速、前后画面对照，先供用户整体验收。http://127.0.0.1:8877/keyboard-chain-review-v12/index.html 。没有新增动作授权推定，没有安装插件。
English: Direct-cut27.133s review joins idle,400ms entry,two original-speed work loops,400ms v12 exit,and idle. Common padded canvas only. Color and pose discontinuities remain exposed; no FX/fades hide them. User continuity approval pending; no generation or installation.


### 2026-10-19 相邻真实帧重生接缝 / Matched boundary regeneration
用户同意继续修整套衔接。拉入使用认可待机末帧157与打字首帧0，甩出使用打字末帧157与待机首帧0，均实际传入 FL2VA 首尾参考。只统一留白与输入 alpha，不改参考 RGB。v13 因探身放大、肉垫变黑提前退回；v14 控制短臂探身并恢复珊瑚粉肉垫，完整源片与0.4秒顺序抽帧均保留，首尾使用真实生成的0/106帧，没有贴帧强行吻合。
新版整套 http://127.0.0.1:8877/keyboard-chain-seams-v14/index.html ，待机和打字仍原速原素材，27.133秒、1628帧60fps，黑灰白三底已核对。可同位置切换旧版，接缝定位和播放已在浏览器验证。落爪姿势、身体轮廓及兜帽色差明显改善；细小线条／阴影变化仍留供用户整体验收，未安装。
English: Fresh H3 transitions use actual adjacent approved-loop frames as first/last conditioning, not standalone pose stills. v13 rejected early; v14 retains native endpoint frames with no pasted replacements. New direct-cut full-chain review, old/new toggle and three backgrounds verified. Small generated contour/shading variation remains; human acceptance pending, no installation.


### 2026-10-19 键盘整套通过 / Complete keyboard chain accepted
用户在接缝修正版页面确认：没问题。完整待机→拉入→打字两圈→单爪甩出→待机套组已通过。精确记录位于 Hi-Res/sources/work-keyboard-pilot-20261018/user-approval-keyboard-chain-v14.json，绑定整套时间线、三底色预览以及拉入／甩出源片和导出清单哈希。通过范围是评审中实际使用的各24帧／0.4秒转场；完整107帧源片留作来源记录，不把未使用帧自动列为通过。动作清单已更新，适配继续遵守先完成动作的顺序。
English: User accepted the full v14 keyboard chain with 没问题. Approval binds exact reviewed segment exports and full-chain video hashes; unused native frames are provenance only. Runtime adaptation remains deferred under the existing artwork-first order.
