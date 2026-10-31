# Pi 原资源版与 HD

同一仓库保留两条独立代码线：main 根目录维护原资源与简单帧；同一分支 editions/hd 目录维护高清插画和完整动作。DSH 在 https://github.com/KouzakiUmi/dsh-furry-partner 独立维护。

## HD 代码边界

- `lib/hd/pi-adapter.mjs`：Pi 原生事件边界、参数流忽略策略、1200ms 默认展示时间和静态回退。
- `lib/hd/activity.mjs`：HD 自己的任务状态、2 秒工具间隙、并行工具、等待、取消、错误和开场／戳戳交互。
- `lib/hd/player.mjs`：29 个完整动作的选帧、真实播放时钟和键盘进入／循环／退出。
- `index.ts`：Pi 编辑器、输入、图像协议及上述 HD 模块的接入，不导入 Legacy 的 activity 或播放器。

HD 是独立源码副本，没有跨分支／相邻目录依赖，也不引入 Legacy 的工具参数准备姿态。通用 UI 和图像协议代码由 HD 自己维护，修复须分别移植并测试。资源加载失败时只显示未形变的 HD 静态姿态。网站演示是独立展示入口，不作为 Pi 生产播放器。

## 验证与构建

以下命令在仓库根目录先 `cd editions/hd` 后执行；不要在根目录运行来选择 HD。

```powershell
npm test
npm run build:animated
python tools/audit-edition-bundles.py --edition full-animation
```

当前源码版本为 2.5.1-preview.6。HD 标签必须为 `hd-v<package版本>`，正式版与预览版均为 `latest=false`，标签必须属于 main 分支。附件为 `pi-furry-partner-hd-full-animation-<版本>-pi-core.tgz`、校验文件和逐项报告。当前已发布 `hd-v2.5.1-preview.6`，Release 附 Pi 专用 tgz、校验文件与逐项报告，`latest=false`。

HD CI 只处理 main 分支的 HD 目录和对应 workflow 改动，分别验证 Pi 1.2.0 / 1.3.0 / 1.4.0、独立适配、29 个动作 / 58 个索引资源及安装恢复。资源哈希、来源与已批准素材保持不变，其余历史标签保留；v2.4.5 已按用户要求清理。
