# Pi HD 贡献与验证

[HD 首页](README.md) · [用户指南](docs/guide.zh-CN.md) · [全部文档](../../docs/README.md) · [统一发布](../../docs/release-line.md)

本页所有命令与相对路径都以 `editions/hd/` 为当前目录。产品源码统一在 main；无需维护独立 hd 分支。根目录原资源版与本目录的状态、动作、播放器和包独立，修复分别移植与测试。DSH 的 Host／Client 不在本仓库维护。

## 本地检查

使用满足 package 要求的 Node.js（CI 为 Node 24），以及 tools/requirements-validation.txt 中的 Python 验证依赖。Pi 模块分别验证 1.2.0 与 1.3.0；不要依赖个人机器上的特定启动器布局。

```powershell
python -m pip install -r tools/requirements-validation.txt
npm install --prefix work/pi-runtime --no-save --no-audit --no-fund @earendil-works/pi-coding-agent@1.3.0 @earendil-works/pi-tui@1.3.0
$env:PI_TEST_MODULES = Join-Path $PWD 'work/pi-runtime/node_modules'
$env:PI_TEST_VERSION = '1.3.0'
npm test
pwsh -NoProfile -File tests/installer.ps1 -WorkDir work/installer-core
powershell.exe -NoProfile -File tests/installer.ps1 -WorkDir work/installer-desktop
```

替换两个包版本与 PI_TEST_VERSION 后验证 1.2.0。安装测试只使用隔离目录，不向用户真实配置安装。完整套件包含实际 Pi 编辑器、鼠标、协议与动作路径；不得把模拟传输或检查报告写成所有终端目视验收通过。

## 代码与动作

`lib/hd/pi-adapter.mjs` 是唯一 Pi HD 事件边界；`lib/hd/activity.mjs` 保留真实状态、墙钟截止和互动；`lib/hd/player.mjs` 维护完整帧选取、可见时间与键盘链。不要重新引入 `lib/activity.mjs`、旧通用形变播放器或根目录原资源运行时。

17 个可点选动作从 lib/gestures.mjs 生成补全；29 个完整片段及真实时长来自 assets/animated/catalog.json。普通驻留、工具间隙、等待、报错、暂停和加载失败分别验证；无完整素材时使用 HD 原画静态姿态。

## 构建与发布

```sh
npm run build:animated
python tools/audit-edition-bundles.py --edition full-animation
npm run build:site
npm run test:site
```

构建与审计均使用本目录源码和冻结素材，不读取相邻工作树或本机旧 work。产物在本目录 dist/releases，前缀 pi-furry-partner-hd；源码版本为 2.5.1-preview.6，尚未创建新的独立 HD Release。构建不会安装或发布。未来从 main 打 hd-v<HD package版本>，只触发 HD 发布，始终 latest=false。

## 素材与来源

本次文档维护不授权重建或改写素材。素材制作必须先读 AGENTS.md、docs/production/AGENTS.md 和 PRODUCTION-SPEC.md，遵守原设定、两路实际复核与用户评审门。来源与批准数据保留精确字节；历史 work 路径是证据，不是构建输入。见[来源说明](docs/animated-source-provenance.md)。

tools/history 仅为历史迁移记录，不在当前树上直接重跑。视觉验收工具的命令在本目录执行；工具启动后按规范及时结束自有会话，不误杀其他项目。

## 文档与报告

更新中英文用户指南及实际支持的命令，不写 DSH 安装步骤，不将旧包名或旧分支写成当前入口。日期性评审与来源记录保留历史标识。代码／文档为 Apache-2.0；角色素材遵守 ASSET_LICENSE.md。
