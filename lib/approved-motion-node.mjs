// Node-only boundary; browser code never imports node:zlib.
import { gunzipSync } from 'node:zlib';
import { approvedIndexedBytes, decodeApprovedMotionBinary, APPROVED_INDEXED_MAX_BYTES } from './approved-motion-codec.mjs';

export function decodeApprovedMotionNodeResource(input) {
  let bytes = approvedIndexedBytes(input);
  if (!bytes || bytes.length > 64 * 1024 * 1024) throw new Error('Invalid indexed resource size');
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (bytes.length > APPROVED_INDEXED_MAX_BYTES) throw new Error('Invalid compressed indexed resource size');
    bytes = gunzipSync(bytes, { maxOutputLength: APPROVED_INDEXED_MAX_BYTES });
  }
  if (bytes[0] === 0x7b || bytes[0] === 0x20 || bytes[0] === 0x0a || bytes[0] === 0xef)
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const raw = decodeApprovedMotionBinary(bytes);
  if (!raw) throw new Error('Invalid exact indexed binary resource');
  return raw;
}
