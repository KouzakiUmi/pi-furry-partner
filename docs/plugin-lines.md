# Pi 产品线与构建

本仓库只维护 Pi：`main` 为高清／全动态版，当前源码版本 `2.5.1-preview.6`；`legacy` 为保留原资源及简单帧的 2.4.x 维护线。DSH 已独立到 [dsh-furry-partner](https://github.com/KouzakiUmi/dsh-furry-partner)，有自己的源码、测试、包和发布流程。

## main

```powershell
npm test
npm run build:animated
python tools/audit-edition-bundles.py --edition full-animation
```

`build/editions.json` 只配置 Pi 平台。`build:all` 与 `--platform all` 只构建本仓库配置的 Pi 包，不再生成 DSH 包。Pi 动作播放器、最短展示时间、键盘进入／循环／退出、两秒动作保留和原生互动保持自己的调度规则。

产物是 `pi-furry-partner-full-animation-<版本>-pi-core.tgz`、SHA-256 和逐项报告。构建不覆盖旧产物；复测时使用 `--out` 指定独立目录。`v2.5.x` 及后续主线标签只发布 Pi 产品；此次拆分不提高高清版版本号。

## Legacy

legacy 独立维护 Pi 旧资源版，标签为 `legacy-v2.4.x`，附件为 `pi-furry-partner-legacy-<版本>.zip` 与 SHA-256，始终 `latest=false`。CI 验证 Pi 1.2.0／1.3.0、发布线与标签匹配、安装恢复，以及 507 个 v2.4.0 原资源文件的精确哈希。

Legacy 的流式工具准备姿态只使用原有简单帧，不混入主线完整动作链，也不包含 DSH 运行时。

## 历史与资源

已有标签、附件、来源与审批记录保留原样，不移动或重写。主线公开外观仍只提供插画，旧像素配置迁移到插画；原资源产品由 legacy 提供。DSH 项目保留了独立的动作与素材副本及来源哈希，构建不再读取相邻 Pi 仓库。

源码中的原画、来源和历史校验资料用于可复现验证，不代表 Pi 分发包包含 Web 高清媒体或 DSH 插件。此次迁移没有代为更改本机安装。
