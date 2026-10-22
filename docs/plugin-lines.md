# 呜咪插件：一个仓库，构建时选择版本

所有维护中的源码、高清重制素材、全动态插画与原始像素素材均位于本仓库。
新构建不读取旁边的 regular worktree 或 work/animated-remake；旧目录和安装包保留作历史回退。

| 构建 | 插画动作 | 像素画风 |
| --- | --- | --- |
| 原逻辑高清重制版 | 原简单帧与交互、固定眼区眨眼、修复后的生气配色 | 原始像素与原简单帧 |
| 全动态重做版 | 17段完整H3动作与2段键盘过渡 | 共用同一份原始像素 |

旧像素来自v2.4.0：100×100原画、16个基础表情、戳碰补丁，以及15帧／4800ms像素标题。
不是新插画缩图。文件出处与SHA-256记录在build/legacy-pixel-provenance.json。
旧风格名称作为输入别名兼容，界面只展示插画、像素两种。

## 构建

在仓库根目录运行：

```powershell
npm run build:hd           # 高清重制版：Pi + DSH 两个包
npm run build:animated     # 全动态版：Pi + DSH 两个包
npm run build:all          # 两种版本 × 两个平台，四个包
npm run build:pi           # 两个 Pi 精简包，仅省去 Web 高清位图
npm run build:packages:dsh # 两个 DSH 完整资源包
```

版本号统一配置在build/editions.json。共用源码默认使用高清重制逻辑。
tools/build-editions.py在dist/staging内生成发行配置和客户端，不反向修改源码。
安装包及逐项哈希报告输出至dist/releases；不会覆盖已存在的包。
如同版本重新构建，请用`--out`指定另一个输出目录，或先调整edition版本号。

只准备隔离目录并执行两版本回归：

```powershell
python tools/build-editions.py --edition all --platform all --prepare-only --test
```

测试使用本机安装的Pi runtime，需要固定测试基线时设置PI_TEST_MODULES。

普通高清版保留整张姿势图的原整体运动与开闭眼节拍；`approvedWholeFrames` 只禁止沿用旧局部区域变形，不再把整张图锁死。放大镜／搜索等已烘焙影片与全动态版不叠加这层运动。具体边界见 [旧动画核对](ordinary-motion-audit-20261022.md)。

## 资源与安装边界

高清重制包不含完整动画catalog和资源。全动态包只含插画indexed与高清WebP，去掉新版像素indexed。
像素在Pi、DSH均在动作选择前绕过全动态路径；暂停、切换、旧动作逻辑保持独立。
开闭眼保留修复、DSH静态标题、无输入框组件、生气校色进入共用源码。

两种包使用同一个插件名；安装时选择一个，后装的会替换先前版本。
构建不安装、不推送、不发布。真实宿主视觉验收仍需安装后进行。

素材导出脚本仅更新插画资源，不再生成新版像素衍生图或覆盖原始像素／像素标题。
