# DSH 呜咪主动陪伴 / Desktop companion

This local companion layer never sends messages, invokes models, moves the pointer, or changes an agent's task state.

## 互动方式

- 在头部区域左右移动鼠标，累积轻抚后触发蹭蹭与随机回应；单击仍是戳一戳，按住拖动仍是移动角色。
- 工作时摸摸会使用简短的工作台词，保留真实任务表情。
- 空闲约 45 秒后首次主动打招呼，随后轮换挥爪、伸展与歪头探看。
- “偶尔撒娇”后续间隔约 100–140 秒；“活泼一些”为 45–85 秒。
- 离开窗口至少一分钟，再回来时打招呼；五分钟内不重复欢迎。
- 约半小时的空闲检查可以给出一次轻量伸展／休息邀请，不弹系统通知。

## 优先级与开关

工作、回答、提问、打字倾听、戳一戳、演示动作优先于主动撒娇。主动动作不冒充真实任务完成，不修改状态机。

DSH 设置中的“主动陪伴”提供安静陪伴／偶尔撒娇／活泼一些，保存字段为 `companionship: off | gentle | lively`，默认 gentle。安静模式仍允许用户主动摸摸和戳一戳。

窗口隐藏或失去焦点、桌宠收起、关闭动画或桌宠时暂停主动行为。静音气泡时动作仍可播放；系统减少动态效果时禁用新增 CSS 摇摆动画。

## English

Stroke Umi's head by moving the pointer across the upper character area. Click to poke; drag to reposition. Idle waves, stretches and curious peeks have cooldowns. A welcome-back appears only after an absence of at least one minute, at most once every five minutes. Quiet mode disables unsolicited interactions while retaining user-initiated pats. Work, questions and typing always take precedence.

Implementation: `lib/dsh-companion.mjs` (pure scheduling), `lib/dsh-client-source.js` (presentation and pointer/focus events), `lib/index.js` (persisted setting). Build the client after edits. Tests: `node tests/dsh-companion.mjs` and existing DSH host/client/bridge suites.
