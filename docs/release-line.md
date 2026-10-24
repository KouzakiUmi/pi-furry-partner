# Legacy 独立发布线

本分支维护2.4.x，保留v2.4.0原始素材与简单帧，仅维护代码。本次稳定版本为2.4.3，待发布标签为 `legacy-v2.4.3`；后续标签继续使用 `legacy-v2.4.x`，先更新package与CHANGELOG后再打对应标签。发布校验要求标签精确匹配package版本，只接受2.4.2起的正式版本，拒绝预览版本、2.5及之后的版本，也不为已发布的2.4.0／2.4.1另建重复Release。

后续Release标题为 `Umi · Legacy legacy-v<版本> · 原资源维护版 · Pi`，附件为 `pi-furry-partner-legacy-<版本>.zip`。Legacy始终使用 `latest=false`，不会成为全动态新线路的默认下载入口。

现有历史标签和已发布附件不移动、不重写。本次仅调整未来发布规则，没有创建同版本重复Release。main全动态版自2.5开始，Pi附件使用 `pi-` 前缀，DSH附件使用 `dsh-` 前缀；Legacy本身仅提供Pi旧资源维护版。
