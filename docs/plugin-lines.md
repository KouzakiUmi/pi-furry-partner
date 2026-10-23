> 当前发布候选为Main **2.5.1-preview.1**，Legacy维护版为 **legacy-v2.4.2**。下文2.5.0／2.4.1记录保留历史基线。

# 呜咪插件：全动态与原资源维护分支

`main` 独立发布全动态 **v2.5.0**；[legacy 分支](https://github.com/KouzakiUmi/pi-furry-partner/tree/legacy)独立维护 **v2.4.1**，只优化代码，保留 v2.4.0 全部原素材与原简单帧。main 不再发行高清重制产品线。

| 分支 | 插画动作 | 像素画风 |
| --- | --- | --- |
| main · 全动态 v2.5.0 | 17 段完整动作与 2 段键盘过渡 | v2.4.0 原始像素与原简单帧 |
| legacy · v2.4.1 | v2.4.0 原始素材与原简单帧 | v2.4.0 原始像素与原简单帧 |

本次正式发行沿用已经验收的全部动作和资源；后续优化在发布后进行。已发布的 v2.4.5 与 v2.5.0-preview.6 保留为历史，tag 不移动、不重写。

## main 构建

所有运行时源码、全动态插画与原始像素素材均在当前仓库。新构建不读取旁边的 regular worktree 或 work 下历史 stage；旧目录和安装包保留作历史回退。

```powershell
npm run build:animated     # 全动态版：Pi + DSH 两个包
npm run build:all          # 当前分支配置的全部产品与平台；main 为上述两个包
npm run build:pi           # Pi 精简包，省去 Web 高清位图
npm run build:packages:dsh # DSH 完整高清资源包
```

版本号与默认 edition 配置在 `build/editions.json`；main 源码默认使用全动态逻辑。`tools/build-editions.py` 验证源码的默认 edition 与配置一致，在 `dist/staging` 内生成发行配置与客户端，不反向修改源码。edition 参数从当前分支配置读取。

安装包与逐项哈希报告输出到 `dist/releases`，不会覆盖已存在的包。如同版本重新构建，请用 `--out` 指定另一个输出目录。

只准备隔离目录并执行当前分支回归：

```powershell
python tools/build-editions.py --edition all --platform all --prepare-only --test
```

测试使用本机安装的 Pi runtime；需要固定测试基线时设置 `PI_TEST_MODULES`。归档构建后，运行 `python tools/audit-edition-bundles.py --edition full-animation` 核验两个平台的真实包与解包读取器。仅准备目录的测试不代表已完成归档审计或真实宿主视觉验收。

## 资源与兼容

main 的全动态包只含插画 indexed 与高清 WebP，不包含新版像素 indexed。像素在 Pi、DSH 均在动作选择前绕过全动态路径。

原像素来自 v2.4.0：100×100 原画、16 个基础表情、戳碰补丁，以及 15 帧／4800ms 像素标题。文件出处与 SHA-256 在 `build/legacy-pixel-provenance.json`。素材导出脚本不得生成新版像素衍生图或覆盖原始像素／像素标题。

界面只展示插画、像素两种风格；`wumi`、`wumi-pixel`、`pixel`、`illustration` 等旧风格名称继续作为输入别名兼容。普通简单运动辅助代码保留给像素与明确的回退场景，不能据此把 main 重新宣称为旧资源发行版。

## 下载附件与发布标签

新构建按宿主明确命名：Pi 为 `pi-furry-partner-full-animation-<版本>-pi-core.tgz`；DSH 为 `dsh-furry-partner-full-animation-<版本>.tgz`。对应 SHA-256 与 report 使用相同前缀。附件名用于区分宿主，内部插件标识保持兼容，现有配置不因下载命名改变而另建一份。

`main` 使用 `v2.5.x` 及后续版本标签，Release 标题明确显示 `Main · 全动态重做版 · Pi / DSH`。`legacy` 独立使用 `legacy-v2.4.x` 标签，Release 标题显示 `Legacy · 原资源维护版 · Pi`，ZIP 为 `pi-furry-partner-legacy-<版本>.zip`，且始终不占用 GitHub Latest。各分支的发布校验拒绝不属于该线路的标签。

已发布的 `v2.4.0`、`v2.4.1`、`v2.4.5`、`v2.5.0-preview.6`、`v2.5.0` 保留原指向与原附件作历史。新规则在各线路的后续提交和标签生效，不移动旧标签，也不创建同版本重复 Release。

## 安装与升级

历史 main v2.5.0 附件仍为 `pi-furry-partner-full-animation-2.5.0-pi-core.tgz` 与 `pi-furry-partner-full-animation-2.5.0.tgz`，后者是当时的 DSH 完整包。新构建的 DSH 附件改用上述 `dsh-` 前缀。legacy v2.4.1 仅支持 Pi，使用 ZIP 解压后运行 `install.ps1`；其安装细节以分支说明为准。同一宿主仅安装一个版本。

已安装 preview.6 时仍须下载 2.5.0 包重新安装：Pi 关闭后运行新包内 `install.ps1`，保留已有 2.x 配置与备份恢复基线；DSH 通过其插件命令安装新完整包。更新后重启对应宿主。发布 tag 不会自动更新本机安装。

构建不安装、不推送、不发布；发布、本机安装与真实宿主验收分别记录。
