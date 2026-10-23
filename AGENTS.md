# 项目工作约束

涉及 Umi 设定图、素材、角色漫画或 PV 制作时，先读 docs/production/AGENTS.md 与 PRODUCTION-SPEC.md，再读对应的状态和评审记录。已批准插件素材的可复现来源保存在 Hi-Res/production 与 assets/animated/provenance；work 中的生成会话只作为本机历史，不是必需输入。

用户要求持续两路子智能体实际看图复核、按原二维设定与色卡核验、不把阴影当固有色、整张重生、分批交用户评审。不要只依赖聊天摘要或历史生成提示词。最近纠正：尾巴必须保留原白/浅灰/深灰分区，删除误加的蓝灰阴影色块；曾尝试的统一灰尾巴方案错误，已撤回。

全动态动作打磨还需读 docs/motion-polish.md。当前正式基线为 v2.5.0；首批 think/joy 新候选先经两路内部复核与原速旧新对照，再交用户评审。原生源服装暗面偏绿与外围低 alpha 绿点是两个问题；不得用技术蒙版检查通过冒充主体颜色通过，也不得擅自扩展旧片的特定艺术校色许可。

插件维护规则（2026-10-23）：main 独立发布全动态 v2.5.0，源码默认与 build/editions.json 均为 full-animation；legacy 分支独立维护 v2.4.1，仅优化代码，全部素材与简单帧保留 v2.4.0 原资源。main 不再发行高清重制产品线。使用 tools/build-editions.py 构建当前分支的 Pi 与 DSH 包，不得依赖旁边的 regular 工作树或 work 下历史 stage。像素仅保留 v2.4.0 原100px像素原画与旧简单帧；新版像素H3/插画缩图已撤下，不得随动画构建重新带回。两端在完整动画选帧前按edition/style分流，旧像素不启用完整动画。原始像素哈希在 build/legacy-pixel-provenance.json；变更后验证当前分支两个平台包及全部旧风格别名。已发布 v2.4.5 与 v2.5.0-preview.6 tag 保留历史，不移动或重写；先完成本次发行，再做后续代码或性能优化。

下载命名与发布线路：DSH附件以dsh-furry-partner-开头，Pi附件以pi-furry-partner-开头，内部插件标识保留升级兼容。main使用v2.5.x及后续标签；legacy未来仅使用legacy-v2.4.x，Release明确标注Legacy且latest=false；不重写历史标签或重复发布已有2.4.0／2.4.1。
