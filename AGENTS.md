# Pi 双产品维护规则

只在 main 维护产品代码。仓库根目录是 Pi 原资源版，editions/hd/ 是独立 Pi HD 源码；两套动作、状态机和播放器不相互导入。DSH 独立仓库不作为任何构建依赖。

原资源版保持全部 507 个 v2.4.0 原资源字节，新增功能只能适配已有简单帧。HD 保持已批准的 29 个动作和来源记录，资源制作与评审另遵循 editions/hd/AGENTS.md 及其生产规范。不得把 Legacy 的参数准备动作带入 HD。

CI · Pi original resources 验证根目录，CI · Pi HD 验证 editions/hd/。v<版本> 只发布原资源 ZIP 并设为 Latest；hd-v<版本> 只发布 HD 包且 latest=false。两套版本独立，标签均从 main 创建，不再要求维护 legacy/hd 发布分支。不移动或重写已存在的标签。
