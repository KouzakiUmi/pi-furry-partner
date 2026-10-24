# Canonical Umi pose masters / 呜咪姿态原稿

Character artwork and animation assets are **All Rights Reserved** under
[ASSET_LICENSE.md](../../ASSET_LICENSE.md).

Canonical masters use the existing **640 × 640 transparent canvas**.
`metadata.json` remains authoritative for the original nose, eye and mouth
coordinates; video-derived poses have their own reviewed source selection.
`canonical-repairs.json` records reviewed repair inputs and hashes. The original
21-frame indexed sheets and their palettes remain immutable.

| Input | Purpose |
| --- | --- |
| `error.png` | Reviewed standalone xx-eye reaction; do not reconstruct it by painting cross eyes over the neutral iris |
| `speak-clean.png` | Clean muzzle source for localized, continuous mouth animation on the same speaking pose |
| `neutral-eyes-clean.png` | Clean eye-area source for pose-specific eye patches; preserve the real gray eyebrows and alpha silhouette |
| `search.png` | Canonical search/compaction pose with the misplaced right-side cape fragment removed |
| `watch.png` | Original magnifier pose used as the identity reference for the authored scan sequence |
| `watch-sequence-generated.png` | Six consistently drawn magnifier cels on a transparent 3 × 2 sheet; lens, gripping paw and head turn together |
| `watch-sequence/` | Aligned cels from the earlier six-frame scan; retained as reviewed reference artwork |
| `watch-h3-source.mp4` | MiniMax-H3 continuous scan from the approved centered cel, with a flat green background; video-only source for offline keying and sampling |
| `watch-h3-prompt.txt` | Exact first/last-frame prompt for the H3 scan |
| `watch-h3-provenance.json` | Model, source hash, measured clip specifications and source-review record, without account credentials or task identifiers |
| `watch-video-metadata.json` | Reviewed source-frame indices, variable timing, palette invariants, blink locality and accepted sampling-review notes |
| `search-h3-source.mp4` | Continuous paper-pile/tail source for searching and compaction, prepared as complete cels offline |
| `search-h3-prompt.txt` / `search-h3-provenance.json` | The exact search prompt and reviewed source origin without private generation identifiers |
| `search-video-metadata.json` | The 72-frame search/compaction selection, 6580ms timing, alpha process and preserved-source checks |
| `listen.png` | Cupped-ear listening pose for local idle typing; gentle nods use its own tilted-face landmarks |

The original watching and listening still masters were created with the built-in
image tool, then aligned and rigged by local code. Their exact prompts are saved in
[`watch-prompt.txt`](watch-prompt.txt), [`watch-sequence-prompt.txt`](watch-sequence-prompt.txt) and [`listen-prompt.txt`](listen-prompt.txt).
Original generated inputs and normalized metadata remain beside the masters.
The pixel derivatives preserve the same character design and use local fine-line
protection when reducing small strokes; they are not a separate character redesign.

The current magnifier loop was generated with **MiniMax-H3**, using the same
approved centered cel as its first and last reference. The green background is
removed **offline using an independent grayscale matte**, then the continuous
movement is sampled into complete indexed-pixel cels. The lens, gripping paw, head and cloak move together; the
eye is optically enlarged as the lens passes in front of it. Runtime plays
`watch-frames.json` without deforming the lens or dissolving neighboring scan
cels. No model call, video decoding or network access is needed at runtime.
The earlier six-frame artwork is retained for provenance. Older six-frame
packs retain their declared sequence; older two-frame packs retain static/blink
fallback. Rebuilds must not modify the immutable main reaction sheets or add
new palette colors to their derived terminal frames. The H3 source contains
continuous open-eyed scanning; the added blink is an eye-only local edit.

The shipped scan has **64 video-derived cels plus one eye-only blink**: **65
distinct pictures, 66 playback steps**, with a **6580ms** cycle. Moving cels last at least 80ms; short inspection holds
preserve the source timing. The opening 420ms hold is split into 200ms open,
80ms closed and 140ms open, without changing any pixels outside the eye sockets.
`scripts/build_watch_matte.py` writes separate **16-bit background-matte and
foreground-alpha PNGs**, then `scripts/build_watch_video.py` builds the 240px
and 80px palette-compatible packs from the reviewed fixed-canvas RGBA manifest.
The source's green signal is `max(0, G - max(R, B))`, preserving white fur;
normalizing it against the border background gives a grayscale background
matte, whose inverse supplies alpha. Straight foreground RGB is recovered by
inverse compositing, then premultiplied RGB and alpha use the same resize kernel.
There is no green-channel deletion, hard source-alpha cutoff or outline erosion.
The source and film retain fractional 8-bit RGBA alpha. The 240px terminal
variant only approximates outside-connected partial edges over the matching
black background using the immutable palette; 80px retains hard pixel coverage.
See the [build workflow](../../CONTRIBUTING.md#角色视频与透明边缘).
Python, image libraries and source videos are build-time inputs only.

Searching and compaction now share a continuous MiniMax-H3 paper-pile sequence.
Head, tail, cloak, body and pages are already coordinated in complete cels,
including the traveling tail wave. The current video pack must not receive the
older tail, head or page deformation fields on top, and must not be repaired by
runtime optical flow, reverse playback or cel dissolves.
The released pack contains **72 pictures and 72 timed steps over 6580ms**,
preserving the actual beginning and ending inspection holds. The same
green-luminance matte workflow supplies its fixed-canvas RGBA frames.
`scripts/build_search_video.py` exports the two existing palette styles;
`lib/search.mjs` validates the optional pack and preserves older-asset fallback.

Historical search tail, head and paper landmarks remain in `search-metadata.json`
for old assets and regression coverage. They do not drive the current baked
video sequence. The canonical still remains a reference for geometry and colors.
The tail color order from **tip to root** is **deep gray → light gray → white**.

`python scripts/build_search_pose.py` now validates and preserves the canonical
master. Replacing it from the historical `search-generated-perspective.png`
requires **both** `--legacy-rebuild --force`; that opt-in operation saves a
private backup under the ignored `work/` directory first. It is not part of the
normal rebuild. Old `fix_search_tail_root.py` repaint coordinates belong to an
earlier image and must not be applied automatically to repaired artwork.

原稿沿用 640 × 640 透明画布；修复原稿与 SHA-256 记录在
`canonical-repairs.json`，视频选帧则按各自元数据记录。旧搜索地标保留供历史
素材兼容与回归检查，不再驱动新视频序列。尾巴尖端到根部为深灰、浅灰、白色。
默认运行 `build_search_pose.py` 只校验原稿，不会从旧生成图覆盖修复成果。

当前放大镜扫描由 MiniMax-H3 使用同一张已确认原画作为首尾帧生成，再离线
抠除绿色背景、抽取完整动作帧。运行时只播放帧数据，不调用模型、解码视频
或访问网络，也不变形、叠化镜框。旧六张原画继续保留作来源记录，旧六帧
序列和两帧静态／眨眼素材包仍可使用。H3 原片为连续睁眼扫描，新增眨眼只
能修改局部眼区，保留身体和斗篷。重建不得改写主反应表或新增终端调色板颜色。

正式扫描为 64 张视频动作帧加 1 张局部闭眼帧，共 65 幅画面、66 个播放步骤，
每圈 6580ms；运动帧至少
保留 80ms，并保留短暂观察停顿。开头 420ms 拆成睁眼 200ms、闭眼 80ms、
睁眼 140ms，眼窝以外的像素和透明轮廓完全不变。构建脚本只在离线制作时使用，
插件运行不需要 Python、视频文件或生成服务。

离线透明流程按“绿色信号亮度 → 独立灰度背景遮罩 → 反相 Alpha → 恢复前景”
执行，并输出 16 位 matte 与 Alpha。白毛通过 `G - max(R, B)` 的绿色信号区别于
背景，不以删绿通道、侵蚀或硬切源 Alpha 代替遮罩。640px 母版与视频保留柔和
透明边缘；240px 终端只在外部连通边缘近似配套黑底抗锯齿，80px 保留硬像素。
新搜索与整理的脑袋、尾巴、斗篷、身体和纸页运动已经烘焙进完整连续帧；运行时
不得再次套用旧尾巴、头部或纸页的局部形变。原始 21 帧、palette 与戳戳补丁保持。
正式搜索／整理库共 72 幅画面、72 个步骤，6580ms 一圈，保留首尾观察停顿。
来源、提示词与时序分别保存在 `search-h3-source.mp4`、`search-h3-prompt.txt`、
`search-h3-provenance.json` 和 `search-video-metadata.json`；离线构建入口为
`scripts/build_search_video.py`，透明边缘遵循同一独立灰度 matte 流程。
