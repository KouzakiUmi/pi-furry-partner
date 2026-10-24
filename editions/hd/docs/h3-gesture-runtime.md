# Pi HD 完整帧播放与兼容数据

[架构](architecture.md) · [来源](animated-source-provenance.md) · [小动作](shared-gesture-modules.md)

本页描述 editions/hd/ 的 Pi 生产路径。DSH 的浏览器下载、Host API、高清帧 LRU 和拖动交互在独立仓库维护；本仓库不提供这些服务。

## 当前生产格式

assets/animated/catalog.json 是 29 个完整片段的入口，绑定 revision、QA、画布、绘制范围、真实时长和资源哈希。58 个逻辑索引入口覆盖插画兼容名称；实际物理索引文件可共用同一批准字节。读取路径必须通过版本和白名单校验。

lib/approved-motion-codec.mjs 解码索引二进制；lib/approved-motion-node.mjs 处理 Node 压缩资源；lib/hd/player.mjs 维护选片、完整时钟和有界缓存。Pi 从本地包加载索引帧，通过 Kitty、Sixel 或字符绘制，不向旧 DSH API 请求资源。

## 播放约束

- 最短普通展示从首帧实际可见起算，1200ms；键盘进入 400ms、可读循环至少 800ms、退出 400ms。
- 三条待机完整原生循环，不冻结最后一帧来凑驻留时间。
- 真实工具结束即时更新 phase/toolCount；显示只保留安全阶段至多 2000ms，连续同片段保持原时钟。
- 问题、回答、失败反馈、取消、切换和原生互动按优先级接管；隐藏／暂停不冻结业务截止。
- 加载失败有界回退，使用 HD 原画静态姿态，不套原资源版局部形变、光流或帧间混色。

lib/gesture-video.mjs 与 assets/reactions/umi 中还保留早期兼容数据，用于姿态与历史来源；旧 gesture-videos.json 不替代当前 approved catalog，也不把旧名义动作时长当作生产完整片段时长。

## 验证

在 HD 目录运行 npm test，包含真实 Pi 动作路由、时间、工具间隙、错误、开场／戳戳、路径与内存边界。npm run build:animated 和审计工具对提取包逐项回读。像素和技术检查不替代新增美术的两路实际复核及用户评审。
