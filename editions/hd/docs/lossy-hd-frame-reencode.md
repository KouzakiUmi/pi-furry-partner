# 已批准高清帧的有损重编码方案

> 本文记录 DSH 仓库（dsh-furry-partner 2.5.1-preview.8）2026-10-27 实际执行的流程与实测数据，供 Pi HD 参考。Pi HD 的 `assets/animated/catalog.json`、`indexed/umi/*.uix.gz`、`verify-approved-color-consistency.py` 与 DSH 同构，字段名与批准链结构一致，方案可直接套用；下面的数字来自 DSH，Pi HD 需自行测量。
>
> 适用范围：仅 `assets/animated/hires`（运行时实际服务的高清帧）。`Hi-Res/` 是冻结基线，不动。

## 为什么会有这个方案

`assets/animated/hires` 的帧是无损 WebP。896px 单帧约 236 KB，3048 帧合计 718 MB，占发布包体积的主要部分。无损 WebP 已无可压缩空间（gzip 后仅从 717.9 MB 降到 717.9 MB），再压只能换成有损编码。

换有损编码会改变已批准素材的像素，这需要用户明确授权，并同步重建批准记录。授权后按本文流程执行，不会丢失批准证据。

## 核心结论：alpha 必须逐字节不变，RGB 可以量化放宽

重编码前先确定哪些不变量绝不能破。实测与批准链分析得出：

- **alpha 通道必须逐像素完全相同**。它决定合成器的轮廓与半透明边缘，任何偏差都会在动起来时可见。
- **RGB 可以有损**。q90 对不透明区域的影响远小于半透明区域，而半透明区域的误差在合成后按 alpha 衰减。

实测分层误差（`work` 片段首帧，896×896）：

| alpha 区间 | 像素数 | PSNR | 最大偏差 |
| --- | --- | --- | --- |
| 255（完全不透明） | 200251 | 38.18 dB | 64 |
| 128–254 | 9826 | 32.91 dB | 67 |
| 1–127（极透明） | 17415 | 22.23 dB | 255 |

不透明区域本身就有 37–38 dB，极透明区域虽然只有 21–30 dB，但那些像素合成后只贡献 alpha/255 的比例。所以**验收不能用未加权的 RGB 误差**，否则会被几乎看不见的像素拖死，误判为好方案不可行。

## 编码参数

```python
Image.save(out, 'WEBP', lossless=False, quality=90, method=6, exact=True, alpha_quality=100)
```

- `quality=90`：实测最优折点。q80 只多省 24% 体积，但 ΔE 从 1.57 升到 2.01；q100 体积涨 61%，PSNR 只提升 2.4 dB。
- `method=6`：最慢但压缩率最高，全量耗时约 15 分钟可接受。
- `alpha_quality=100` 与 `exact=True` **并不能保住 alpha=0 的 RGB**。这是有损 WebP 的固有限制，实测三种参数组合都失败。这一项直接决定了验收标准必须改写（见下）。

实测全语料结果（3048 帧）：718 MB → 180 MB，4.00×；alpha 加权 PSNR 均值 38.72 dB、最低 36.13；`alphaEqual` 全部为 true。

## 五个必须一起改的地方

只改帧文件会立刻破坏批准链。以下五处需同步，顺序执行：

### 1. 帧文件

用 `scripts/reencode-approved-hires.py --check` 先看预计收益，再 `--apply --workers N` 落盘。脚本内置逐帧 `np.array_equal(before_alpha, after_alpha)` 断言，不满足直接抛错而不是静默放过。

### 2. catalog 帧哈希

每帧三个字段随字节变化：`webpSha256`、`decodedRgbaSha256`、`sourceAsset.{webpSha256,decodedRgbaSha256}`。

**`rgbaSha256` 不要改。** 它记录的是批准时刻的像素哈希；改了就等于伪造批准记录。同理 `originalSourceRgbaSha256`、`approvedColorCandidateWebpSha256` 保持不变。判据：重写后与 `Hi-Res/catalog.json` 逐字段比对，除上述三个字段外必须零差异（DSH 实测 25500 个字段零差异）。

**`catalog.revision` 也不要动。** 运行时用 `raw.revision === catalog.revision` 校验 indexed 载荷，改 revision 会强制重建 29 个 `.uix.gz`（每个内嵌 revision）并重写批准记录。代价远大于收益，唯一影响是老用户的 `cache-control: immutable` 高清帧不会被刷新，仍是更高画质的无损版本——不是正确性问题。

序列化必须保持原样：`json.dumps(obj, ensure_ascii=False, separators=(',',':')) + '\n'`。用 `indent=1` 会产生 5 万行无意义 diff。

### 3. 验收断言

原断言是「整幅 RGBA 精确相等」以及「alpha=0 处 RGB 精确相等」。有损编码做不到后者，改为：

- **alpha 逐字节相等**（不放宽）
- **alpha 加权 PSNR ≥ 35 dB**、**alpha 加权 ΔE ≤ 2.2**（仅对 RGB）

加权方式：`Σ(Δrgb² · α) / (Σα · 3)`，其中 `α = alpha/255`；ΔE 用 CIELAB 并同样按 α 加权。阈值取实测最差值再留余量（DSH 实测最差 35.58 dB / 1.94）。

### 4. 从基线重建批准像素

这是让批准链继续有效而不伪造哈希的关键。批准时的像素不是"丢失的文件"，而是可复现的：

```
Hi-Res/hires/<clip>/<frame>.webp  →  frozen-v1.transform  →  [affection 追加 frozen-a02]  →  批准像素
```

DSH 实测：3 个片段的 `frozen-v1` 重建结果与 `derivation.json` 里记录的 `approvedDecodedRgbaSha256` 完全一致，且重建后的 alpha 与 q90 帧的 alpha 逐像素相同。所以校验器应当断言「重建像素 vs 出厂帧」，而不是断言「出厂文件哈希 == 某个已不存在的字节串」。

有一个**必须原样复刻的历史行为**：`frozen-v1.py` 里

```python
visible = smooth(a[:, :, 3], 16, 160)   # a[:, :, 3] 是 uint8
```

`alpha - 16` 在 uint8 下发生回绕，alpha < 16 时 `visible` 变成 1.0 而不是 0。这看起来像 bug，但它就是批准链实际基于的算法——**照抄，不要修**。移植到其他实现（GPU、Rust、C）时必须复刻这个回绕语义，否则重建结果对不上。

### 5. 来源清单

`SOURCE-PROVENANCE.json` 的策略通常是"原始哈希不变，授权改编单独绑定当前哈希"。重编码后：

- `copiedFileSha256` 里 3048 条帧记录**保持原值**——它们记录的是"批准的是什么"。
- 把这些路径加入 `localAdaptations`，`adaptedFileSha256` 绑定当前 q90 字节。
- 逐帧的前后哈希对写入 `provenance/lossy-q90-reencode.json`，这样即使原件不在仓库里，任何帧都能双向追溯。

## 性能：先测非帧部分

DSH 在这上面踩过坑。校验器总耗时 129 s，其中 96 s 花在**与帧无关的代码**上——`noncolor()` 对每个片段（约 11 MB 像素数组）做 `copy.deepcopy` 再丢掉像素字段，纯浪费。改成重建字典、不复用像素数组后降到 0 s。

排查顺序建议：

1. 先把帧校验替换成空函数跑一遍 `run()`。若仍然很慢，问题不在帧。
2. 分段计时 decode、deepcopy、JSON 序列化。
3. 解码 3048 帧本身只需 36 s（12 ms/帧），进程池可降到 11 s。若你的总耗时是几分钟量级，瓶颈几乎一定在别处。

第 4 步的重建是唯一真正需要逐帧计算的部分（numpy 约 115 ms/帧）。DSH 的处理是：**alpha 与帧绑定覆盖全部 3048 帧，RGB 重建按固定步长抽样 278 帧**（另有每片段首帧必查）。alpha 才是强约束，RGB 有容差，抽样足以覆盖。

若本机有 ROCm/CUDA，重建可上 GPU（DSH 实测 8 ms/帧，14 倍）。但必须提供一致性自检——DSH 的做法是 `--check-gpu` 抽样 58 帧逐位比对 CPU 实现，不通过就不采用。CI runner 没有 GPU，所以 CPU 路径必须自己够快，不能依赖 GPU。

## 执行清单

1. `python tools/reencode-approved-hires.py --check` 确认收益与 alpha 校验通过。
2. `--apply --workers N` 落盘；保留无损原件到仓库外备份。
3. 更新 catalog 帧哈希（三个字段，保持 `rgbaSha256`/`revision` 不变、保持紧凑序列化）。
4. 若改过任何已登记在 `localAdaptations` 的文件，重跑哈希同步脚本。建议把这一步做成脚本而不是手工改，否则每次改代码都会卡在同一个断言上。
5. `node scripts/sync-adapted-hashes.mjs`（或等价物）。
6. 全量测试；注意无 GPU 环境的路径要单独验证，本机有 GPU 会掩盖超时问题。
7. 打包核实体积，逐项回读校验。

## 不要做的事

- 不要为了省体积改 `catalog.revision`——会级联重建 indexed 载荷。
- 不要改 `rgbaSha256` 冒充批准记录。
- 不要把 uint8 回绕"修复"掉。
- 不要用未加权的 PSNR/ΔE 做验收。
- 不要因为本机通过就认为 CI 能过——无 GPU 环境的耗时必须实测。
