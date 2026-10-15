// Pure indexed-pixel animation. The editor layout and terminal cursor never move.
// Inputs are immutable sheets; replace a sheet object when its assets change.
let playerSerial = 0;
const TAU = Math.PI * 2;
const DEFAULT_EARS = [
  { polygon: [[85, 112], [171, 27], [257, 102], [217, 153], [119, 177]], pivot: [218, 145] },
  { polygon: [[336, 88], [493, 26], [489, 179], [446, 235], [391, 172]], pivot: [395, 174] },
].map((ear) => ({ polygon: ear.polygon.map(([x, y]) => [x / 640, y / 640]), pivot: ear.pivot.map((v) => v / 640), normalized: true }));
const DEFAULT_PAWS = [
  { polygon: [[143, 458], [201, 450], [236, 482], [241, 536], [217, 567], [171, 583], [122, 572], [98, 543], [106, 500]], pivot: [198, 466] },
  { polygon: [[370, 469], [423, 465], [465, 488], [488, 522], [492, 562], [466, 585], [406, 584], [366, 563], [330, 547], [325, 521], [342, 491]], pivot: [396, 474] },
].map((paw) => ({ polygon: paw.polygon.map(([x, y]) => [x / 640, y / 640]), pivot: paw.pivot.map((v) => v / 640), normalized: true }));

function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

function edgeDistance(x, y, polygon) {
  let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return distance;
}

function regionGeometry(sheet, regions) {
  const width = sheet.width, height = sheet.height;
  return regions.map((ear) => {
    const normalized = ear.normalized !== false && ear.polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
    const scale = ([x, y]) => normalized ? [x * width, y * height] : [x, y];
    const polygon = ear.polygon.map(scale), pivot = scale(ear.pivot);
    // Padding puts the zero-weight boundary in transparent space, so the actual
    // sprite outline moves instead of only deforming markings inside a fixed mask.
    const padding = ear.paddingNormalized !== undefined ? ear.paddingNormalized * width : ear.padding ?? Math.max(1, width / 64);
    const left = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p[0])) - padding));
    const right = Math.min(width - 1, Math.ceil(Math.max(...polygon.map((p) => p[0])) + padding));
    const top = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p[1])) - padding));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...polygon.map((p) => p[1])) + padding));
    const anchor = Math.max(2, width / 12), points = [];
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const contained = inside(x, y, polygon), distance = edgeDistance(x, y, polygon);
      if (!contained && distance >= padding) continue;
      // The warp is zero at the padded outer edge and at the attachment.
      const edgeWeight = contained ? (padding ? 1 : Math.min(1, distance / Math.max(1, width / 60))) : 1 - distance / padding;
      const weight = edgeWeight * Math.min(1, Math.hypot(x - pivot[0], y - pivot[1]) / anchor);
      if (weight > 0) points.push({ x, y, weight });
    }
    return { points, polygon, pivot, padding, angle: ear.angle, amplitude: ear.amplitude, nodAmplitude: ear.nodAmplitude, phaseOffset: ear.phaseOffset };
  });
}

// A tail is a soft chain rather than one rigid part. Project each point onto
// its root-to-tip spine, then let a transverse wave travel along that length.
// Metadata can supply a curved spine; older sheets get a straight fallback.
function tailGeometry(sheet, region) {
  const width = sheet.width, height = sheet.height;
  const normalized = region.normalized !== false && region.polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
  const scale = ([x, y]) => normalized ? [x * width, y * height] : [x, y];
  const polygon = region.polygon.map(scale), pivot = scale(region.pivot);
  const tip = polygon.reduce((best, point) => Math.hypot(point[0] - pivot[0], point[1] - pivot[1]) >
    Math.hypot(best[0] - pivot[0], best[1] - pivot[1]) ? point : best, polygon[0]);
  const spine = region.spine?.length > 1 ? region.spine.map(scale) : [pivot, tip];
  const lengths = [0];
  for (let i = 1; i < spine.length; i++) lengths.push(lengths[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
  const total = Math.max(1, lengths.at(-1));
  const tangents = spine.map((point, index) => {
    const before = spine[Math.max(0, index - 1)], after = spine[Math.min(spine.length - 1, index + 1)];
    const dx = after[0] - before[0], dy = after[1] - before[1], distance = Math.hypot(dx, dy) || 1;
    return [dx / distance, dy / distance];
  });
  const amplitude = region.waveAmplitude ?? Math.max(2, width * 0.045);
  const padding = region.padding ?? Math.max(1, width / 64);
  const margin = Math.ceil(amplitude + padding + 2);
  const left = Math.max(0, Math.floor(Math.min(...polygon.map(([x]) => x)) - margin));
  const right = Math.min(width - 1, Math.ceil(Math.max(...polygon.map(([x]) => x)) + margin));
  const top = Math.max(0, Math.floor(Math.min(...polygon.map(([, y]) => y)) - margin));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...polygon.map(([, y]) => y)) + margin));
  const columns = right - left + 1, rows = bottom - top + 1;
  const flexible = region.rootFlexible === true || region.rootPinned === false;
  const rootBlend = region.rootBlendNormalized !== undefined ? region.rootBlendNormalized * width : width * 0.075;
  const field = new Float32Array(columns * rows * 4), mask = new Uint8Array(columns * rows);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    let best = Infinity, progress = 0, nx = 1, ny = 0;
    for (let index = 1; index < spine.length; index++) {
      const a = spine[index - 1], b = spine[index], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const distance = (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2;
      if (distance >= best) continue;
      best = distance; progress = (lengths[index - 1] + t * (lengths[index] - lengths[index - 1])) / total;
      const tx = tangents[index - 1][0] * (1 - t) + tangents[index][0] * t;
      const ty = tangents[index - 1][1] * (1 - t) + tangents[index][1] * t;
      const length = Math.hypot(tx, ty) || 1;
      nx = -ty / length; ny = tx / length;
    }
    const offset = (y - top) * columns + x - left;
    field[offset * 4] = progress; field[offset * 4 + 1] = nx; field[offset * 4 + 2] = ny;
    // Blend a flexible attachment through the upper white rump instead of
    // locking a band at the tail root. The lower body still has zero weight.
    const behind = (x - pivot[0]) * tangents[0][0] + (y - pivot[1]) * tangents[0][1];
    const rootWeight = Math.max(0, Math.min(1, 1 + behind / Math.max(1, rootBlend)));
    field[offset * 4 + 3] = rootWeight * rootWeight * (3 - 2 * rootWeight);
    mask[offset] = inside(x, y, polygon) || edgeDistance(x, y, polygon) <= padding ? 1 : 0;
  }
  return { left, right, top, bottom, columns, field, mask, amplitude, flexible,
    baseAmplitude: region.baseAmplitude ?? Math.max(0.8, width / 240), cycles: region.waveCycles ?? 0.85 };
}

function warpTail(source, output, width, height, transparent, tail, phase) {
  const { left, right, top, bottom, columns, field, mask, amplitude, cycles, flexible, baseAmplitude } = tail;
  const fieldOffset = (x, y) => (Math.max(top, Math.min(bottom, Math.round(y))) - top) * columns +
    Math.max(left, Math.min(right, Math.round(x))) - left;
  const displacement = (x, y) => {
    const offset = fieldOffset(x, y) * 4, s = field[offset];
    // Legacy pinned sheets keep their first tenth still. Flexible sheets add
    // a small blended base sway; phase lag still bends middle and tip apart.
    const envelope = flexible ? s ** 1.15 : Math.max(0, (s - 0.1) / 0.9) ** 1.15;
    const distance = (amplitude * envelope * Math.sin(phase - s * cycles * TAU) +
      (flexible ? baseAmplitude * Math.sin(phase) : 0)) * (flexible ? field[offset + 3] : 1);
    return [field[offset + 1] * distance, field[offset + 2] * distance];
  };
  // Remove only the original tail layer. The document pile and all pixels
  // outside its source mask remain exactly equal to the immutable source.
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const offset = (y - top) * columns + x - left;
    // The root's opaque underlayer stays connected while its fur flexes.
    if (mask[offset] && field[offset * 4] > (flexible ? 0.15 : 0.1)) output[y * width + x] = transparent;
  }
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    let sx = x, sy = y;
    // Inverse sampling fills the bent fur continuously without forward-splat
    // holes, interpolation colors or a displaced rectangular patch.
    for (let iteration = 0; iteration < 4; iteration++) {
      const [dx, dy] = displacement(sx, sy); sx = x - dx; sy = y - dy;
    }
    sx = Math.round(sx); sy = Math.round(sy);
    if (sx < left || sx > right || sy < top || sy > bottom || sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
    const offset = (sy - top) * columns + sx - left;
    if (mask[offset] && (flexible ? field[offset * 4 + 3] > 0 : field[offset * 4] > 0.1)) output[y * width + x] = source[sy * width + sx];
  }
}

function bounds(pixels, width, height, transparent) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[y * width + x] === transparent) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? undefined : { left, top, right, bottom };
}

function pixelArray(length, paletteLength) {
  return paletteLength <= 256 ? new Uint8Array(length) : new Uint16Array(length);
}

function microPose(time) {
  const tick = Math.floor(time / 100), t = tick * 100;
  const twitch = t % 5900;
  const beat = (start) => twitch >= start && twitch < start + 700 ? [2, -2, 1, 0, 2, -1, 0][Math.floor((twitch - start) / 100)] : 0;
  return {
    x: Math.round(Math.sin(t / 6200 * TAU)),
    y: Math.round(Math.sin(t / 3200 * TAU)),
    tilt: Math.round(Math.sin(t / 8400 * TAU)),
    earLeft: beat(3100), earRight: beat(3500), pawLeft: 0, pawRight: 0, tail: 0, wave: 0,
  };
}

function poseGroup(id) {
  const name = String(id || "idle");
  if (name.startsWith("talk-")) return "talk";
  if (name.startsWith("idle-")) return "idle";
  return name.replace(/-(blink|open|closed|wink)$/, "");
}

/**
 * frame(sheet, index, { animate=true, phase="idle", pose, blink }) returns
 * { sheet, frameIndex:0, frame, cacheKey, transitioning, nextInMs, motion }.
 * The returned sheet is a one-frame view, sharing the original palette. Both
 * frame.cacheKey and result.cacheKey identify its exact indexed-pixel content.
 * Call at 50ms while visible: micro-motion is quantized to 100ms and only a
 * phase/pose change starts a 200ms transition. Mouth/blink frames do not restart it.
 * A paused phase is completely frozen; a real phase change still updates once.
 * No timers, DOM, Node APIs, random sources, palette expansion or canvas resizing.
 */
export function createMotionPlayer({ now = Date.now, maxFrames = 64 } = {}) {
  const prefix = `pi-motion-${++playerSerial}`;
  const limit = Math.max(1, Math.min(256, Math.floor(maxFrames) || 64));
  const cache = new Map();
  let sheetData = new WeakMap(), paletteData = new WeakMap(), frameBounds = new WeakMap(), speechData = new WeakMap();
  let nextSheet = 0, nextFrame = 0, pairCount = 0, generatedFrames = 0;
  let lastWall, logicalTime = 0, wasAnimating = true, previous, transition, disposed = false;
  let lastPhase, phaseSince = 0;
  let pendingPose, groupSince = 0;

  function speechSheetFor(source) {
    if (speechData.has(source)) return speechData.get(source);
    const names = ["talk-closed", "talk-small", "talk-medium", "talk-wide"];
    const shapes = names.map((name) => source.frames[source.ids?.[name]]);
    const eyes = source.frames[source.ids?.["talk-blink"]];
    let data = { sheet: source, blinking: new Map() };
    if (eyes && shapes.every(Boolean)) {
      // Find the actual articulation patch from the four aligned mouth shapes.
      // Preserve its current shape when the separate eye clock blinks. This
      // uses only existing indexed pixels and never expands the shared palette.
      let left = source.width, top = source.height, right = -1, bottom = -1;
      for (let i = 0; i < shapes[0].pixels.length; i++) {
        if (shapes.every((frame) => frame.pixels[i] === shapes[0].pixels[i])) continue;
        const x = i % source.width, y = Math.floor(i / source.width);
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right >= left) {
        const frames = [...source.frames], ids = { ...source.ids };
        for (let shape = 0; shape < shapes.length; shape++) {
          const pixels = pixelArray(source.width * source.height, source.palette.length);
          pixels.set(eyes.pixels);
          for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const i = y * source.width + x; pixels[i] = shapes[shape].pixels[i];
          }
          const id = `${names[shape]}-blink`;
          data.blinking.set(source.ids[names[shape]], frames.length);
          ids[id] = frames.length; frames.push({ id, pixels });
        }
        data.sheet = { ...source, frames, ids };
      }
    }
    speechData.set(source, data);
    return data;
  }

  function remember(recipe, create) {
    if (cache.has(recipe)) {
      const entry = cache.get(recipe); cache.delete(recipe); cache.set(recipe, entry); return entry;
    }
    const value = create();
    const frame = { id: value.id, pixels: value.pixels, cacheKey: `${prefix}-${++nextFrame}` };
    const view = { ...value.sheet, frames: [frame], ids: { [frame.id]: 0 } };
    const result = { sheet: view, frameIndex: 0, frame, cacheKey: frame.cacheKey };
    cache.set(recipe, result); generatedFrames++;
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return result;
  }

  function dataFor(sheet) {
    let data = sheetData.get(sheet);
    if (!data) {
      const ears = sheet.motion?.ears === false ? [] : sheet.motion?.ears || DEFAULT_EARS;
      const paws = sheet.motion?.paws === false ? [] : sheet.motion?.paws || DEFAULT_PAWS;
      const tail = sheet.motion?.tail ? (Array.isArray(sheet.motion.tail) ? sheet.motion.tail : [sheet.motion.tail]) : [];
      const wave = sheet.motion?.wave ? (Array.isArray(sheet.motion.wave) ? sheet.motion.wave : [sheet.motion.wave]) : [];
      const papers = sheet.motion?.papers ? (Array.isArray(sheet.motion.papers) ? sheet.motion.papers : [sheet.motion.papers]) : [];
      const head = sheet.motion?.searchHead ? (Array.isArray(sheet.motion.searchHead) ? sheet.motion.searchHead : [sheet.motion.searchHead]) : [];
      const occlusion = (sheet.motion?.searchOcclusion || []).map((polygon) => polygon.map(([x, y]) => [x * sheet.width, y * sheet.height]));
      data = { id: ++nextSheet, ears: regionGeometry(sheet, ears), paws: regionGeometry(sheet, paws), tails: tail.map((region) => tailGeometry(sheet, region)), waves: regionGeometry(sheet, wave), papers: regionGeometry(sheet, papers), head: regionGeometry(sheet, head), occlusion };
      sheetData.set(sheet, data);
    }
    return data;
  }

  function transform(sheet, index, pose) {
    const original = sheet.frames[index], source = original.pixels, width = sheet.width, height = sheet.height;
    const transparent = sheet.transparentIndex ?? 0, data = dataFor(sheet);
    let box = frameBounds.get(original);
    if (box === undefined) { box = bounds(source, width, height, transparent) || null; frameBounds.set(original, box); }
    const dx = box ? Math.max(-box.left, Math.min(width - 1 - box.right, pose.x)) : 0;
    const dy = box ? Math.max(-box.top, Math.min(height - 1 - box.bottom, pose.y)) : 0;
    let angle = pose.tilt * 0.32 * Math.PI / 180;
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    if (box && angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const fits = [[box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom]].every(([x, y]) => {
        const rx = (x - cx) * cos - (y - cy) * sin + cx + dx;
        const ry = (x - cx) * sin + (y - cy) * cos + cy + dy;
        return rx >= 0 && rx <= width - 1 && ry >= 0 && ry <= height - 1;
      });
      if (!fits) angle = 0;
    }
    const recipe = `motion:${data.id}:${index}:${dx},${dy},${angle},${pose.earLeft},${pose.earRight},${pose.pawLeft},${pose.pawRight},${pose.tail},${pose.tailPhase ?? "-"},${pose.wave},${pose.paperPhase ?? "-"},${pose.burrowPhase ?? "-"}`;
    return remember(recipe, () => {
      let warped = source;
      const warp = (ear, amount, kind) => {
        if (!amount) return;
        if (warped === source) warped = source.slice();
        const [px, py] = ear.pivot;
        for (const { x, y, weight } of ear.points) {
          // The buried head remains behind the documents. Neither a source
          // sample nor its destination may pick up foreground page pixels.
          if (kind === "burrow" && data.occlusion.some((polygon) => inside(x, y, polygon))) continue;
          let sx, sy;
          if (kind === "burrow") {
            const phase = (pose.burrowPhase + (ear.phaseOffset ?? 0)) / 24 * TAU;
            const sway = Math.sin(phase), a = -sway * (ear.angle ?? 1) * Math.PI / 180 * weight;
            const ox = x - px - sway * (ear.amplitude ?? 1.4) * weight;
            const oy = y - py - (1 - Math.cos(phase)) * .5 * (ear.nodAmplitude ?? .8) * weight;
            const cos = Math.cos(a), sin = Math.sin(a);
            sx = Math.round(ox * cos - oy * sin + px);
            sy = Math.round(ox * sin + oy * cos + py);
          } else if (kind === "paper") {
            const a = -amount * (ear.angle ?? 1) * Math.PI / 180 * weight;
            const cos = Math.cos(a), sin = Math.sin(a);
            sx = Math.round((x - px) * cos - (y - py) * sin + px);
            sy = Math.round((x - px) * sin + (y - py) * cos + py - amount * (ear.amplitude ?? 1) * weight);
          } else if (kind === "paw") {
            sx = x; sy = Math.round(y - amount * (ear.amplitude ?? Math.max(1, height / 120)) * weight);
          } else {
            // Keep an ear twitch visible at one native pixel on the 80px style.
            const a = -amount * (ear.angle ?? (kind === "wave" ? 5 : Math.max(1.2, 288 / height))) * Math.PI / 180 * weight;
            const cos = Math.cos(a), sin = Math.sin(a);
            sx = Math.round((x - px) * cos - (y - py) * sin + px);
            sy = Math.round((x - px) * sin + (y - py) * cos + py);
          }
          if (kind === "burrow" && data.occlusion.some((polygon) => inside(sx, sy, polygon))) continue;
          // Keep the boundary intact rather than pasting a displaced rectangle.
          if (sx >= 0 && sx < width && sy >= 0 && sy < height && (inside(sx, sy, ear.polygon) || edgeDistance(sx, sy, ear.polygon) <= ear.padding)) warped[y * width + x] = source[sy * width + sx];
        }
      };
      data.ears.forEach((ear, i) => warp(ear, i ? pose.earRight : pose.earLeft, "ear"));
      data.paws.forEach((paw, i) => warp(paw, i ? pose.pawRight : pose.pawLeft, "paw"));
      if (pose.tailPhase !== undefined && data.tails.length) {
        if (warped === source) warped = source.slice();
        data.tails.forEach((tail) => warpTail(source, warped, width, height, transparent, tail, pose.tailPhase / 24 * TAU));
      }
      data.waves.forEach((wave) => warp(wave, pose.wave, "wave"));
      if (pose.burrowPhase !== undefined) data.head.forEach((head) => warp(head, 1, "burrow"));
      if (pose.paperPhase !== undefined) data.papers.forEach((paper, i) =>
        warp(paper, Math.sin((pose.paperPhase + (paper.phaseOffset ?? [0, 7, 15][i % 3])) / 24 * TAU), "paper"));
      if (!dx && !dy && !angle) return { sheet, id: original.id, pixels: warped };
      const pixels = pixelArray(width * height, sheet.palette.length);
      if (transparent) pixels.fill(transparent);
      const cos = Math.cos(-angle), sin = Math.sin(-angle);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ox = x - dx - cx, oy = y - dy - cy;
        const sx = Math.round(ox * cos - oy * sin + cx), sy = Math.round(ox * sin + oy * cos + cy);
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) pixels[y * width + x] = warped[sy * width + sx];
      }
      return { sheet, id: original.id, pixels };
    });
  }

  function blendColor(palette, from, to, step, transparent) {
    if (from === to) return from;
    if (from === transparent || to === transparent) return step < 2 ? from : to;
    let maps = paletteData.get(palette);
    if (!maps) { maps = new Map(); paletteData.set(palette, maps); }
    const key = `${from}:${to}:${step}`;
    if (maps.has(key)) return maps.get(key);
    const rgb = palette[from].map((value, channel) => (value * (4 - step) + palette[to][channel] * step) / 4);
    let best = from, distance = Infinity;
    for (let i = 0; i < palette.length; i++) {
      if (i === transparent) continue;
      const candidate = palette[i];
      const d = (candidate[0] - rgb[0]) ** 2 + (candidate[1] - rgb[1]) ** 2 + (candidate[2] - rgb[2]) ** 2;
      if (d < distance) { best = i; distance = d; }
    }
    maps.set(key, best); pairCount++;
    return best;
  }

  function blend(from, to, step) {
    if (step <= 0) return from;
    if (step >= 4) return to;
    const sheet = to.sheet, transparent = sheet.transparentIndex ?? 0;
    return remember(`blend:${from.cacheKey}:${to.cacheKey}:${step}`, () => {
      const pixels = pixelArray(sheet.width * sheet.height, sheet.palette.length);
      for (let i = 0; i < pixels.length; i++) pixels[i] = blendColor(sheet.palette, from.frame.pixels[i], to.frame.pixels[i], step, transparent);
      return { sheet, id: to.frame.id, pixels };
    });
  }

  function reset() {
    cache.clear(); sheetData = new WeakMap(); paletteData = new WeakMap(); frameBounds = new WeakMap(); speechData = new WeakMap();
    previous = undefined; transition = undefined; pendingPose = undefined; groupSince = 0; lastWall = undefined; logicalTime = 0; wasAnimating = true; pairCount = 0; lastPhase = undefined; phaseSince = 0;
  }

  return {
    frame(sheet, targetIndex, { animate = true, phase = "idle", pose, blink } = {}) {
      if (disposed) throw new Error("Motion player has been disposed");
      if (!sheet?.frames?.length || !sheet.palette?.length || !(sheet.width > 0 && sheet.height > 0)) throw new TypeError("An indexed sprite sheet is required");
      const speech = speechSheetFor(sheet);
      if (phase === "speaking" && blink && speech.blinking.has(targetIndex)) targetIndex = speech.blinking.get(targetIndex);
      sheet = speech.sheet;
      const wall = Number(now());
      if (lastWall !== undefined && animate && wasAnimating && Number.isFinite(wall)) logicalTime += Math.max(0, wall - lastWall);
      if (Number.isFinite(wall)) lastWall = Math.max(lastWall ?? wall, wall);
      wasAnimating = animate;
      const actualPhase = phase;
      let index = ((Math.trunc(targetIndex) || 0) % sheet.frames.length + sheet.frames.length) % sheet.frames.length;
      const requestedPose = pose ?? poseGroup(sheet.frames[index].id);
      // Short tool boundaries often report thinking for a few milliseconds.
      // Filter only think/typing visual changes; text and important states stay live.
      if (animate && previous?.source === sheet && ["think", "work"].includes(requestedPose) &&
          ["think", "work"].includes(previous.pose) && ["thinking", "running", "editing"].includes(phase) &&
          ["thinking", "running", "editing"].includes(previous.visualPhase) && requestedPose !== previous.pose) {
        if (pendingPose?.target !== requestedPose) pendingPose = { target: requestedPose, since: logicalTime };
        // Enter typing promptly, then finish a readable gesture before leaving.
        if (previous.pose === "work" && (logicalTime - pendingPose.since < 240 || logicalTime - groupSince < 1200)) {
          index = previous.index; phase = previous.visualPhase;
        } else pendingPose = undefined;
      } else pendingPose = undefined;
      const group = pose ?? poseGroup(sheet.frames[index].id);
      const sourceChanged = previous && previous.source !== sheet;
      const groupChanged = previous && previous.group !== group;
      if (!previous || sourceChanged || groupChanged) groupSince = logicalTime;
      if (lastPhase !== phase) { lastPhase = phase; phaseSince = logicalTime; }
      // Freeze even if a caller supplies a new mouth/blink frame while paused.
      if (!animate && previous && !sourceChanged && previous.phase === actualPhase) {
        return { ...previous.result, transitioning: false, nextInMs: Infinity, motion: previous.motion };
      }
      const motion = microPose(logicalTime);
      const age = logicalTime - phaseSince;
      const frameId = String(sheet.frames[index].id || "");
      if (frameId === "rest") { motion.earLeft = 0; motion.earRight = 0; }
      if (["running", "editing"].includes(phase) && /^(work|typing)(-|$)/.test(frameId)) {
        const beat = Math.floor(logicalTime / 100) % 4;
        motion.pawLeft = [0, -1, 0, 1][beat]; motion.pawRight = [0, 1, 0, -1][beat];
      }
      if (["searching", "compacting"].includes(phase) && frameId.startsWith("search")) {
        motion.earLeft = 0; motion.earRight = 0;
        // Keep the body and pile base still; only tail and loose top pages move.
        motion.x = 0; motion.y = 0; motion.tilt = 0;
        motion.tail = Math.round(Math.sin(logicalTime / 2400 * TAU) * 2);
        motion.tailPhase = Math.floor(logicalTime / 100) % 24;
        motion.paperPhase = motion.tailPhase;
        motion.burrowPhase = motion.tailPhase;
      }
      if (phase === "success" && frameId.startsWith("happy")) {
        motion.tilt = Math.round(Math.sin(logicalTime / 1700 * TAU) * 3);
        motion.wave = Math.round(Math.sin(logicalTime / 900 * TAU));
      }
      if (phase === "error") {
        motion.earLeft = 0; motion.earRight = 0; motion.x = 0; motion.tilt = 0;
        motion.y = Math.round(Math.sin(logicalTime / 4800 * TAU));
        // A single small stumble on entering error; the settled error breathes slowly.
        if (age < 500) {
          const stumble = [0, -1, 1, -1, 0][Math.floor(age / 100)];
          motion.x = stumble; motion.tilt = stumble * 5;
        }
      }
      if (phase === "dozing") {
        motion.x = 0; motion.earLeft = 0; motion.earRight = 0;
        motion.y = Math.round((1 - Math.cos(logicalTime / 4200 * TAU)) * 0.7);
        motion.tilt = Math.round(Math.sin(logicalTime / 5200 * TAU) * 2);
      }
      if (phase === "startled") {
        const beat = Math.min(6, Math.floor(age / 100));
        const scale = Math.max(1, sheet.height / 120);
        const startleBeat = Math.min(12, Math.floor(age / 50));
        motion.x = Math.round([0, -2, 2, -1.6, 1.3, -1, .8, -.6, .4, -.25, .15, 0, 0][startleBeat] * scale);
        motion.y = Math.round([0, -2, -3, -2, 1, 0, 0][beat] * scale);
        motion.tilt = [0, -3, 2, -1, 0, 0, 0][beat];
        motion.earLeft = [0, 2, -1, 1, 0, 0, 0][beat]; motion.earRight = -motion.earLeft;
        motion.pawLeft = motion.pawRight = [0, -1, -1, 0, 0, 0, 0][beat];
      }
      const target = transform(sheet, index, motion);
      // A surprised wake-up opens the eyes immediately. Dissolving a sleeping
      // face over the first two shakes made the short reaction look smeared.
      if (sourceChanged || phase === "startled") transition = undefined;
      else if (animate && groupChanged) transition = { source: previous.result, start: logicalTime };
      let result = target, transitioning = false;
      if (animate && transition) {
        const step = Math.min(4, Math.floor((logicalTime - transition.start) / 50));
        result = blend(transition.source, target, step);
        transitioning = step < 4;
        if (!transitioning) transition = undefined;
      } else if (!animate) transition = undefined;
      previous = { source: sheet, group, pose: group, index, phase: actualPhase, visualPhase: phase, result, motion, blink };
      const quantum = transitioning || phase === "startled" && age < 600 ? 50 : 100;
      return { ...result, transitioning, nextInMs: animate ? quantum - logicalTime % quantum : Infinity, motion };
    },
    reset,
    stats() { return { frames: cache.size, maxFrames: limit, generatedFrames, palettePairs: pairCount, logicalTime, transitioning: Boolean(transition), disposed }; },
    dispose() {
      if (disposed) return;
      reset(); disposed = true;
    },
  };
}
