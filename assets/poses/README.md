# Canonical Umi pose masters / 呜咪姿态原稿

Character artwork and animation assets are **All Rights Reserved** under
[ASSET_LICENSE.md](../../ASSET_LICENSE.md).

All animation landmarks use the existing **640 × 640 transparent canvas**.
`metadata.json` remains authoritative for the original nose, eye and mouth
coordinates. `canonical-repairs.json` records reviewed repair inputs and hashes.

| Input | Purpose |
| --- | --- |
| `error.png` | Reviewed standalone xx-eye reaction; do not reconstruct it by painting cross eyes over the neutral iris |
| `speak-clean.png` | Clean muzzle source for localized, continuous mouth animation on the same speaking pose |
| `neutral-eyes-clean.png` | Clean eye-area source for pose-specific eye patches; preserve the real gray eyebrows and alpha silhouette |
| `search.png` | Canonical search/compaction pose with the misplaced right-side cape fragment removed |
| `watch.png` | Magnifier pose for running tools; lens/paw and head scan with their own landmarks |
| `listen.png` | Cupped-ear listening pose for local idle typing; gentle nods use its own tilted-face landmarks |

The new watching and listening masters were created with the built-in image tool,
then aligned and rigged by local code. Their exact prompts are saved in
[`watch-prompt.txt`](watch-prompt.txt) and [`listen-prompt.txt`](listen-prompt.txt).
Original generated inputs and normalized metadata remain beside the masters.
The pixel derivatives preserve the same character design and use local fine-line
protection when reducing small strokes; they are not a separate character redesign.

Search tail, head and paper landmarks remain in `search-metadata.json`. The
cape repair retained their established geometry; animation should read this
master directly and scale its normalized landmarks to 240 px / 80 px sheets.
The tail color order from **tip to root** is **deep gray → light gray → white**.

`python scripts/build_search_pose.py` now validates and preserves the canonical
master. Replacing it from the historical `search-generated-perspective.png`
requires **both** `--legacy-rebuild --force`; that opt-in operation saves a
private backup under the ignored `work/` directory first. It is not part of the
normal rebuild. Old `fix_search_tail_root.py` repaint coordinates belong to an
earlier image and must not be applied automatically to repaired artwork.

所有地标沿用 640 × 640 透明画布；新修复原稿与 SHA-256 记录在
`canonical-repairs.json`。正式素材生成应直接读取这些原稿。搜索姿态沿用
已检查的尾巴、头部和纸页地标；尾巴尖端到根部为深灰、浅灰、白色。
默认运行 `build_search_pose.py` 只校验原稿，不会从旧生成图覆盖修复成果。
