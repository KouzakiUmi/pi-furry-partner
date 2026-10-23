import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(type, data) {
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, data])) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(typeName, data) {
  const type = Buffer.from(typeName, "ascii");
  const header = Buffer.allocUnsafe(4), checksum = Buffer.allocUnsafe(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(type, data));
  return Buffer.concat([header, type, data, checksum]);
}

/** Encode an indexed frame as a transparent palette PNG accepted by Kitty. */
export function encodeIndexedPng({ pixels, width, height, palette, transparentIndex = 0 }) {
  width = Math.floor(width); height = Math.floor(height);
  if (!(width > 0 && height > 0) || !pixels || pixels.length !== width * height) throw new TypeError("Indexed PNG dimensions do not match its pixels");
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 256) throw new TypeError("Indexed PNG requires a palette with 1-256 colors");
  const plte = Buffer.allocUnsafe(palette.length * 3);
  for (let index = 0; index < palette.length; index++) {
    const color = palette[index];
    if (!Array.isArray(color) || color.length < 3 || color.slice(0, 3).some((value) => !Number.isFinite(value))) throw new TypeError("Invalid indexed PNG palette color");
    for (let channel = 0; channel < 3; channel++) plte[index * 3 + channel] = Math.max(0, Math.min(255, Math.round(color[channel])));
  }
  const raw = Buffer.allocUnsafe((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width + 1); raw[offset] = 0;
    for (let x = 0; x < width; x++) {
      const value = pixels[y * width + x];
      if (!Number.isInteger(value) || value < 0 || value >= palette.length) throw new TypeError("Indexed PNG pixel is outside its palette");
      raw[offset + x + 1] = value;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 3; // 8-bit indexed color
  const chunks = [PNG_SIGNATURE, chunk("IHDR", ihdr), chunk("PLTE", plte)];
  if (Number.isInteger(transparentIndex) && transparentIndex >= 0 && transparentIndex < palette.length) {
    const alpha = Buffer.alloc(palette.length, 255); alpha[transparentIndex] = 0;
    chunks.push(chunk("tRNS", alpha));
  }
  chunks.push(chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function sampleStripe(sheet, frame, columns, rows, row, cell) {
  const physicalWidth = Math.max(1, Math.round(columns * cell.widthPx));
  // Never manufacture detail above the authored source width. Keep each PNG's
  // aspect equal to one terminal-cell row so Pi reserves exactly `columns` cells.
  const width = Math.max(1, Math.min(sheet.width, physicalWidth));
  const height = Math.max(1, Math.round(width * cell.heightPx / physicalWidth));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sheet.height - 1, Math.floor(((row + (y + 0.5) / height) * sheet.height) / rows));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sheet.width - 1, Math.floor((x + 0.5) * sheet.width / width));
      pixels[y * width + x] = frame.pixels[sy * sheet.width + sx];
    }
  }
  return { pixels, width, height };
}

/**
 * Render each mascot cell row as an independent Kitty PNG placement. Row-sized
 * images preserve Pi's ordinary line layout, clipping and differential redraws.
 */
export function createKittyTransport({ getCellDimensions, getSheet, getStyle = () => "pixel", getViewport = () => undefined, isAllowed = () => true, getOverlayVersion = () => 0, createOverlayMarker, renderImage, allocateImageId, deleteImage, deleteImageSequence, maxFrames = 32 } = {}) {
  const available = typeof renderImage === "function" && typeof allocateImageId === "function" && typeof getCellDimensions === "function";
  const supportsOverlayMarkers = typeof createOverlayMarker === "function" && typeof deleteImageSequence === "function";
  const limit = Math.max(1, Math.min(128, Math.floor(maxFrames) || 32));
  const cache = new Map();
  const imageIds = [], overlayMarkers = new Map();
  let lastKey, lastViewportKey, lastLines, overlayMarkerShape, disposed = false;

  function remember(key, create) {
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
    }
    const value = create(); cache.set(key, value);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return value;
  }

  return {
    render({ frameIndex, columns, rows }) {
      if (!available || disposed || (!supportsOverlayMarkers && !isAllowed())) return undefined;
      columns = Math.max(1, Math.floor(columns)); rows = Math.max(1, Math.floor(rows));
      const sheet = getSheet?.();
      if (!sheet?.frames?.length || !sheet.palette?.length || !(sheet.width > 0 && sheet.height > 0)) return undefined;
      const frame = sheet.frames[frameIndex % sheet.frames.length];
      if (!frame?.pixels || frame.pixels.length !== sheet.width * sheet.height) return undefined;
      const cell = getCellDimensions();
      if (!(cell?.widthPx > 0 && cell?.heightPx > 0)) return undefined;
      const frameKey = frame.cacheKey ?? frameIndex;
      const imageKey = JSON.stringify([getStyle(), frameKey, sheet.width, sheet.height, columns, rows, cell.widthPx, cell.heightPx]);
      const overlayVersion = supportsOverlayMarkers ? getOverlayVersion() : 0;
      const key = `${imageKey}:${overlayVersion}`;
      const viewportKey = JSON.stringify(getViewport?.());
      // Pi may clear Kitty image data during a fullscreen resize while retaining
      // its placement cache. Re-register the existing PNGs on viewport changes
      // so Pi keeps their full uploads for this redraw instead of only `a=p`.
      if (key === lastKey && viewportKey === lastViewportKey) return lastLines;
      const pngs = remember(imageKey, () => Array.from({ length: rows }, (_, row) => {
        const stripe = sampleStripe(sheet, frame, columns, rows, row, cell);
        const png = encodeIndexedPng({ ...stripe, palette: frame.palette ?? sheet.palette, transparentIndex: sheet.transparentIndex ?? 0 });
        // The PNG may remain narrower than the cell rectangle when the authored
        // frame is small. Declare the target rectangle separately so Pi's
        // aspect-ratio optimization cannot shrink the Kitty placement columns.
        return { data: png.toString("base64"), widthPx: stripe.width, heightPx: stripe.height,
          placementWidthPx: Math.max(1, Math.round(columns * cell.widthPx)), placementHeightPx: Math.max(1, Math.round(cell.heightPx)) };
      }));
      const lines = [];
      const markerShape = `${columns}:${rows}`;
      if (markerShape !== overlayMarkerShape) {
        for (const marker of overlayMarkers.values()) marker.dispose();
        overlayMarkers.clear(); overlayMarkerShape = markerShape;
      }
      for (let row = 0; row < rows; row++) {
        imageIds[row] ??= allocateImageId();
        const png = pngs[row];
        const result = renderImage(png.data, { widthPx: png.placementWidthPx, heightPx: png.placementHeightPx }, {
          maxWidthCells: columns, maxHeightCells: 1, imageId: imageIds[row], moveCursor: false,
        });
        if (!result || result.rows !== 1) return undefined;
        // Place first, then advance through the reserved mascot cells. Existing
        // dock alignment may prepend centering spaces before this sequence.
        let marker = "";
        if (supportsOverlayMarkers) {
          let overlayMarker = overlayMarkers.get(row);
          if (!overlayMarker) {
            const imageId = imageIds[row];
            overlayMarker = createOverlayMarker({
              width: columns,
              onAnchor: (rect) => rect && isAllowed(rect) ? "" : deleteImageSequence(imageId),
            });
            overlayMarkers.set(row, overlayMarker);
          }
          marker = overlayMarker.render(overlayVersion);
        }
        lines.push(result.sequence + " ".repeat(columns) + marker);
      }
      lastKey = key; lastViewportKey = viewportKey; lastLines = lines;
      return lines;
    },
    invalidate() { lastKey = undefined; lastViewportKey = undefined; lastLines = undefined; },
    stats() { return { available, frames: cache.size, maxFrames: limit, imageIds: imageIds.length, disposed }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof deleteImage === "function") for (const imageId of imageIds) {
        try { deleteImage(imageId); } catch { /* The host screen also removes stale placements on its next redraw. */ }
      }
      imageIds.length = 0; cache.clear();
      for (const marker of overlayMarkers.values()) marker.dispose();
      overlayMarkers.clear(); lastKey = undefined; lastViewportKey = undefined; lastLines = undefined;
    },
  };
}
