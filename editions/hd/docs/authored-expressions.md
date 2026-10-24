# 定稿表情 / Authored expressions

> 最新执行顺序：先完成动作素材并逐批评审，再做适配。新 idle 运行接入和素材包仅在项目中暂存，尚未安装到本机 Pi／DSH。
> Current order: complete and review the animation artwork first. The new idle runtime implementation and exports are staged in the checkout, not installed into either local host.

本轮 40 个静态状态已经全部通过并接入。grumpy 另有独立通过的新 H3：闭拳叉腰、轻微撇嘴与胸肩呼吸，约 6.58 秒；支持四种 Pi 样式与 DSH 高清，使用 `/mascot action grumpy` 或动作菜单播放。原静态图不变，其余情绪仍按当前静态／既有动作回退。旧校准批次的撤回决定保持有效。

历史表情参考保存在 `Hi-Res/sources/expression-keyframes-20261018/Umi-nine-expressions-approved.png`。用户已拒绝后续固定材质校色和纵向拉伸，相关 H3 派生已撤回；新原画以原 idle/happy 的身份、比例和配色为准，九格只参考表情动作，先确认静态图再制作连续动作。原上传基准另存为 `Umi-nine-expressions-user-master.png`。角色与素材保留全部权利（ARR）。

| ID | 表情 | 自动出现 |
|---|---|---|
| joy | 笑脸、闭眼开心 | 完成任务、空闲陪伴 |
| grumpy | 闭拳叉腰、轻微撇嘴／胸肩呼吸（新 H3） | 手动选择、全部动作巡演 |
| sad | 委屈 | 手动选择 |
| cry | 揉眼睛、哭泣 | 手动选择 |
| shy | 害羞、搓爪 | 空闲陪伴 |
| flustered | 举爪、慌张 | 工具报错后的短暂提醒；手动选择 |
| surprise | 惊讶 | 打瞌睡后惊醒；手动选择 |
| proud | 握拳叉腰、小得意 | 空闲陪伴 |
| affection | 开心举爪 | DSH 摸摸；空闲陪伴 |

Pi：`/mascot action shy` 单次表情，`/mascot action all` 循环原有八个动作和新增九种表情，`/mascot action off` 结束。也可在 `/mascot menu` → “和呜咪玩个小动作”选择。字符插画 `umi` 和派生像素 `umi-pixel` 均有独立资源包；旧式 `pixel` / `illustration` 使用对应的已有表情回退。

DSH：右键菜单提供害羞、举爪、得意入口，设置页列出完整 17 项动作与表情。两端使用同一份标签与中英短句；历史校准 H3 已从动作目录撤下，新 grumpy 独立审核接入，周期为 6583ms。其他关键图回退通常停留 3.6 秒，哭泣回退为 4.2 秒。真正开始任务、输入倾听、提问和戳一戳优先，立即结束手动巡演。生气、哭泣、委屈不参与空闲随机动作，不推断模型的心情或用户的情绪。

每格分别导出原尺寸透明裁片、640px 工作画布、Pi 240/80px 索引色包与 DSH 640px WebP。原九格每格约 420px；640px 是规范化工作画布，不代表原画具有更多细节。拆图会移除相邻格碎片，保留本格的爱心、汗滴和闪光。

新表情色板追加原画中的暖色，原色板前缀及旧帧索引保持原样。插画色板超过 256 色时使用 16 位索引；DSH 以明确的 `u16le` 编码往返传输，避免红色爱心和金色闪光被截断或压成灰色。旧资源与像素色板仍支持 8 位编码。

新生产流程只对完整画布等比缩放、居中补透明边，不作材质映射或 Y1.10 非均匀拉伸，也不按动作外框重新拟合大小。原始 640px RGBA 输入保持原样。历史九格拆图保留原有 1.24 倍等比变换与落爪对齐，但不再调用已撤回的校准模块。新表情禁用旧中立姿势的局部耳、爪形变区域。比例与材质颜色仍是必须人工通过的审核项；撤回记录优先于旧审核，打包与重建会明确拒绝重新收录。详见 [连续动作审核与撤回](h3-expression-videos.md)。现有搜索、放大镜、倾听、说话及 XX 错误动画保留。

新原图确认后，可用 `python scripts/build_expression_reactions.py --source-dir <原图目录>` 读取九张 `emotion-ID.png` 同尺寸完整画布，再构建高清与 DSH。历史默认拆图入口只用于原九格。完整高清构建碰到已撤回时间轴或其源归档会中止，需先显式完成新旧版本迁移，不会自动删除撤回证明。

English: All 40 replacement static states and the new thick-forearm grumpy H3 clip are now approved. Use `/mascot action grumpy` or the gesture menu: this manual clip lasts 6583ms, with 79 frames in each Pi style and 158 DSH HD frames. Other expression actions retain their current approved static or existing fallbacks. The historical color/aspect-calibrated derivatives and their H3 clips remain withdrawn after the user rejected color pollution. New artwork uses the original idle/happy colors and proportions; the old nine-cell sheet supplies gestures only. Production keeps authored RGBA and uses uniform full-canvas resizing, with no RGB mapping or non-uniform stretch. All nine review checks remain mandatory, and withdrawal records override old acceptance during packing/rebuilding. Existing task animations remain available. See [H3 review and withdrawal](h3-expression-videos.md).

## 常用状态循环 / Common-state loops

默认待机现有独立获批的连续 H3 序列，和手动表情动作分开选择。它沿用待机睁眼图的固定尺度，内部完成呼吸与眨眼，避免独立闭眼图的尺寸跳变。Pi 四种样式为79帧、DSH为158帧，周期6583ms；动画关闭时显示稳定睁眼图。真实讲话、输入倾听、工具工作和手动动作均可抢占。已接受的慢眨眼、耳动和轻微接缝差异保留。

English: Default idle now has its own approved full-frame H3 state loop, separate from manual expression actions. A fixed registration and internally filmed blink prevent size changes from independent blink portraits. Pi uses 79 frames per style and DSH uses 158 HD frames, both over 6583ms. Animation-off uses the stable open-eye static. Speech, typing/listening, tools and manual actions preempt idle. The disclosed slow blink, ear movement and fine endpoint differences remain accepted.
