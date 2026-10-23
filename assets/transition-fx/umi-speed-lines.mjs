/** Independent transparent FX; never changes character pixels or animates a pose.
 * All geometry is normalized to 0..1. No dependencies, clock, DOM or randomness.
 */
export const PRESETS = Object.freeze({
  'keyboard-enter': { direction: 'up', intensity: 1, duration: 260, anchor: [0.5, 0.85] },
  'keyboard-exit': { direction: 'right', intensity: 1.15, duration: 220, anchor: [0.64, 0.81] },
  'state-switch': { direction: 'right', intensity: 0.55, duration: 180, anchor: [0.5, 0.78] },
});
const VECTORS = Object.freeze({up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0]});
const COLORS = ['#e8f6ff', '#a6d3f0', '#94a8bf'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const number = (n, fallback) => Number.isFinite(n) ? n : fallback;
const hash = n => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
const fmt = n => Number(n.toFixed(6));

export function resolveOptions(options = {}) {
  const preset = PRESETS[options.preset] || PRESETS['keyboard-enter'];
  const anchor = Array.isArray(options.anchor) ? options.anchor : preset.anchor;
  return {
    direction: Object.hasOwn(VECTORS, options.direction) ? options.direction : preset.direction,
    intensity: clamp(number(options.intensity, preset.intensity), 0, 1.6),
    duration: clamp(number(options.duration, preset.duration), 160, 400),
    anchor: [clamp(number(anchor[0], preset.anchor[0]), 0, 1), clamp(number(anchor[1], preset.anchor[1]), 0, 1)],
    reducedMotion: options.reducedMotion === true,
    // No path is emitted over this default face region. Explicitly configure
    // another character's face rectangle only when its reference changes.
    faceRect: Array.isArray(options.faceRect) && options.faceRect.length === 4
      && options.faceRect.every(Number.isFinite) ? options.faceRect : [0.15, 0.22, 0.85, 0.61],
  };
}

function ribbon(tail, control, head, width) {
  const left = [], right = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    const x = u*u*tail[0] + 2*u*t*control[0] + t*t*head[0];
    const y = u*u*tail[1] + 2*u*t*control[1] + t*t*head[1];
    const dx = 2*u*(control[0]-tail[0]) + 2*t*(head[0]-control[0]);
    const dy = 2*u*(control[1]-tail[1]) + 2*t*(head[1]-control[1]);
    const length = Math.hypot(dx, dy) || 1;
    const half = width * Math.sin(Math.PI * (0.12 + 0.88*t)) * (1-t) ** 0.55 / 2;
    left.push([x - dy/length*half, y + dx/length*half]);
    right.push([x + dy/length*half, y - dx/length*half]);
  }
  return left.concat(right.reverse());
}

function pathData(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0])},${fmt(p[1])}`).join(' ') + ' Z';
}

/** progress outside 0..1, both endpoints, zero intensity or reducedMotion => []. */
export function createSpeedLines(progress, options = {}) {
  const resolved = resolveOptions(options);
  const result = {progress, ...resolved, opacity: 0, paths: []};
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1
      || resolved.reducedMotion || resolved.intensity === 0) return result;
  const p = progress;
  // One short rise/peak/decay; no white flash, oscillation or lasting overlay.
  const envelope = Math.sin(Math.PI * p) ** 1.35;
  result.opacity = envelope;
  const vector = VECTORS[resolved.direction], normal = [-vector[1], vector[0]];
  const count = Math.round(13 + resolved.intensity * 8);
  for (let i = 0; i < count; i++) {
    const band = i % 8 === 0;
    const lane = (hash(i+1) - 0.5) * 0.91;
    const travel = (p-0.5) * 0.24;
    const along = (hash(i+80) - 0.5) * 0.19 + travel;
    const head = [resolved.anchor[0] + normal[0]*lane + vector[0]*along,
                  resolved.anchor[1] + normal[1]*lane + vector[1]*along];
    const length = (0.07 + hash(i+170)*0.19) * (band ? 1.15 : 1);
    const tail = [head[0]-vector[0]*length, head[1]-vector[1]*length];
    const curve = (hash(i+220)-0.5) * 0.08;
    const control = [(tail[0]+head[0])/2+normal[0]*curve,
                     (tail[1]+head[1])/2+normal[1]*curve];
    const width = (band ? 0.022 : 0.0025 + hash(i+260)*0.007) * resolved.intensity;
    const points = ribbon(tail, control, head, width);
    // Omit rather than crop lines: each emitted normalized path is complete,
    // inside the canvas and clear of the face at every sampled point.
    const xs = points.map(q => q[0]), ys = points.map(q => q[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const [fx0, fy0, fx1, fy1] = resolved.faceRect;
    if (box[0] < 0 || box[1] < 0 || box[2] > 1 || box[3] > 1) continue;
    if (box[0] < fx1 && box[2] > fx0 && box[1] < fy1 && box[3] > fy0) continue;
    result.paths.push({
      id: i, d: pathData(points), points, head, tail, control, vector: [...vector],
      kind: band ? 'transparent-band' : 'tapered-arc',
      fill: COLORS[i % COLORS.length],
      opacity: envelope * (band ? 0.10 : 0.34 + hash(i+300)*0.22),
    });
  }
  return result;
}

/** Draw only this overlay into an independently owned transparent Canvas.
 * clear=true clears that overlay; never pass the character's own canvas.
 */
export function renderCanvas(ctx, progress, options = {}) {
  const width = Math.max(1, number(options.width, ctx.canvas.width));
  const height = Math.max(1, number(options.height, ctx.canvas.height));
  const model = createSpeedLines(progress, options);
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (options.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.scale(width, height);
    for (const path of model.paths) {
      ctx.beginPath();
      path.points.forEach((point, i) => i ? ctx.lineTo(...point) : ctx.moveTo(...point));
      ctx.closePath(); ctx.fillStyle = path.fill; ctx.globalAlpha = path.opacity; ctx.fill();
    }
  } finally { ctx.restore(); }
  return model;
}

/** Standalone transparent SVG, same exact normalized polygons as Canvas. */
export function toSVG(progress, options = {}) {
  const model = createSpeedLines(progress, options);
  const width = clamp(number(options.width, 640), 1, 8192);
  const height = clamp(number(options.height, 640), 1, 8192);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label="Independent Umi transition speed lines"><g>${model.paths.map(path => `<path d="${path.d}" fill="${path.fill}" opacity="${fmt(path.opacity)}"/>`).join('')}</g></svg>`;
}
