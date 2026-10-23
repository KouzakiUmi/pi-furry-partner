// Isolated candidate audit. Never writes assets, installs, or infers human approval.
// Usage: node tests/motion-polish-stage.mjs --root <stage> --selection <approved-selection.json>
// Optional --baseline <original repo> and --python <Python with Pillow>.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  assert.ok(process.argv[at + 1] && !process.argv[at + 1].startsWith('--'), `${name} needs a value`);
  return process.argv[at + 1];
}
assert.ok(option('--root'), '--root is required; a baseline alone is not a tested stage');
assert.ok(option('--selection'), '--selection is required');
const root = resolve(option('--root')), baseline = resolve(option('--baseline', repo));
assert.notEqual(root.toLowerCase(), baseline.toLowerCase(), 'Audit an isolated stage, not the original assets');
const selectionPath = resolve(option('--selection'));
const bytes = path => readFileSync(path);
const json = path => JSON.parse(bytes(path).toString('utf8').replace(/^\uFEFF/, ''));
const sha = value => createHash('sha256').update(value).digest('hex');
const hash = path => sha(bytes(path));
const hex = value => assert.match(value, /^[a-f0-9]{64}$/i);
function inside(base, path) {
  assert.equal(typeof path, 'string');
  const full = resolve(base, path), rel = relative(base, full);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `Path escapes audit root: ${path}`);
  return full;
}
const animated = resolve(root, 'assets/animated'), original = resolve(baseline, 'assets/animated');
const catalog = json(resolve(animated, 'catalog.json')), oldCatalog = json(resolve(original, 'catalog.json'));
const selection = json(selectionPath);
assert.equal(hash(resolve(original, 'catalog.json')), selection.formalCatalogSha256, 'Baseline must be the frozen formal catalog');
const expectedIds = ['idle', 'think', 'listen', 'wait', 'rest', 'work', 'watch', 'search',
  'joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection', 'work-enter', 'work-exit'].sort();
assert.deepEqual(Object.keys(selection.clips).sort(), expectedIds);
assert.deepEqual(Object.keys(catalog.clips).sort(), expectedIds);
const newIds = expectedIds.filter(id => selection.clips[id].selection === 'approved-new');
const retainedIds = expectedIds.filter(id => selection.clips[id].selection === 'retain-formal');
assert.equal(newIds.length, 12); assert.equal(retainedIds.length, 7);
assert.equal(selection.newClips, newIds.length); assert.equal(selection.retainedFormalClips, retainedIds.length);
assert.notEqual(catalog.revision, oldCatalog.revision, 'A changed source set needs a fresh binary/cache revision');

// Import the actual candidate runtime, not a reimplementation or a test fixture.
const motion = await import(pathToFileURL(resolve(root, 'lib/approved-motion.mjs')));
const codec = await import(pathToFileURL(resolve(root, 'lib/approved-motion-codec.mjs')));
const host = await import(pathToFileURL(resolve(root, 'lib/index.js')));
const normalized = motion.normalizeApprovedMotionCatalog(catalog);
assert.ok(normalized); assert.deepEqual(Object.keys(normalized.clips).sort(), expectedIds);
assert.deepEqual(catalog.logicalCanvas, { width: 640, height: 640 });
assert.deepEqual(catalog.anchor, [320, 608]);
assert.deepEqual(normalized.chain, oldCatalog.chain, 'Keep the approved keyboard lifecycle');
assert.equal(normalized.chain.enterDurationMs, 400); assert.equal(normalized.chain.exitDurationMs, 400);
const provenancePath = inside(animated, catalog.indexedBinaryProvenance.file);
assert.equal(hash(provenancePath), catalog.indexedBinaryProvenance.sha256);
const provenance = json(provenancePath);
assert.equal(provenance.revision, catalog.revision);
function unpack(path) {
  let packed = bytes(path);
  if (packed[0] === 0x1f && packed[1] === 0x8b) packed = gunzipSync(packed, { maxOutputLength: codec.APPROVED_INDEXED_MAX_BYTES });
  const raw = codec.decodeApprovedMotionBinary(packed);
  assert.ok(raw, `${path}: real binary codec rejects this resource`);
  return raw;
}
function payloadSha(raw) {
  const h = createHash('sha256');
  for (const { pixels } of raw.frames) {
    if (pixels.BYTES_PER_ELEMENT === 1) h.update(pixels);
    else { const le = Buffer.alloc(pixels.length * 2); for (let i = 0; i < pixels.length; i++) le.writeUInt16LE(pixels[i], i * 2); h.update(le); }
  }
  return h.digest('hex');
}
function timeline(frames, period, label) {
  assert.equal(frames[0].atMs, 0, label); let held = 0;
  for (let i = 0; i < frames.length; i++) {
    const end = frames[i + 1]?.atMs ?? period, duration = end - frames[i].atMs;
    assert.ok(duration > 0, `${label}: positive chronological hold`); held += duration;
    const picked = motion.approvedMotionFrameAt(frames, frames[i].atMs, period, true);
    assert.equal(picked.index, i, `${label}: frame-boundary selection`);
    assert.ok(Math.abs(picked.nextInMs - duration) < .00001, `${label}: exact nextInMs clock`);
    assert.equal(motion.approvedMotionFrameAt(frames, frames[i].atMs + duration / 2, period, false).index, i);
  }
  assert.ok(Math.abs(held - period) < .00001, `${label}: no lost tail or speedup`);
  assert.equal(motion.approvedMotionFrameAt(frames, period, period, true).index, 0);
  assert.equal(motion.approvedMotionFrameAt(frames, period + 100, period, false).index, frames.length - 1);
}
const rawByFile = new Map(), physicalFiles = new Set(), hdTasks = [], report = [];
for (const id of expectedIds) {
  const selected = selection.clips[id], clip = catalog.clips[id], previous = oldCatalog.clips[id];
  assert.equal(clip.id, id); assert.equal(clip.family, previous.family); assert.equal(clip.loop, previous.loop);
  assert.deepEqual(clip.paintRect, selected.paintRect, `${id}: authored paintRect`);
  assert.deepEqual([320 - clip.qa.pivot[0], 608 - clip.qa.pivot[1]], [clip.paintRect.x, clip.paintRect.y]);
  assert.deepEqual(clip.qa.sourceCanvas, [clip.paintRect.width, clip.paintRect.height]);
  assert.equal(clip.qa.perFrameFit, false); assert.equal(clip.qa.accepted, true);
  assert.equal(clip.qa.sourceVideoSha256, selected.sourceVideoSha256);
  assert.equal(clip.frameCount, selected.nativeFrames); assert.equal(clip.periodMs, selected.periodMs);
  assert.deepEqual(Object.keys(clip.indexed).sort(), ['illustration', 'umi']);
  const { aliasOf, ...illustratedEntry } = clip.indexed.illustration;
  if (aliasOf !== undefined) assert.equal(aliasOf, 'umi', `${id}: illustration aliases only the approved rendition`);
  assert.deepEqual(illustratedEntry, clip.indexed.umi, `${id}: illustrated aliases read one rendition`);
  const entry = clip.indexed.umi, path = inside(animated, entry.file);
  physicalFiles.add(entry.file); assert.equal(hash(path), entry.sha256);
  const raw = unpack(path); rawByFile.set(entry.file, raw);
  assert.equal(raw.revision, catalog.revision); assert.equal(raw.clipId, id);
  assert.equal(raw.frameCount, raw.frames.length); assert.equal(raw.frames.length, entry.frameCount);
  const record = provenance.files.find(item => item.file === entry.file);
  assert.ok(record, `${id}: indexed provenance record`);
  assert.equal(record.sha256, entry.sha256); assert.equal(record.frameCount, raw.frames.length);
  assert.equal(record.payloadSha256, payloadSha(raw), `${id}: exact decoded index payload`);
  hex(entry.sourceJsonSha256); assert.equal(record.sourceJsonSha256, entry.sourceJsonSha256);
  for (const style of ['umi', 'illustration']) assert.ok(motion.decodeApprovedMotionIndexed(raw, normalized, normalized.clips[id], style), `${id}/${style}: real indexed QA/schema accepts`);
  assert.equal(motion.decodeApprovedMotionIndexed({ ...raw, revision: 'stale' }, catalog, clip, 'umi'), null);
  assert.equal(motion.decodeApprovedMotionIndexed({ ...raw, qa: { ...raw.qa, sourceVideoSha256: '0'.repeat(64) } }, catalog, clip, 'umi'), null);
  timeline(clip.hires.frames, clip.periodMs, `${id}/HD`); timeline(raw.frames, clip.periodMs, `${id}/Pi`);
  for (const frame of clip.hires.frames) {
    const file = inside(animated, clip.hires.baseUrl + frame.file);
    assert.equal(hash(file), frame.webpSha256 ?? frame.sourceAsset?.webpSha256, `${id}/${frame.id}: HD bytes bound`);
  }
  if (selected.selection === 'retain-formal') {
    const oldRaw = unpack(inside(original, previous.indexed.umi.file));
    const { revision: ignoredNew, ...actual } = raw, { revision: ignoredOld, ...expected } = oldRaw;
    assert.deepEqual(actual, expected, `${id}: all decoded metadata, palette, every index and clock unchanged except top-level revision`);
    assert.deepEqual(clip.qa, previous.qa, `${id}: retained approval evidence`);
    assert.deepEqual(clip.hires, previous.hires, `${id}: retained HD metadata and timeline`);
    for (const frame of previous.hires.frames) assert.equal(hash(inside(animated, clip.hires.baseUrl + frame.file)), hash(inside(original, previous.hires.baseUrl + frame.file)), `${id}: original HD bytes`);
  } else {
    assert.equal(selected.technicalCloseoutPending, false, `${id}: unclosed technical candidate`);
    const job = inside(baseline, selected.job), processed = inside(job, selected.processedVariant);
    const manifestPath = resolve(processed, 'manifest.json'), native = json(manifestPath);
    assert.equal(hash(manifestPath), selected.processedManifestSha256, `${id}: exact approved processed selection`);
    assert.equal(native.source.sha256, selected.sourceVideoSha256);
    assert.equal(clip.qa.userApprovalSha256, selected.userApprovalSha256);
    assert.equal(clip.qa.motionManifestSha256, selected.processedManifestSha256);
    assert.equal(native.frames.length, selected.nativeFrames); assert.equal(native.periodMs, clip.periodMs);
    assert.equal(native.fps, 24); assert.ok(Math.abs(native.frames.length * 1000 / native.fps - native.periodMs) < 1);
    assert.equal(native.sampling.timeScale, 1); assert.equal(native.sampling.reverse, false);
    assert.equal(native.sampling.interpolation, false); assert.equal(native.sampling.crossfade, false);
    assert.deepEqual(clip.hires.frames.map(f => f.atMs), native.frames.map(f => f.atMs), `${id}: native complete time retained`);
    const sourceIndices = native.frames.map((_, i) => i).filter(i => i % 2 === 0);
    assert.deepEqual(raw.frames.map(f => f.sourceFrame), sourceIndices, `${id}: explicit12fps sampling, including final native frame`);
    assert.deepEqual(raw.frames.map(f => f.atMs), sourceIndices.map(i => native.frames[i].atMs), `${id}: sampled original clocks, no time compression`);
    assert.equal(raw.periodMs, native.periodMs);
    for (let i = 0; i < native.frames.length; i++) {
      const source = inside(processed, `rgba/${native.frames[i].file}`), hd = clip.hires.frames[i];
      assert.equal(hash(source), native.frames[i].sha256, `${id}/${i}: original processed PNG`);
      assert.equal(hd.sourceFrame, i, `${id}: forward complete native order`);
      hdTasks.push({ id, frame: i, source, webp: inside(animated, clip.hires.baseUrl + hd.file), decodedSha256: hd.decodedRgbaSha256 ?? hd.sourceAsset?.decodedRgbaSha256,
        overlay: id === 'wait' ? inside(baseline, selected.stationaryOverlay.file) : null, rect: clip.paintRect, indexedWidth: raw.width, indexedHeight: raw.height });
    }
  }
  report.push({ id, selection: selected.selection, nativeFrames: clip.frameCount, indexedFrames: raw.frames.length, periodMs: clip.periodMs, paintRect: clip.paintRect });
}
assert.equal(physicalFiles.size, 19, '19 actual rendition files, not historical provenance record count');

// Pillow is already a build dependency. Decode actual WebP pixels, not PNG/WebP byte hashes.
// Every new HD frame must equal its approved processed RGBA, with only the exact
// approved fixed question composited into wait. This says nothing about old/new art equality.
const pixelProof = spawnSync(option('--python', 'python'), ['-c', String.raw`
import sys,json,hashlib
from PIL import Image
tasks=json.load(sys.stdin); question=None
for t in tasks:
    expected=Image.open(t['source']).convert('RGBA')
    if t['overlay']:
        overlay=Image.open(t['overlay']).convert('RGBA')
        assert overlay.size==(640,640)
        expected.alpha_composite(overlay,(-t['rect']['x'],-t['rect']['y']))
        if question is None:
            small=overlay.resize((t['indexedWidth'],t['indexedHeight']),Image.Resampling.LANCZOS)
            candidates=[(x,y,list(small.getpixel((x,y)))[:3]) for y in range(small.height) for x in range(small.width) if small.getpixel((x,y))[3]>=254]
            assert len(candidates)>=8,'Fixed question lacks visible interior'
            question=[candidates[i] for i in range(0,len(candidates),max(1,len(candidates)//24))][:24]
    actual=Image.open(t['webp']).convert('RGBA')
    assert actual.size==expected.size,(t['id'],t['frame'],'HD dimensions')
    assert actual.tobytes()==expected.tobytes(),(t['id'],t['frame'],'approved RGBA changed or question omitted/moved')
    if t['decodedSha256']:
        assert hashlib.sha256(actual.tobytes()).hexdigest()==t['decodedSha256'],(t['id'],t['frame'],'decoded SHA')
print(json.dumps({'newHDFramesPixelExact':len(tasks),'questionSamples':question}))
`], { input: JSON.stringify(hdTasks), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
assert.equal(pixelProof.status, 0, `Actual HD pixel proof failed: ${pixelProof.error?.message ?? ''}\n${pixelProof.stderr}\n${pixelProof.stdout}`);
const hdProof = JSON.parse(pixelProof.stdout);
const overlay = selection.clips.wait.stationaryOverlay;
assert.equal(hash(inside(baseline, overlay.file)), overlay.sha256, 'Exact stationary question source');
const wait = rawByFile.get(catalog.clips.wait.indexed.umi.file);
for (const frame of wait.frames) for (const [x, y, rgb] of hdProof.questionSamples) {
  const index = frame.pixels[y * wait.width + x];
  assert.notEqual(index, wait.transparentIndex, `Pi/${frame.id}: stationary question cannot vanish`);
  assert.ok(Math.hypot(...wait.palette[index].map((v, i) => v - rgb[i])) < 90, `Pi/${frame.id}: fixed question location/color retained after palette quantization`);
}

// Exercise real state/gesture selection and both style aliases, including chain.
const routes = new Set(); let clock = 0;
const player = motion.createApprovedMotionPlayer({ catalog, now: () => clock, loadIndexed: file => rawByFile.get(file) });
for (const style of ['umi', 'illustration']) {
  for (const [phase, id] of Object.entries(motion.APPROVED_MOTION_STATES)) {
    player.reset(); clock = 0; let picked = player.sample({ phase }, { style });
    if (id === 'work') { assert.equal(picked.clipId, 'work-enter'); routes.add('work-enter'); clock = 400; picked = player.sample({ phase }, { style }); }
    assert.equal(picked.clipId, id); routes.add(id);
    assert.ok(player.indexedFrame(picked, style));
  }
  for (const id of ['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection']) {
    player.reset(); const picked = player.sample({ phase: 'idle', gesture: { id, elapsedMs: 0 } }, { style });
    assert.equal(picked.clipId, id); assert.ok(player.indexedFrame(picked, style)); routes.add(id);
  }
  player.reset(); clock = 0; player.sample({ phase: 'editing' }, { style }); clock = 400; player.sample({ phase: 'editing' }, { style });
  clock = 450; const exit = player.sample({ phase: 'idle' }, { style }); assert.equal(exit.clipId, 'work-exit'); routes.add('work-exit');
  clock = 850; assert.equal(player.sample({ phase: 'idle' }, { style }).clipId, 'idle');
  assert.equal(player.sample({ phase: 'speaking' }, { style }), null, 'Independent speech mouth branch is not swallowed');
}
assert.deepEqual([...routes].sort(), expectedIds);
for (const style of ['pixel', 'umi-pixel']) assert.equal(player.sample({ phase: 'idle' }, { style }), null);
assert.ok(player.stats().clips <= 2); player.dispose();

const pixelProvenance = json(resolve(baseline, 'build/legacy-pixel-provenance.json'));
for (const item of pixelProvenance.files) assert.equal(hash(inside(root, item.path)), item.sha256, `${item.path}: exact original pixel bytes`);
assert.equal(existsSync(resolve(root, 'assets/animated/indexed/pixel')), false);
assert.equal(existsSync(resolve(root, 'assets/animated/indexed/umi-pixel')), false);
for (const file of ['assets/branding/title.json', 'assets/branding/umi-title.png',
  'assets/reactions/umi/reaction-sheet.json', 'assets/reactions/illustration/reaction-sheet.json', 'assets/hires/umi/manifest.json'])
  assert.equal(hash(inside(root, file)), hash(inside(baseline, file)), `${file}: independent static/mouth bank unchanged`);
const title = host.loadTitleBranding('auto');
assert.equal(title.animated, false); assert.equal(title.contentType, 'image/png');
assert.equal(sha(title.bytes), hash(resolve(baseline, 'assets/branding/umi-title.png')));
for (const style of ['umi', 'illustration']) {
  const packet = host.loadEncodedSheet(style), names = ['talk-closed', 'talk-small', 'talk-medium', 'talk-wide'];
  for (const name of names.flatMap(name => [name, `${name}-blink`])) assert.ok(packet.frames.some(f => f.id === name), `${style}: independent ${name}`);
  assert.notEqual(packet.frames.find(f => f.id === 'talk-closed').pixels, packet.frames.find(f => f.id === 'talk-wide').pixels);
}
console.log(JSON.stringify({ passed: true, stageRoot: root, selectionSha256: hash(selectionPath), baselineCatalogSha256: selection.formalCatalogSha256,
  revision: catalog.revision, newClips: newIds.length, retainedClips: retainedIds.length, physicalIndexedFiles: physicalFiles.size, logicalEntries: physicalFiles.size * 2,
  newHDFramesPixelExact: hdProof.newHDFramesPixelExact, retainedDecodedMetadataPaletteIndicesClockExactExceptRevision: true,
  originalPixelFilesExact: pixelProvenance.files.length, waitQuestionInBothRenditions: true, staticTitleAndIndependentMouths: true, clips: report }));
