// Read-only Pi package resources; independent of the former DSH Host.
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeStyle,styleAssetDirectory} from './styles.mjs';
import {withPokeFrame} from './poke.mjs';
import {withWatchFrames} from './watch.mjs';
import {withListenFrames} from './listen.mjs';
import {withSearchFrames} from './search.mjs';
import {withExpressionFrames} from './expressions.mjs';
import {normalizeGestureVideoCatalog} from './gesture-video.mjs';
import {FULL_ANIMATION_EDITION} from './build-profile.mjs';
const rootDir=join(dirname(fileURLToPath(import.meta.url)),'..');
const readJsonFile=p=>JSON.parse(readFileSync(p,'utf8'));
const encodedSheetCache=new Map(),animatedAssetLists=new WeakMap();
const animatedRoot=join(rootDir,'assets/animated');
let cachedAnimatedCatalog=null;
export function loadAnimatedCatalog(directory = animatedRoot) {
  if (!FULL_ANIMATION_EDITION) throw new Error('Complete animation is disabled for this build edition');
  if (directory === animatedRoot && cachedAnimatedCatalog) return cachedAnimatedCatalog;
  const data = readJsonFile(join(directory, 'catalog.json'));
  if (data?.schemaVersion !== 1 || typeof data.revision !== 'string' || !data.revision ||
      data.logicalCanvas?.width !== 640 || data.logicalCanvas?.height !== 640 ||
      !data.clips || typeof data.clips !== 'object') throw new Error('Invalid approved motion catalog');
  if (directory === animatedRoot) cachedAnimatedCatalog = data;
  return data;
}
export function loadAnimatedAsset(assetPath, revision, directory = animatedRoot) {
  const value = String(assetPath || '');
  if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(?:json|webp|uix\.gz)$/.test(value)) return null;
  const catalog = loadAnimatedCatalog(directory);
  if (revision && revision !== catalog.revision) return null;
  let permitted = animatedAssetLists.get(catalog);
  if (!permitted) {
    permitted = new Set();
    for (const clip of Object.values(catalog.clips)) {
      if (clip?.qa?.accepted !== true) continue;
      for (const entry of Object.values(clip.indexed || {})) if (typeof entry.file === 'string') permitted.add(entry.file);
      for (const frame of clip.hires?.frames || []) permitted.add(`${clip.hires.baseUrl}${frame.file}`);
    }
    animatedAssetLists.set(catalog, permitted);
  }
  if (!permitted.has(value)) return null;
  const root = realpathSync(directory), target = realpathSync(resolve(directory, value));
  const within = relative(root, target);
  if (isAbsolute(within) || within === '..' || within.startsWith('..\\') || within.startsWith('../')) return null;
  const bytes = readFileSync(target);
  // Deliberately no Content-Encoding: fetch.arrayBuffer receives stored gzip bytes.
  return { bytes, contentType: value.endsWith('.webp') ? 'image/webp'
      : value.endsWith('.uix.gz') ? 'application/gzip' : 'application/json; charset=utf-8',
    etag: `"${createHash('sha256').update(bytes).digest('hex')}"`, revision: catalog.revision };
}


export function loadEncodedSheet(styleInput = "umi") {
  const style = normalizeStyle(styleInput) || "umi";
  if (encodedSheetCache.has(style)) return encodedSheetCache.get(style);

  const directory = join(rootDir, "assets", "reactions", styleAssetDirectory(style));
  const base = readJsonFile(join(directory, "reaction-sheet.json"));
  let augmented = base;
  try { augmented = withPokeFrame(augmented, readJsonFile(join(directory, "poke-patch.json"))); } catch { /* Optional */ }
  try { augmented = withWatchFrames(augmented, readJsonFile(join(directory, "watch-frames.json"))); } catch { /* Optional */ }
  try { augmented = withListenFrames(augmented, readJsonFile(join(directory, "listen-frames.json"))); } catch { /* Optional */ }
  try { augmented = withSearchFrames(augmented, readJsonFile(join(directory, "search-frames.json"))); } catch { /* Optional */ }
  try { augmented = withExpressionFrames(augmented, readJsonFile(join(directory, "expression-frames.json"))); } catch { /* Optional */ }
  let gestureCatalog = normalizeGestureVideoCatalog(null);
  try { gestureCatalog = normalizeGestureVideoCatalog(readJsonFile(join(directory, 'gesture-videos.json'))); } catch { /* Optional metadata. */ }

  const encoded = {
    schemaVersion: augmented.schemaVersion ?? 1,
    style,
    approvedStaticRevision: augmented.approvedStaticRevision,
    width: augmented.width,
    height: augmented.height,
    transparentIndex: augmented.transparentIndex ?? 0,
    palette: augmented.palette,
    pixelsEncoding: augmented.palette.length > 256 ? 'u16le' : 'u8',
    ids: augmented.ids,
    motion: augmented.motion,
    gestureCatalog,
    frames: augmented.frames.map(({ id, pixels }) => ({
      id,
      pixels: encodePixels(pixels,augmented.palette.length > 256),
    })),
  };
  encodedSheetCache.set(style, encoded);
  return encoded;
}


function encodePixels(pixels,wide) {
  if (!wide) return Buffer.from(pixels).toString('base64');
  const bytes=Buffer.alloc(pixels.length*2);
  for(let i=0;i<pixels.length;i++)bytes.writeUInt16LE(pixels[i],i*2);
  return bytes.toString('base64');
}

