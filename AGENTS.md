# 项目工作约束

涉及 Umi 设定图、素材、角色漫画或 PV 制作时，先读 work/pv-adventure-20261021/AGENTS.md 与 PRODUCTION-SPEC.md，再读对应 STATUS.json 和 review.json。

用户要求持续两路子智能体实际看图复核、按原二维设定与色卡核验、不把阴影当固有色、整张重生、分批交用户评审。不要只依赖聊天摘要或历史生成提示词。最近纠正：尾巴必须保留原白/浅灰/深灰分区，删除误加的蓝灰阴影色块；曾尝试的统一灰尾巴方案错误，已撤回。

插件维护规则（2026-10-22）：高清重制与全动态版本在本仓库共用源码，通过 build/editions.json 和 tools/build-editions.py 区分构建。不得重新依赖旁边的 regular 工作树或 work 下历史 stage。像素仅保留 v2.4.0 原100px像素原画与旧简单帧；新版像素H3/插画缩图已撤下，不得随动画构建重新带回。两端在完整动画选帧前按edition/style分流，旧像素不启用完整动画。原始文件哈希在 build/legacy-pixel-provenance.json；变更后验证两个隔离构建及全部旧风格别名。
