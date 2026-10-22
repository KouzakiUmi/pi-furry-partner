# 可复现生产依据

本目录保留已经获准、需要随仓库恢复的生产依据。

- `ordinary-cape-20261022`：两段旧动作的校色前输入、用户批准记录、精确时序与变换参数。修正后的帧在 `assets/hires/umi`，终端派生帧在 `assets/reactions/umi`。
- `pi-header`：已经采用的三份标题帧文件及精确 SHA，包含未经新插画替换的原像素标题。

运行 `python tools/verify-approved-cape.py` 可以在不读取本机历史目录的情况下重算校色并验证所有 274 帧。
运行 `python scripts/restore_header_timeline.py` 只验证标题；加 `--apply` 才恢复已经批准的相同文件。

大型生成会话、失败候选及原始视频仍保留在本地 `Hi-Res/sources` 和 `work`，不属于构建输入。当前完整动画的可复现像素来源及证明在 `assets/animated`，见 `docs/animated-source-provenance.md`。
