# Reviewed H3 gesture playback

Pi and DSH share the same chronological whole-frame clip format. An approved
clip replaces only the selected gesture; missing or rejected clips retain the
existing authored-pose fallback. Watch/magnifier and buried-search packs remain
independent.

## Indexed assets

Each style has a small `assets/reactions/{style}/gesture-videos.json` catalog:

```json
{
  "schemaVersion": 1,
  "clips": {
    "shy": { "periodMs": 6583, "frameCount": 79, "qa": { "accepted": true } }
  }
}
```

The example is a format illustration, not an acceptance of a generated clip.
Only publish a catalog entry after the actual character, paws, short claw tips,
folded ear, contour, complete canvas and loop have passed visual review.

The corresponding `gesture-shy-frames.json` contains:

```json
{
  "action": "shy",
  "width": 240,
  "height": 240,
  "qa": { "accepted": true },
  "frames": [
    { "id": "gesture-shy-000", "pixels": [0, 0] }
  ],
  "sequence": {
    "periodMs": 6583,
    "steps": [ { "id": "gesture-shy-000", "durationMs": 83 } ]
  }
}
```

`pixels` above is abbreviated. Each frame must contain exactly width × height
palette indexes. Pi assets use numeric JSON arrays; runtime converts them to
Uint8Array or Uint16Array. `palette` may be omitted to use the complete base
palette after expression augmentation. An included palette must preserve that
exact prefix, contain only RGB triplets, and have at most 512 colors.

A real pack requires 2–96 frames and at most 6,000,000 indexed pixels total.
Steps must have the exact same frame IDs and order as `frames`, each lasting
40–2000 ms; their sum must equal both sequence.periodMs and catalog.periodMs,
at most 15000 ms. Catalog.frameCount must match the actual pack. Every ID must
match `gesture-{action}-NNN`. Supported actions are wave, stretch, joy, grumpy,
sad, cry, shy, flustered, surprise, proud and affection.

Pi loads only the current gesture, caches at most two clip views across styles,
and never appends all nine videos into one sprite sheet. Views share immutable
base frames. Task, question, typing and poke priorities stay with the activity
controller.

## DSH API and high resolution frames

The base sheet API returns only the lightweight `gestureCatalog`, with no gesture
video pixels. The single-clip route is:

```
GET /api/furry-partner/gesture?style=umi&action=shy
```

It returns the same pack fields with base64 `frames[].pixels` and `pixelsEncoding`
set to `u8` or `u16le`. Above 256 colors, little-endian 16-bit indexes are required.
The host encodes only that clip, using an LRU of two; the browser fetches and
retains at most two clips and two downloads. Dimensions and frame limits are
checked before decoded pixel buffers are allocated.

High resolution WebP files live at:

```
assets/hires/umi/gesture-shy/gesture-shy-000.webp
```

`manifest.animations.gestures.shy` contains `qa.accepted: true`, `periodMs`,
`durationMs` equal to periodMs, `ids` and `frames: [{atMs: 0, id: ...}, ...]`.
IDs are unique and must exactly match the frame timeline in the same order.
The timeline starts at 0 and increases strictly, below periodMs. A maximum of
512 high resolution frames is accepted per clip. HTTP frame kinds use an exact
allowlist; arbitrary directories or path separators are never accepted.

DSH decodes WebPs on demand with six frames of lookahead. The frame LRU is capped
at 96 across poses and videos. It protects the currently requested frame and the
last actually painted frame held during loading, closes evicted ImageBitmaps,
and releases remaining resources on disposal. Late requests cannot allocate
images after disposal.

## Motion, duration and verification

Video playback selects the captured frame directly. It clears local ear/paw/tail
rigs, breathing, paper effects, scale, translation and rotation; no frame blend,
optical flow or morph is applied. HD layers likewise have no extra transform.
Manual single-action playback, the all-action tour and autonomous interactions
use the accepted metadata duration, including clips longer than the old 3600 ms
expression duration. DSH interaction lifetime expands to the complete clip.
Pause freezes the playback clock; real work retains immediate priority.

Relevant checks:

- `tests/gesture-video.mjs`: review gates, safe IDs, strict forward order,
  exact timing/pixels, no transforms/blending, u16 colors and two-clip LRU.
- `tests/dsh-gesture-video.mjs`: actual bundled controller, nine on-demand clips,
  96-frame eviction with resource release, metadata timing, pause and priority.
- `tests/dsh-host.mjs`: API routes, base sheet separation and path rejection.
- `tests/gestures.mjs` / `tests/dsh-companion.mjs`: duration-aware scheduling.

## Borrowing a clip for a real state

`stateExpressionVideo(snapshot, catalog)` selects a reviewed visual-only clip
for the existing completion (`joy`), short startled reaction (`surprise`), or
waiting warning (`flustered`). It returns `source: "state"` and never writes a
manual gesture or changes phase, tools, text, input, or gesture mode. Pi passes
this separately to `renderDock.visualGesture`; DSH keeps `state.gesture` for
manual/companion actions and exposes the rendering choice as
`state.visualGesture`.

The additional activity metadata `expressionElapsedMs` uses the actual event
age, including when the first render is delayed. Completion stays 2600 ms,
startled stays 650 ms, and a warning stays 1800 ms. A state can interrupt its
video at any time; a film shorter than its state holds its last captured frame.
Manual and companion actions still use their complete reviewed clip duration.
Poke, listening, dozing and real work/display holds retain priority. Missing or
rejected clips keep the existing authored fallback; they do not get synthetic
gesture motion. DSH also stops holding an expired state clip while a new HD
pose loads, showing that new state's indexed fallback immediately.

`tests/state-expression-video.mjs` covers the shared selection and Pi dock
using real activity events and exact captured pixels.
`tests/dsh-gesture-video.mjs` verifies the same short states in the actual
client bundle, including HD selection, warning blinks and priority. The Pi
integration suite also exercises real extension event hooks and state exits.


## Full Hi-Res rebuild

The withdrawn expression color/aspect experiment is excluded from production.
New expression processing is `source-native-v1`: uniform full-canvas resize and
transparent padding, with no RGB material mapping or non-uniform stretching.
All nine visual review checks, including original proportions and material
colors, remain mandatory. See [current expression status](h3-expression-videos.md).

An adjacent `withdrawal-record.json` in a prepared/review/source directory or
`Hi-Res/animations-640/emotion-ID` overrides historical `qa.accepted`. Packing
and full rebuilding refuse withdrawn or malformed records before publication;
source archives are checked too. Known fixed-calibration metadata is rejected
even if its withdrawal sidecar is absent. Rebuilding fails explicitly, rather
than silently omitting an expected action. A replacement requires an explicit
reviewed version migration; builders never delete withdrawal records.

`scripts/build-hires-assets.py` also rebuilds approved H3 gestures from the
preserved `Hi-Res/animations-640/emotion-{ID}/timeline.json` and its exact reviewed
RGBA PNGs. It preserves the clip's `qa`, `periodMs`, `durationMs`, IDs and complete
forward time points, and rebuilds WebPs with the same lossless/exact settings as
the expression packer. Rebuilding is not a new visual acceptance.

Both the timeline and clip must carry the same accepted review record, including
source/review SHA-256 values. Each PNG must still match its recorded SHA-256,
640×640 RGBA canvas and source ordering; IDs, contiguous timestamps, durations
and total period are checked before runtime output is touched. Unknown or
unreviewed folders stay dormant. Unreferenced PNGs are not published. If an
existing approved runtime clip has no corresponding approved Hi-Res source, the
full rebuild stops and preserves the existing bank instead of silently dropping
that clip.

The entire bank is first built in a temporary child of `assets/hires`. Only a
successful build replaces the previous directory. Encoder failures preserve the
old bank; a failed final directory rename restores it. Concurrent updates to the
runtime manifest or reviewed source timeline abort publication. Revisions hash
the gesture time/QA metadata as well as image bytes, including the
`--expressions-only` path, so timing-only changes cannot reuse a stale revision.

Offline verification, using isolated temporary projects rather than the current
runtime bank:

```
python tests/hires_rebuild.py
```

The tests cover a complete rebuild with retained approved clips, bit-exact
lossless RGBA/soft alpha, rejected-source omission, changed/missing-source
protection, encoder and final-rename failures, concurrent publication protection,
timing-aware revisions and unsafe or inconsistent timeline rejection.
