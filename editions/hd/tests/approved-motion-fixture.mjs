export const approvedMotionFixtureQa = { accepted: true, manifestSha256: 'a'.repeat(64), userApprovalSha256: 'b'.repeat(64),
  sourceVideoSha256: 'c'.repeat(64), sourceCanvas: [896, 896], pivot: [448, 608], perFrameFit: false };
export function approvedMotionFixture() {
  const clips = {}, data = {};
  for (const id of ['idle', 'think', 'work', 'listen', 'wait', 'rest', 'watch', 'search',
    'joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection', 'work-enter', 'work-exit']) {
    const transition = id.startsWith('work-'), periodMs = transition ? 400 : 1000;
    const times = transition ? Array.from({ length: 24 }, (_, i) => i * 400 / 24) : [0, 250, 500, 750];
    const family = transition ? 'transition' : ['joy', 'grumpy', 'sad', 'cry', 'shy', 'flustered', 'surprise', 'proud', 'affection'].includes(id) ? 'gesture' : ['watch', 'search'].includes(id) ? 'action' : 'state';
    const clip = { id, family, periodMs, loop: !transition, frameCount: times.length,
      paintRect: { x: -128, y: 0, width: 896, height: 896 }, qa: approvedMotionFixtureQa,
      hires: { baseUrl: `hires/${id}/`, frames: times.map((atMs, i) => ({ id: `${id}-${i}`, file: `${String(i).padStart(3, '0')}.webp`, atMs })) }, indexed: {} };
    for (const style of ['umi', 'illustration']) {
      const file = `indexed/${style}/${id}.json`, indexedTimes = transition ? Array.from({ length: 8 }, (_, i) => i * 50) : times;
      clip.indexed[style] = { file, width: 2, height: 2, frameCount: indexedTimes.length };
      data[file] = { schemaVersion: 1, clipId: id, revision: 'approved-test-v1', width: 2, height: 2,
        palette: [[0, 0, 0], [10, 20, 30], [40, 50, 60]], transparentIndex: 0, periodMs, loop: !transition,
        frames: indexedTimes.map((atMs, i) => ({ id: `${id}-${i}`, atMs, sourceFrame: i, pixels: [0, 1, i % 2 ? 2 : 1, 0] })), qa: approvedMotionFixtureQa };
    }
    clips[id] = clip;
  }
  return { catalog: { schemaVersion: 1, revision: 'approved-test-v1', approvedStaticRevision: 'approved-static-test',
    logicalCanvas: { width: 640, height: 640 }, anchor: [320, 608], clips,
    chain: { enterClip: 'work-enter', loopClip: 'work', exitClip: 'work-exit', enterDurationMs: 400, exitDurationMs: 400 } }, data };
}
