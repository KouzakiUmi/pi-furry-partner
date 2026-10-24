# HD 小动作定义与完整片段

[HD 指南](guide.zh-CN.md) · [表情](authored-expressions.md) · [架构](architecture.md)

本页相对路径以 editions/hd/ 为根。lib/gestures.mjs 是本产品独立维护的 17 项小动作元数据，不与根目录原资源版或 DSH 共享可变源码。菜单和 /mascot action 的补全从此表生成。

| 小动作 | 当前批准片段时长 |
| --- | --- |
| wave、nod、peek、stretch、ear-flick、nuzzle、bounce、head-shake | 各 4458ms |
| joy、grumpy、sad、cry、shy、flustered、surprise、proud、affection | 各 4458ms |

实际播放由 assets/animated/catalog.json 的已批准 periodMs 覆盖早期 durationMs 名义值，不能把旧 2.6／3.2 秒配方当作当前完整动作的结束时间。29 个完整片段还包括状态、三条待机和键盘过渡；不是 29 个手动命令。

使用 /mascot action nod 或 action shy 单次播放，action all 循环，action off 停止；也可从菜单选择。真实任务、提问、输入与主动互动优先，不修改草稿或提交模型请求。header 布局使用独立标题，完整角色动作在 editor 展示。

原资源版的 action 列出其自身 14 个动作／状态，不接受本表所有 ID。DSH 在独立仓库维护自己的相同来源副本，相关设置和 API 不在此文配置。旧骨骼配方、四风格支持与浏览器缓存说明属于历史设计，不作为当前 HD 原画回退实现。
