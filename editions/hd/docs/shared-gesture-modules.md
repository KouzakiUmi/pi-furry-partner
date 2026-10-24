# 共用小动作模组 / Shared gestures

Pi 与 DSH 现在使用同一份 `lib/gestures.mjs`：动作时长、姿势、中英文短句、位移、旋转、耳朵与爪子动作均来自这份定义。原有八个动作是轻量骨骼／整体运动模组；另加入[九种定稿表情](authored-expressions.md)，共 17 项。这批新表情来自确认的九格母版，不是 H3 视频素材。

| ID | 动作 | 时长 |
|---|---|---|
| wave | 挥爪 | 3.2 秒 |
| nod | 点头 | 2.6 秒 |
| peek | 歪头探看 | 3.4 秒 |
| stretch | 伸懒腰 | 3.8 秒 |
| ear-flick | 抖耳 | 2.6 秒 |
| nuzzle | 蹭蹭 | 3 秒 |
| bounce | 开心晃晃 | 2.8 秒 |
| head-shake | 晃脑袋 | 2.8 秒 |

Pi: `/mascot action all` 循环全部小动作；`/mascot action nod` 单次点头；`/mascot action off` 停止手动巡演。空闲约 45 秒后首次播放轻量动作，之后约两分钟一次；关闭动画可以暂停。完整动作在 editor 布局显示，header 布局仍显示原头像循环。

DSH: 设置页“小动作模组”支持单次点选或循环全部；主动陪伴的挥爪、歪头、抖耳等也复用此模块，保留原有频率设置。

快捷入口：Pi 的 `/mascot menu` 或 `Ctrl+Alt+W` → “和呜咪玩个小动作”；DSH 的角色右键菜单提供挥爪、蹭蹭、抖耳和全部小动作循环。菜单在工作期间不会触发预览，也不会修改输入框内容。

DSH 高清资源按需加载时，同一个视频片段暂缺下一帧会保留上一张高清帧；新姿势加载时短暂保留当前画面，超过 650ms 则回退到真实目标状态的 indexed 帧，避免一直显示过期表情。过渡帧使用明确的目标姿势，避免把倾听动作区域套在普通素材上。拖动取消／丢失捕获会清理交互状态，鼠标悬停不再移动角色位置。

任务开始、提问、输入倾听和戳一戳优先，立即退出小动作。动作不会冒充任务完成、调用模型或更改草稿。四种画风都支持，旧画风缺失的局部动作区域采用已有基础姿势。

## 倾听素材尺寸

原倾听姿势眼距约 113.6px，普通姿势约 121px。绕鼻尖 `(288,318)` 放大 `1.065` 倍，保留 640px 画布，并同步闭眼帧、头部和耳朵动作区域。由高清母版生成 Pi 240/80px 与 DSH 640px 素材；不通过独立 CSS 缩放补偿。修正写入 `scripts/build_listen_reactions.py`，重建不会丢失。

English: The eight shared gestures use identical timelines and motion recipes on Pi and DSH. Use `/mascot action all`, a gesture ID, or `off` in Pi; DSH exposes the same catalogue in settings. Real work, questions, typing and pokes take precedence. Listening artwork is enlarged 6.5% around its existing nose anchor, with matching eyelids and rig coordinates.
