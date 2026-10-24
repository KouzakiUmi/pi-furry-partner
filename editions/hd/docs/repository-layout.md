# main 上的两个独立源码根

[全部文档](../../../docs/README.md) · [发布规则](../../../docs/release-line.md) · [HD 架构](architecture.md)

```text
main
├── index.ts / lib / assets / package.json    原资源版
├── docs / CONTRIBUTING.md                   原资源版与全仓库入口
├── .github/workflows/ci.yml                 原资源 CI
├── .github/workflows/release.yml            v 标签／原资源 Latest
├── .github/workflows/ci-hd.yml              HD CI
├── .github/workflows/release-hd.yml         hd-v 标签／不设 Latest
└── editions/hd/
    ├── index.ts / lib/hd/                  独立 Pi HD 接入、状态和播放器
    ├── assets / Hi-Res / prompts           HD 素材与冻结来源
    ├── package.json / build / tools        HD 测试与构建
    └── docs / CONTRIBUTING.md              HD 文档
```

原资源版版本 2.5.1，14 个原版手动动作，四种原外观，507 个原资源文件；HD 源码 2.5.1-preview.6，单一插画风，17 个手动小动作／表情，29 个完整片段和 58 个索引入口。HD 尚未创建新的独立 Release。

根目录的 npm 命令与 Git 包安装默认选择原资源版。HD 命令先进入 editions/hd/；从仓库根安装本地 HD 时用 pi install ./editions/hd。仅给远程 Git URL 换 hd-v 标签并不会改根清单。

两个产品不互相引用状态机或播放器，包只包含自身运行时。原资源 ZIP 明确排除 editions/，HD 包不包含根目录原版。各自 CI 按目录触发，发布调用对应完整 CI。旧产品分支不作为维护或发布前提。

以下路径均相对 HD 源码根：assets/animated 保留运行帧与 provenance；Hi-Res/production 保存冻结源；tools/history 是历史迁移记录；work 和 dist 只是输出，不是源码依赖。构建不安装、推送或发布。DSH 的独立源码、包与文档见 https://github.com/KouzakiUmi/dsh-furry-partner。
