# 单仓库维护与构建

正式源码为本仓库根目录。`index.ts` 是 Pi 入口，`lib/index.js` 与生成的 `lib/client.js` 是 DSH 入口；公共状态、动作、文案、绘制和修复在 `lib` 中维护。

`build/editions.json` 同时定义产品版本与平台：

| 产品 | Pi | DSH |
| --- | --- | --- |
| 原逻辑高清重制 | 原逻辑 + 终端索引资源 | 原逻辑 + 高清透明资源 |
| 全动态重做 | 完整动画的终端索引资源 | 完整动画的高清透明资源 |

一个版本只改一套源码。构建阶段写入版本开关，Pi 资源包省去网页高清帧；两端均共用唯一的原始像素画风。旧 regular 工作树及 `work/animated-remake` 不再是构建输入。

- `assets`：运行资源及完整动画验证依据。
- `Hi-Res/approved-static-20261018`、`Hi-Res/poses-640`：已采用静态源及注册依据。
- `Hi-Res/production`：随仓库保存的已批准修复输入。
- `Hi-Res/sources`：只将原设定、色卡和最初认可的九格源纳入版本控制；大型会话历史保留本地。
- `tools/history`：一次性迁移过程记录，不是可运行的当前构建入口。
- `work`、`dist`：试验、验证输出和安装包，不作为源码依赖。

`npm run build:all` 生成四种交付组合；只校验可用 `python tools/build-editions.py --edition all --platform all --prepare-only --test`。构建不会自动安装、推送或发布。

合并不表示每项美术动作已经重新设计完毕。普通高清版的旧局部耳／爪变形仍有单独校准尾项，见 `ordinary-motion-audit-20261022.md`；它们不阻止两条产品线在本仓库共同维护。
