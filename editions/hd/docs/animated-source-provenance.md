# 全动态素材的仓库内来源

`assets/animated/catalog.json` 的每个 `hires.frames[]` 现在提供 `sourceAsset`：

- `path` 是仓库根目录下的相对路径，指向该帧已经发布的无损 WebP。
- `webpSha256` 绑定文件字节；`decodedRgbaSha256` 绑定解码后的 RGBA 像素字节。
- 两个哈希沿用现有帧记录，未重新定义批准像素、帧顺序、时间或 QA。

这些 WebP 是仓库内重打包、生成索引帧和验证像素的确定输入。重新生成 H3 视频或重新执行历史校色实验是另一个流程，不能仅凭这些发布帧复原全部历史步骤。

原 `sourceRgbaPath` 保留为历史出处，包括旧机器上的 x20 输出路径；它不是构建依赖，验证脚本不访问该路径。`sourceAssetPolicy` 明确记录这一约定。迁移没有修改历史路径、图片或既有 QA。

## 批准与编码证据

下列文件从历史动画工作区按原始字节恢复，其 SHA-256 必须与 catalog 中已经记录的值一致：

| 文件 | SHA-256 |
|---|---|
| `assets/animated/provenance/approved-color-map.json` | `dc7cf52f738f5a73461fe1d76d9ffcd658f692b4248e6454f01bef7e4c5f9cd2` |
| `assets/animated/provenance/lossless-codec.json` | `bd1af6e8d46b746d3b2b203980d0350cd0230e0281dc004beb8b6f9cea638956` |

已有 `assets/animated/provenance/indexed-binary.json` 继续由原 catalog 哈希绑定。证据内的历史路径只描述原处理环境；不要为了迁移修改证据字节，否则会破坏原批准记录的哈希绑定。

## 独立验证

在安装了 Pillow 的 Python 环境中运行：

```text
python tools/verify-animated-provenance.py
```

脚本只读验证三份证据文件、所有帧的仓库内路径、WebP 文件 SHA 和解码 RGBA SHA。它拒绝绝对路径与目录穿越，不访问 regular 工作树、旧动画 stage 或 x20，且不修改文件。
