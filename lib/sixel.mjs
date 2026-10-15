import { createHash, randomBytes } from "node:crypto";

export function graphicsMode(requested = "auto", env = process.env) {
  const value = requested === "auto" ? (env.PI_FURRY_RENDER || env.PI_WINK_RENDER || requested) : requested;
  if (value === "blocks") return "blocks";
  if (value === "sixel") return "sixel";
  return env.WT_SESSION && !env.TMUX ? "sixel" : "blocks";
}

export function sixelCellDimensions(reportedCell, env = process.env) {
  // Windows Terminal uses a fixed 10x20 *virtual* Sixel cell, independent of
  // font pixels. Pi does not query CSI 16t when its native images capability is
  // null (as it is for WT), so its 9x18 fallback would leave 2px gaps per row.
  if (env.WT_SESSION) return { widthPx: 10, heightPx: 20 };
  return reportedCell;
}

function repeatRuns(text) {
  let result = "";
  for (let i = 0; i < text.length;) {
    let end = i + 1;
    while (end < text.length && text[end] === text[i]) end++;
    const count = end - i;
    result += count >= 4 ? `!${count}${text[i]}` : text[i].repeat(count);
    i = end;
  }
  return result;
}

// One independent cell-height stripe per text row allows native viewport cropping.
export function encodeSixelStripe(pixels, width, height, palette) {
  let data = `\x1bP0;1;0q"1;1;${width};${height}`;
  const used = new Set(pixels);
  used.delete(0);
  for (const index of used) {
    data += `#${index};2;${palette[index].map((n) => Math.round(n * 100 / 255)).join(";")}`;
  }
  for (let y = 0; y < height; y += 6) {
    let plane = 0;
    for (const color of used) {
      let row = "";
      for (let x = 0; x < width; x++) {
        let bits = 0;
        for (let bit = 0; bit < 6 && y + bit < height; bit++) {
          if (pixels[(y + bit) * width + x] === color) bits |= 1 << bit;
        }
        row += String.fromCharCode(63 + bits);
      }
      row = row.replace(/\?+$/, "");
      if (!row) continue;
      data += `${plane++ ? "$" : ""}#${color}${repeatRuns(row)}`;
    }
    if (y + 6 < height) data += "-";
  }
  return data + "\x1b\\";
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function fallbackTextWidth(text) {
  let width = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (/\p{Mark}/u.test(ch) || cp === 0xfe0e || cp === 0xfe0f || cp === 0x200d) continue;
    width += cp >= 0x1100 && (cp <= 0x115f || cp >= 0x2e80 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe10 && cp <= 0xfe6f || cp >= 0xff00 && cp <= 0xff60 || cp >= 0xffe0 && cp <= 0xffe6 || cp >= 0x1f000) ? 2 : 1;
  }
  return width;
}

export function createSixelTransport(terminal, getCellDimensions, getSheet, getStyle = () => "pixel", isAllowed = () => true, env = process.env, measureText = fallbackTextWidth, getCursorPosition = () => undefined) {
  // Keep recent frame markers alive for Pi's differential redraws, while
  // bounding both encoded frames and their private OSC payloads during motion.
  const frameCacheLimit = 64;
  const nonce = randomBytes(8).toString("hex");
  const prefix = `\x1b]777;pi-furry-partner-${nonce};`;
  const cache = new Map();
  const stripes = new Map();
  const payloads = new Map();
  const originalWrite = terminal.write;
  let disposed = false;
  let nextToken = 0;
  let cursor = { row: 0, column: 0 };
  let savedCursor;
  let synchronized = false;
  let anchors = [];
  let pendingEscape = "";

  const lineFeed = () => {
    if (cursor.row >= terminal.rows - 1) {
      // Native text scrolling moves markers too. Images are emitted only after
      // the complete text layout, so no DCS can scroll Pi's cursor behind its back.
      for (const anchor of anchors) anchor.row--;
      cursor.row = Math.max(0, terminal.rows - 1);
    } else cursor.row++;
  };
  const textAdvance = (text) => {
    const width = Math.max(1, terminal.columns);
    const amount = measureText(text);
    if (cursor.column + amount <= width) { cursor.column += amount; return; }
    for (const { segment } of segmenter.segment(text)) {
      const count = measureText(segment);
      if (!count) continue;
      if (cursor.column >= width || cursor.column + count > width) { lineFeed(); cursor.column = 0; }
      cursor.column = Math.min(width, cursor.column + count);
    }
  };
  const drawAnchors = () => {
    if (!anchors.length) return "";
    const current = anchors; anchors = [];
    if (disposed) return "";
    let output = "";
    for (const anchor of current) {
      // A 20px stripe occupies four sixel bands (24px). At the true bottom
      // row WT would scroll even with transparent last bits, so keep that row
      // text-only. Pi's editor/footer normally leave several rows below us.
      if (anchor.row < 0 || anchor.row >= terminal.rows - 1 || anchor.column < 0) continue;
      const payload = payloads.get(anchor.token);
      if (!payload) continue;
      // The final sixel band can extend fractionally into the following cell.
      if (!isAllowed({ row: anchor.row, column: anchor.column, width: payload.columns, height: 2 })) continue;
      const delta = anchor.row - cursor.row;
      output += "\x1b7" + (delta < 0 ? `\x1b[${-delta}A` : delta > 0 ? `\x1b[${delta}B` : "")
        + `\x1b[${anchor.column + 1}G` + payload.sixel + "\x1b8";
    }
    return output;
  };
  const trackCsi = (sequence) => {
    const code = sequence.at(-1);
    const body = sequence.slice(2, -1);
    if (/[^\d;]/.test(body)) return;
    const values = body.split(";").map(Number);
    const count = values[0] || 1;
    if (code === "A") cursor.row = Math.max(0, cursor.row - count);
    else if (code === "B" || code === "e") cursor.row = Math.min(terminal.rows - 1, cursor.row + count);
    else if (code === "C" || code === "a") cursor.column = Math.min(terminal.columns - 1, cursor.column + count);
    else if (code === "D") cursor.column = Math.max(0, Math.min(terminal.columns - 1, cursor.column) - count);
    else if (code === "E") { cursor.row = Math.min(terminal.rows - 1, cursor.row + count); cursor.column = 0; }
    else if (code === "F") { cursor.row = Math.max(0, cursor.row - count); cursor.column = 0; }
    else if (code === "G" || code === "`") cursor.column = Math.min(terminal.columns - 1, count - 1);
    else if (code === "d") cursor.row = Math.min(terminal.rows - 1, count - 1);
    else if (code === "H" || code === "f") {
      cursor.row = Math.min(terminal.rows - 1, count - 1);
      cursor.column = Math.min(terminal.columns - 1, (values[1] || 1) - 1);
    } else if (code === "s") savedCursor = { ...cursor };
    else if (code === "u" && savedCursor) cursor = { ...savedCursor };
  };
  const wrapped = function (data) {
    if (typeof data !== "string") return originalWrite.call(terminal, data);
    data = pendingEscape + data; pendingEscape = "";
    const output = [];
    for (let i = 0; i < data.length;) {
      if (data[i] !== "\x1b") {
        const start = i;
        while (i < data.length && data[i] !== "\x1b" && data.charCodeAt(i) >= 32 && data.charCodeAt(i) !== 127) i++;
        if (i > start) { const text = data.slice(start, i); output.push(text); textAdvance(text); continue; }
        const ch = data[i++]; output.push(ch);
        if (ch === "\r") cursor.column = 0;
        else if (ch === "\n" || ch === "\v" || ch === "\f") lineFeed();
        else if (ch === "\b") cursor.column = Math.max(0, cursor.column - 1);
        else if (ch === "\t") cursor.column = Math.min(terminal.columns - 1, (Math.floor(cursor.column / 8) + 1) * 8);
        continue;
      }
      const start = i;
      const kind = data[i + 1];
      if (kind === undefined) { pendingEscape = data.slice(i); break; }
      let end;
      if (kind === "[") {
        end = i + 2;
        while (end < data.length && !(data.charCodeAt(end) >= 0x40 && data.charCodeAt(end) <= 0x7e)) end++;
        if (end >= data.length) { pendingEscape = data.slice(i); break; }
        end++;
      } else if (["]", "P", "_", "^", "X"].includes(kind)) {
        const st = data.indexOf("\x1b\\", i + 2);
        const bel = kind === "]" ? data.indexOf("\x07", i + 2) : -1;
        if (st < 0 && bel < 0) { pendingEscape = data.slice(i); break; }
        end = bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st + 2;
      } else {
        end = i + 1;
        // Character-set selection carries an intermediate byte before its final.
        while (end < data.length && data.charCodeAt(end) >= 0x20 && data.charCodeAt(end) <= 0x2f) end++;
        if (end >= data.length) { pendingEscape = data.slice(i); break; }
        end++;
      }
      const sequence = data.slice(start, end); i = end;
      if (sequence.startsWith(prefix)) {
        const token = sequence.slice(prefix.length, sequence.endsWith("\x07") ? -1 : -2);
        const payload = payloads.get(token);
        if (payload && !disposed) anchors.push({ token, row: cursor.row, column: cursor.column - payload.columns });
        continue;
      }
      if (sequence === "\x1b[?2026h") {
        if (!synchronized) {
          const position = getCursorPosition();
          if (position && Number.isFinite(position.row)) cursor.row = Math.max(0, Math.min(terminal.rows - 1, position.row));
          if (position && Number.isFinite(position.column)) cursor.column = Math.max(0, Math.min(terminal.columns - 1, position.column));
          anchors = [];
        }
        synchronized = true;
      } else if (sequence === "\x1b[?2026l") {
        output.push(drawAnchors()); synchronized = false;
      } else if (kind === "[") trackCsi(sequence);
      else if (sequence === "\x1b7") savedCursor = { ...cursor };
      else if (sequence === "\x1b8" && savedCursor) cursor = { ...savedCursor };
      else if (sequence === "\x1bD") lineFeed();
      else if (sequence === "\x1bE") { lineFeed(); cursor.column = 0; }
      else if (sequence === "\x1bM") cursor.row = Math.max(0, cursor.row - 1);
      output.push(sequence);
    }
    if (!synchronized) output.push(drawAnchors());
    return originalWrite.call(terminal, output.join(""));
  };
  terminal.write = wrapped;

  return {
    render({ frameIndex, columns, rows }) {
      const sheet = getSheet();
      if (!sheet || disposed) return undefined;
      const cell = sixelCellDimensions(getCellDimensions(), env);
      const width = Math.max(1, Math.round(columns * cell.widthPx));
      const stripeHeight = Math.max(1, Math.round(cell.heightPx));
      const fullHeight = rows * stripeHeight;
      const frame = sheet.frames[frameIndex % sheet.frames.length];
      // Dynamic single-frame sheets always use index 0; cacheKey identifies
      // their immutable pixel/palette content instead of that reusable index.
      const frameKey = frame.cacheKey ?? frameIndex;
      const key = JSON.stringify([getStyle(), frameKey, sheet.width, sheet.height, columns, rows, width, stripeHeight]);
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached.lines;
      }
      const source = frame.pixels;
      const palette = frame.palette ?? sheet.palette;
      const result = [];
      const frameStripes = [];
      for (let row = 0; row < rows; row++) {
        const pixels = new Array(width * stripeHeight);
        for (let y = 0; y < stripeHeight; y++) {
          const sy = Math.min(sheet.height - 1, Math.floor((row * stripeHeight + y + 0.5) * sheet.height / fullHeight));
          for (let x = 0; x < width; x++) {
            const sx = Math.min(sheet.width - 1, Math.floor((x + 0.5) * sheet.width / width));
            pixels[y * width + x] = source[sy * sheet.width + sx];
          }
        }
        const sixel = encodeSixelStripe(pixels, width, stripeHeight, palette);
        // Identical stripe pixels/palette keep the exact same marker across
        // different full motion frames. Pi can then leave unchanged rows alone.
        const stripeKey = createHash("sha256").update(`${columns}:`).update(sixel).digest("hex");
        let stripe = stripes.get(stripeKey);
        if (!stripe) {
          stripe = { key: stripeKey, token: String(++nextToken), sixel, columns, refs: 0 };
          stripes.set(stripeKey, stripe); payloads.set(stripe.token, stripe);
        }
        stripe.refs++;
        frameStripes.push(stripe);
        result.push(" ".repeat(columns) + `${prefix}${stripe.token}\x07`);
      }
      cache.set(key, { lines: result, stripes: frameStripes });
      if (cache.size > frameCacheLimit) {
        const oldestKey = cache.keys().next().value;
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        for (const stripe of oldest.stripes) {
          stripe.refs--;
          if (!stripe.refs) { stripes.delete(stripe.key); payloads.delete(stripe.token); }
        }
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Normal text is streamed immediately. Only an incomplete terminal
      // sequence can be pending; release those original bytes before unhooking.
      if (pendingEscape) originalWrite.call(terminal, pendingEscape);
      pendingEscape = ""; anchors = []; synchronized = false;
      if (terminal.write === wrapped) terminal.write = originalWrite;
      cache.clear(); stripes.clear(); payloads.clear();
    },
  };
}
