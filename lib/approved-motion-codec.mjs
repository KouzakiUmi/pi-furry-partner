// Exact indexed transport. This module is browser-safe and shared by Pi/DSH.
// Wire: UMIIDX01 | u32le JSON bytes | u32le pixel bytes | padded JSON | pixels.
// The JSON envelope is { encoding: 'u8'|'u16le', data: originalMetadata }.
export const APPROVED_INDEXED_MAX_BYTES = 25 * 1024 * 1024;
export const APPROVED_INDEXED_MAX_HEADER = 1024 * 1024;
export const APPROVED_INDEXED_MAGIC = 'UMIIDX01';

export function approvedIndexedBytes(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

export function decodeApprovedMotionBinary(input) {
  try {
    const bytes = approvedIndexedBytes(input);
    if (!bytes || bytes.length < 16 || bytes.length > APPROVED_INDEXED_MAX_BYTES) return null;
    for (let i = 0; i < 8; i++) if (bytes[i] !== APPROVED_INDEXED_MAGIC.charCodeAt(i)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const headerLength = view.getUint32(8, true), payloadLength = view.getUint32(12, true);
    if (!headerLength || headerLength > APPROVED_INDEXED_MAX_HEADER ||
        16 + headerLength + payloadLength !== bytes.length) return null;
    const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(16, 16 + headerLength)));
    const raw = envelope?.data;
    if (raw?.schemaVersion !== 1 || !Number.isInteger(raw.width) || raw.width < 1 || raw.width > 640 ||
        !Number.isInteger(raw.height) || raw.height < 1 || raw.height > 640 || raw.transparentIndex !== 0 ||
        typeof raw.clipId !== 'string' || typeof raw.revision !== 'string' ||
        !Number.isFinite(raw.periodMs) || raw.periodMs < 80 || raw.periodMs > 15000 || typeof raw.loop !== 'boolean' ||
        !Array.isArray(raw.frames) || raw.frames.length < 2 || raw.frames.length > 256 ||
        !Array.isArray(raw.palette) || raw.palette.length < 2 || raw.palette.length > 512 ||
        raw.palette.some(c => !Array.isArray(c) || c.length !== 3 || c.some(n => !Number.isInteger(n) || n < 0 || n > 255))) return null;
    const samplesPerFrame = raw.width * raw.height, samples = samplesPerFrame * raw.frames.length;
    if (samples > 12000000) return null;
    const word = raw.palette.length > 256;
    if (envelope.encoding !== (word ? 'u16le' : 'u8') || payloadLength !== samples * (word ? 2 : 1)) return null;
    const ids = new Set();
    for (let i = 0; i < raw.frames.length; i++) {
      const frame = raw.frames[i];
      if (!frame || Object.hasOwn(frame, 'pixels') || typeof frame.id !== 'string' || !frame.id || frame.id.length >= 120 ||
          ids.has(frame.id) || !Number.isFinite(frame.atMs) || frame.atMs < 0 || frame.atMs >= raw.periodMs ||
          (i ? frame.atMs <= raw.frames[i - 1].atMs : frame.atMs !== 0)) return null;
      ids.add(frame.id);
    }
    const payload = bytes.subarray(16 + headerLength);
    let pixels;
    if (!word) pixels = payload;
    else {
      // Explicit LE decoding also works on BE hosts and unaligned Uint8Array views.
      pixels = new Uint16Array(samples);
      const words = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      for (let i = 0; i < samples; i++) pixels[i] = words.getUint16(i * 2, true);
    }
    if (word || raw.palette.length !== 256)
      for (let i = 0; i < pixels.length; i++) if (pixels[i] >= raw.palette.length) return null;
    return { ...raw, frames: raw.frames.map((frame, i) => ({ ...frame,
      pixels: pixels.subarray(i * samplesPerFrame, (i + 1) * samplesPerFrame) })) };
  } catch { return null; }
}

export async function decodeApprovedMotionResource(input, { signal } = {}) {
  let bytes = approvedIndexedBytes(input);
  if (!bytes || bytes.length > APPROVED_INDEXED_MAX_BYTES) throw new Error('Invalid indexed resource size');
  const abort = () => {
    if (signal?.aborted) { const error = new Error('Indexed decode aborted'); error.name = 'AbortError'; throw error; }
  };
  abort();
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') throw new Error('Gzip indexed resources require DecompressionStream');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        abort();
        const item = await reader.read();
        if (item.done) break;
        length += item.value.byteLength;
        if (length > APPROVED_INDEXED_MAX_BYTES) throw new Error('Indexed decompression limit exceeded');
        chunks.push(item.value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    bytes = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  }
  abort();
  // Also accept already-decompressed bytes, preventing transport double-gunzip.
  const raw = decodeApprovedMotionBinary(bytes);
  if (!raw) throw new Error('Invalid exact indexed binary resource');
  return raw;
}
