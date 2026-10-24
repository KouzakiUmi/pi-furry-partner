# Pi 原资源版发布规则

Pi 项目仅维护 v2.4.0 原资源和简单帧动作逻辑，保留后续兼容、流式工具准备和渲染修复。main 与 legacy 使用相同的 Pi 产品源码；DSH 在 https://github.com/KouzakiUmi/dsh-furry-partner 独立维护。

当前正式版本为 2.5.1。后续正式版本使用 `v<package版本>` 标签，附件名为 `pi-furry-partner-<版本>.zip` 及 SHA-256 文件，并设为 Latest。发布 CI 校验标签、CHANGELOG、main 分支祖先关系、Pi 包边界和全部 507 个原资源文件。预览版本、旧 legacy-v 标签和缺少版本说明的发布均被拒绝。

旧高清版及 legacy-v2.4.3 的 GitHub Release 已清理；历史 Git 标签保留，不移动、不重写。
