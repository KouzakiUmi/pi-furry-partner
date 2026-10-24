# 单分支、两套独立产品与 CI

只在 main 维护产品代码：根目录是原资源版，editions/hd/ 是 HD 独立源码，不再要求同步 legacy 与 hd 分支。两套动作注册、状态机、播放器、测试和安装包不相互导入。DSH 在自己的仓库维护。

| 产品 | CI | 标签 | 附件 | Latest |
| --- | --- | --- | --- | --- |
| 原资源版 | CI · Pi original resources | v<根目录 package 版本> | pi-furry-partner-<版本>.zip 与 SHA-256 | true |
| HD | CI · Pi HD | hd-v<editions/hd/package 版本> | pi-furry-partner-hd-…tgz、SHA-256 与审计报告 | false |

两套 CI 按目录触发；标签发布总会调用对应产品的完整 CI。标签版本须匹配对应 package 与 CHANGELOG，标签提交须属于 main。原资源 ZIP、npm 文件清单和安装器排除 HD 目录；HD 从 editions/hd/ 独立构建。一次只安装一种 Pi 版本。

当前原资源版为 2.5.1，补齐 action 的有限播放、all/off、任务抢占和按实际动作集生成的分层补全。HD 仍为 2.5.1-preview.6，保留 29 个已批准完整动作，此次未改动 HD 素材或动作调度。原资源版仍校验全部 507 个 v2.4.0 原资源文件。

历史 legacy-v2.4.x 发布保留。旧高清 Release 与 v2.4.5 标签已按用户要求清理，其余历史标签不移动或重写。
