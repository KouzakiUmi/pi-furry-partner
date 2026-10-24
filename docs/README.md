# 文档入口

当前维护结构：只维护 `main`。根目录为原资源版 **2.5.1**，`editions/hd/` 为独立 HD 源码 **2.5.1-preview.6**；HD 当前没有新的独立 Release。两套运行时代码、动作定义、测试和包互不导入。DSH 在 [dsh-furry-partner](https://github.com/KouzakiUmi/dsh-furry-partner) 独立维护。

| 用途 | 原资源版 | HD |
| --- | --- | --- |
| 首页 | [中文](../README.md) / [English](../README.en.md) | [中文](../editions/hd/README.md) / [English](../editions/hd/README.en.md) |
| 使用 | [中文指南](guide.zh-CN.md) / [English guide](guide.en.md) | [中文指南](../editions/hd/docs/guide.zh-CN.md) / [English guide](../editions/hd/docs/guide.en.md) |
| 开发 | [贡献指南](../CONTRIBUTING.md) / [架构](architecture.md) | [贡献指南](../editions/hd/CONTRIBUTING.md) / [架构](../editions/hd/docs/architecture.md) |
| 发布 | [统一发布规则](release-line.md) | [HD 构建说明](../editions/hd/docs/plugin-lines.md) |

原资源版 `action` 列出 14 个原版动作／状态；HD `action` 列出 17 个小动作／表情，底层另有 29 个完整动作片段。三个数字含义不同，不能互换动作 ID。

`v<版本>` 发布原资源 ZIP 并设为 Latest；`hd-v<版本>` 发布 HD 包且 latest=false。源码安装 HD 时需指定本地 `editions/hd/`，直接安装仓库 Git URL 会读取根目录原资源版清单。两种版本择一安装，不能重复加载。

带日期的制作、校色、迁移记录是历史证据；文首已标注当前状态与适用范围。`assets/`、`prompts/`、HD 的 `Hi-Res/` 及 provenance 文件属于冻结来源材料，不通过文档整理改写其字节。已有标签和发布附件保持原样；当前用法以本入口、两份用户指南和统一发布规则为准。
