// ---- QR ---------------------------------------------------------------
// A card is pasted into a chat and read on a phone, and a phone cannot click
// a picture. Written here rather than pulled in: the repo
// takes no dependencies, and a QR encoder is a bounded piece of arithmetic —
// byte mode, error correction L (the most data per module, and a card is not
// a sticker on a wet crate), smallest version that fits.
//
// Spec: ISO/IEC 18004. The three tables below are the parts of it that cannot
// be derived — everything else is computed.
const QR_ECC_L = [
  [7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4],
  [20, 4], [24, 4], [26, 4], [30, 4], [22, 6], [24, 6], [28, 6], [30, 6], [28, 7], [28, 8],
  [28, 8], [28, 9], [30, 9], [30, 10], [26, 12], [28, 12], [30, 12], [30, 13], [30, 14], [30, 15],
  [30, 16], [30, 17], [30, 18], [30, 19], [30, 19], [30, 20], [30, 21], [30, 22], [30, 24], [30, 25],
];
// Total codewords per version (data + ecc).
const QR_TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733,
  815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465,
  2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706];
// Alignment-pattern centres per version (empty for version 1).
const QR_ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]];

// GF(256) with the QR primitive polynomial 0x11d.
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);

// The generator polynomial for `n` ecc codewords.
function qrGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  // Built LOW-degree-first; the division below indexes it high-degree-first
  // (gen[0] is the monic leading 1 it skips). Verified against a reference
  // encoder: without this the ECC block is wrong and nothing scans.
  return poly.reverse();
}

function qrEcc(data, n) {
  const gen = qrGenPoly(n);
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift(); rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= gfMul(gen[j + 1], factor);
  }
  return rem;
}

// Bytes -> the module matrix, or null when the text does not fit any version.
function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  let version = 0, dataCw = 0, eccPer = 0, blocks = 0;
  for (let v = 1; v <= 40; v++) {
    const [e, b] = QR_ECC_L[v - 1];
    const total = QR_TOTAL[v - 1];
    const cap = total - e * b;
    const lenBits = v < 10 ? 8 : 16;
    if (4 + lenBits + bytes.length * 8 <= cap * 8) {
      version = v; dataCw = cap; eccPer = e; blocks = b; break;
    }
  }
  if (!version) return null;

  // ---- bit stream: mode 0100, length, data, terminator, pad --------------
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  for (let i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  for (let i = 0; cw.length < dataCw; i++) cw.push(i % 2 ? 0x11 : 0xec);

  // ---- split into blocks, interleave data then ecc ----------------------
  const short = Math.floor(dataCw / blocks), extra = dataCw % blocks;
  const dblocks = [], eblocks = [];
  let at = 0;
  for (let i = 0; i < blocks; i++) {
    const n = short + (i >= blocks - extra ? 1 : 0);
    const d = cw.slice(at, at + n); at += n;
    dblocks.push(d);
    eblocks.push(qrEcc(d, eccPer));
  }
  const out = [];
  for (let i = 0; i < Math.max(...dblocks.map((d) => d.length)); i++) {
    dblocks.forEach((d) => { if (i < d.length) out.push(d[i]); });
  }
  for (let i = 0; i < eccPer; i++) eblocks.forEach((e) => out.push(e[i]));

  // ---- the matrix -------------------------------------------------------
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < size && c < size) m[r][c] = v; };
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const on = i >= 0 && i <= 6 && j >= 0 && j <= 6
        && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
      set(r + i, c + j, on ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }
  // Alignment patterns sit at every pairing of the centres EXCEPT the three
  // that would land on a finder. Testing "is this module already set" instead
  // also skipped the ones that sit ON the timing line — which the spec puts
  // there deliberately — and every version 7 and up came out unreadable.
  const centres = QR_ALIGN[version - 1];
  const last = centres[centres.length - 1];
  centres.forEach((r) => centres.forEach((c) => {
    if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) return;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      set(r + i, c + j, (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0);
    }
  }));
  m[size - 8][8] = 1;                              // the always-dark module

  // Version information (7 versions and up), BCH(18,6).
  if (version >= 7) {
    // BCH(18,6) over the 6-bit version, generator 0x1F25 — 12 check bits.
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    const info = ((version << 12) | (rem & 0xfff)) >>> 0;
    for (let i = 0; i < 18; i++) {
      const bit = (info >> i) & 1;
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }

  // Reserve the format area so the data walk skips it. Cells are [row, col];
  // the spec states them as (x, y) = (column, row), which is the transposition
  // that had the walk skipping the wrong modules.
  const fmtCells = [[7, 8], [8, 8], [8, 7]];
  for (let i = 0; i <= 5; i++) fmtCells.push([i, 8], [8, i]);
  for (let i = 0; i < 8; i++) fmtCells.push([8, size - 1 - i], [size - 1 - i, 8]);
  fmtCells.forEach(([r, c]) => { if (m[r][c] === null) m[r][c] = 0; });

  // ---- the data walk, mask 0 -------------------------------------------
  // One mask, not eight: the spec's penalty scoring picks the prettiest of
  // eight, but every one of them scans. Mask 0 (`(r+c) % 2`) on a payload
  // this dense is well inside what any reader handles, and eight passes of
  // penalty arithmetic is a lot of code to own for a cosmetic gain.
  const taken = m.map((row) => row.map((x) => x !== null));
  let bi = 0;
  const dataBit = () => {
    const byte = out[bi >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bi & 7))) & 1;
    bi++;
    return bit;
  };
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                          // the timing column
    for (let n = 0; n < size; n++) {
      const row = upward ? size - 1 - n : n;
      for (const c of [col, col - 1]) {
        if (taken[row][c]) continue;
        const bit = dataBit() ^ ((row + c) % 2 === 0 ? 1 : 0);
        m[row][c] = bit;
      }
    }
    upward = !upward;
  }

  // ---- format information: ecc L (01) + mask 0, BCH(15,5) + 0x5412 ------
  const fmtData = (0b01 << 3) | 0;
  let rem = fmtData << 10;
  for (let i = 4; i >= 0; i--) if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
  const fmt = ((fmtData << 10) | rem) ^ 0x5412;
  const fbit = (i) => (fmt >> i) & 1;
  for (let i = 0; i <= 5; i++) m[i][8] = fbit(i);
  m[7][8] = fbit(6);
  m[8][8] = fbit(7);
  m[8][7] = fbit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = fbit(i);
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = fbit(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = fbit(i);
  m[size - 8][8] = 1;                              // the always-dark module

  return m;
}

// A QR as its OWN canvas, at a whole number of pixels per module.
//
// Drawn straight onto the card it came out unreadable: a dense symbol scaled
// to fit a box lands on fractional module sizes, and rounding each one up
// smears neighbours together. Rendering at an integer scale and then placing
// it at its natural size is the difference between a picture of a QR and one
// that scans. Quiet zone six, not the spec's minimum four — a reference
// encoder's own output fails to scan at four on a dense symbol.
// EIGHT device pixels per module, always — the size is a consequence, not a
// setting. Measured against a real decoder after the resizing a chat app
// does: at 4 px a card only reads at full size, at 6 it survives a 0.66x
// shrink, at 8 it still reads after 0.5x AND JPEG 80. A QR that only scans
// from the original file is a QR nobody scans.
const QR_MODULE_PX = 8;
function qrCanvas(text) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length, quiet = 6;
  const modulePx = QR_MODULE_PX;
  const side = (n + quiet * 2) * modulePx;
  const c = document.createElement("canvas");
  c.width = side; c.height = side;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, side, side);
  g.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (m[r][col]) {
        g.fillRect((col + quiet) * modulePx, (r + quiet) * modulePx, modulePx, modulePx);
      }
    }
  }
  return c;
}
