// A small deterministic VT model for layout regressions, not a native WT emulator.
// The Sixel overflow rule models WT's six-pixel bands in its fixed 10x20 grid.
export function createVTTerminal({ columns = 100, rows = 40, visibleWidth = () => 1, sixelBandOverflow = true } = {}) {
  const cells = [], images = [];
  let top = 0, x = 0, y = 0, saved, pending = "", wrap = false;
  const counters = { bytes: 0, textScrolls: 0, sixelScrolls: 0, linefeeds: 0, eraseLines: 0, clearScreens: 0, clearScrollbacks: 0, dcs: 0, cursorMoves: 0, syncBegin: 0, syncEnd: 0 };
  const row = (index) => cells[index] ||= new Array(terminal.columns).fill(" ");
  const imageRow = (index) => images[index] ||= new Array(terminal.columns).fill(false);
  const scroll = (count, image = false) => {
    top += count; counters[image ? "sixelScrolls" : "textScrolls"] += count;
    for (let i = 0; i < terminal.rows; i++) { row(top + i); imageRow(top + i); }
  };
  const linefeed = () => {
    counters.linefeeds++; wrap = false;
    if (y === terminal.rows - 1) scroll(1); else y++;
  };
  const move = (column, line) => { x = Math.max(0, Math.min(terminal.columns - 1, column)); y = Math.max(0, Math.min(terminal.rows - 1, line)); wrap = false; counters.cursorMoves++; };
  const erase = (mode) => {
    counters.eraseLines++;
    const from = mode === 1 || mode === 2 ? 0 : x, to = mode === 0 || mode === 2 ? terminal.columns : x + 1;
    row(top + y).fill(" ", from, to); imageRow(top + y).fill(false, from, to);
  };
  const drawSixel = (data) => {
    counters.dcs++;
    const raster = /q"\d+;\d+;(\d+);(\d+)/.exec(data);
    if (!raster) throw new Error("Test terminal requires explicit Sixel raster dimensions");
    const width = +raster[1], height = +raster[2];
    const drawingHeight = sixelBandOverflow ? Math.ceil(height / 6) * 6 : height;
    const occupiedRows = Math.ceil(drawingHeight / 20), overflow = Math.max(0, y + occupiedRows - terminal.rows);
    if (overflow) { scroll(overflow, true); y -= overflow; }
    // Only opaque source rows matter for old-image residue. Padding can still scroll.
    const sourceRows = Math.ceil(height / 20), right = Math.min(terminal.columns, x + Math.ceil(width / 10));
    for (let line = 0; line < sourceRows; line++) imageRow(top + y + line).fill(true, x, right);
    y = Math.min(terminal.rows - 1, y + occupiedRows - 1); wrap = false;
  };
  const csi = (params, final) => {
    const values = params.replace(/^\?/, "").split(";").map((n) => +n || 0), n = values[0] || 1;
    if (final === "A") move(x, y - n);
    else if (final === "B") move(x, y + n);
    else if (final === "C") move(x + n, y);
    else if (final === "D") move(x - n, y);
    else if (final === "G") move(n - 1, y);
    else if (final === "H" || final === "f") move((values[1] || 1) - 1, n - 1);
    else if (final === "K") erase(values[0]);
    else if (final === "J" && values[0] === 2) {
      counters.clearScreens++;
      for (let i = 0; i < terminal.rows; i++) { row(top + i).fill(" "); imageRow(top + i).fill(false); }
    } else if (final === "J" && values[0] === 3) {
      counters.clearScrollbacks++;
      cells.splice(0, top); images.splice(0, top); top = 0;
    } else if (final === "h" && params === "?2026") counters.syncBegin++;
    else if (final === "l" && params === "?2026") counters.syncEnd++;
    else if (final === "s") saved = { x, y, wrap };
    else if (final === "u" && saved) { x = saved.x; y = saved.y; wrap = saved.wrap; }
  };
  const parse = () => {
    let offset = 0;
    while (offset < pending.length) {
      const code = pending[offset];
      if (code === "\x1b") {
        if (offset + 1 >= pending.length) break;
        const next = pending[offset + 1];
        if (next === "[") {
          const match = /^\x1b\[([0-9;:?]*)([@-~])/.exec(pending.slice(offset));
          if (!match) break;
          csi(match[1], match[2]); offset += match[0].length; continue;
        }
        if (next === "]" || next === "P" || next === "_") {
          const start = offset + 2, bell = next === "]" ? pending.indexOf("\x07", start) : -1, st = pending.indexOf("\x1b\\", start);
          const end = bell >= 0 && (st < 0 || bell < st) ? bell : st;
          if (end < 0) break;
          if (next === "P") drawSixel(pending.slice(offset, end + (end === bell ? 1 : 2)));
          offset = end + (end === bell ? 1 : 2); continue;
        }
        if (next === "7") saved = { x, y, wrap };
        else if (next === "8" && saved) { x = saved.x; y = saved.y; wrap = saved.wrap; }
        offset += 2; continue;
      }
      offset++;
      if (code === "\r") { x = 0; wrap = false; continue; }
      if (code === "\n") { linefeed(); continue; }
      if (code === "\b") { move(x - 1, y); continue; }
      if (code < " ") continue;
      let character = code;
      if (code >= "\ud800" && code <= "\udbff" && offset < pending.length) character += pending[offset++];
      const width = visibleWidth(character);
      if (!width) continue;
      if (wrap || x + width > terminal.columns) { x = 0; linefeed(); }
      row(top + y)[x] = character; imageRow(top + y)[x] = false;
      for (let i = 1; i < width && x + i < terminal.columns; i++) { row(top + y)[x + i] = ""; imageRow(top + y)[x + i] = false; }
      x += width;
      if (x >= terminal.columns) { x = terminal.columns - 1; wrap = true; }
    }
    pending = pending.slice(offset);
  };
  const terminal = {
    columns, rows, kittyProtocolActive: false,
    start() {}, stop() {}, hideCursor() {}, showCursor() {}, moveBy() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {},
    setTitle() {}, setProgress() {}, setProgramStatus() {}, async drainInput() {},
    write(data) { counters.bytes += data.length; pending += data; parse(); },
  };
  return {
    terminal, counters,
    get cursor() { return { x, y, top, pending: pending.length }; },
    get screen() { return Array.from({ length: terminal.rows }, (_, i) => row(top + i).slice(0, terminal.columns).join("").trimEnd()); },
    get history() { return cells.slice(0, top).map((line) => line.join("").trimEnd()); },
    get imageCellsInHistory() { return images.slice(0, top).reduce((sum, line) => sum + line.filter(Boolean).length, 0); },
    get imageCells() { return Array.from({ length: terminal.rows }, (_, i) => imageRow(top + i).slice(0, terminal.columns)); },
  };
}
