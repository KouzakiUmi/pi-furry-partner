import { readFile } from 'node:fs/promises';

// Keep the accepted real 107-frame timelines/world registration; tiny indexed
// pixels make host routing tests offline and inexpensive, not artwork tests.
export async function addNativeInteractionClips(catalog, data) {
  const authored = JSON.parse(await readFile(new URL('../assets/animated/catalog.json', import.meta.url), 'utf8'));
  for (const id of ['wave', 'bounce', 'ear-flick', 'head-shake']) {
    const clip = structuredClone(authored.clips[id]);
    for (const style of ['umi', 'illustration']) {
      const file = `indexed/${style}/native-${id}.json`;
      const frames = clip.hires.frames.filter(f => f.sourceFrame % 2 === 0).map(f => ({ id: f.id, atMs: f.atMs, sourceFrame: f.sourceFrame, pixels: [0, 1, f.sourceFrame % 4 ? 2 : 1, 0] }));
      data[file] = { schemaVersion: 1, clipId: id, revision: catalog.revision, width: 2, height: 2,
        palette: [[0, 0, 0], [10, 20, 30], [40, 50, 60]], transparentIndex: 0,
        periodMs: clip.periodMs, loop: clip.loop, qa: clip.qa, frames };
      clip.indexed[style] = { file, width: 2, height: 2, frameCount: frames.length };
    }
    catalog.clips[id] = clip;
  }
  return catalog;
}
