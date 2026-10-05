// ---- Reading a riven off a screenshot ---------------------------------
//
// PP-OCRv4 (PaddleOCR's models, Apache-2.0) on onnxruntime-web (MIT), in a
// worker of its own, in this browser: the image never leaves it unless the
// reader offers it. The files are served same-origin under /ocr/, pinned by
// web/ocr/pins.json and fetched only the first time a screenshot is read.
// What the lines MEAN is `rivenFromOcr`'s (87-headless.js), shared with the bot.

const OCR_BASE = "/ocr/";

/// THE WORKER, as one function the page turns into a Blob: it reaches only
/// what a worker has, so the page and a bot's node can run the same body.
function ocrWorkerMain() {
  let ready = null;
  const boot = (base) => {
    importScripts(base + "ort-1.30.0.wasm.min.js");
    ort.env.wasm.wasmPaths = { mjs: base + "ort-wasm-simd-threaded-1.30.0.mjs",
      wasm: base + "ort-wasm-simd-threaded-1.30.0.wasm" };
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return Promise.all([
      ort.InferenceSession.create(base + "ch-ppocrv4-det.onnx"),
      ort.InferenceSession.create(base + "ch-ppocrv4-rec.onnx"),
      fetch(base + "ppocr-keys-v1.txt").then((r) => r.text()),
    ]).then(([det, rec, keys]) => ({ det, rec, keys: [""].concat(keys.split(/\r?\n/).filter((k) => k !== ""), [" "]) }));
  };
  const pixels = (bitmap, sx, sy, sw, sh, w, h) => {
    const c = new OffscreenCanvas(w, h).getContext("2d");
    c.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    return c.getImageData(0, 0, w, h).data;
  };
  const tensor = (px, w, h, mean, std) => {
    const out = new Float32Array(3 * w * h);
    for (let i = 0; i < w * h; i++) {
      for (let c = 0; c < 3; c++) out[c * w * h + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
    }
    return new ort.Tensor("float32", out, [1, 3, h, w]);
  };
  /// TEXT ROWS: the detector's map above 0.3, cut into rows, and a row cut
  /// again where a gap is wider than two line heights.
  const boxes = (map, W, H) => {
    const on = (x, y) => map[y * W + x] > 0.3;
    const out = [];
    for (let y = 0; y < H;) {
      let any = false;
      for (let x = 0; x < W && !any; x++) any = on(x, y);
      if (!any) { y++; continue; }
      const y0 = y;
      for (; y < H; y++) {
        let row = false;
        for (let x = 0; x < W && !row; x++) row = on(x, y);
        if (!row) break;
      }
      const cols = [];
      for (let x = 0; x < W; x++) for (let yy = y0; yy < y; yy++) if (on(x, yy)) { cols.push(x); break; }
      let a = cols[0];
      for (let i = 1; i <= cols.length; i++) {
        if (i === cols.length || cols[i] - cols[i - 1] > 2 * (y - y0)) { out.push([a, y0, cols[i - 1], y]); a = cols[i]; }
      }
    }
    return out;
  };
  const read = async (m, bitmap) => {
    const w = bitmap.width, h = bitmap.height;
    const s = 960 / Math.max(w, h);
    const W = Math.max(32, Math.floor((w * s) / 32) * 32), H = Math.max(32, Math.floor((h * s) / 32) * 32);
    const det = await m.det.run({ [m.det.inputNames[0]]: tensor(pixels(bitmap, 0, 0, w, h, W, H), W, H,
      [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]) });
    const map = det[m.det.outputNames[0]].data;
    const lines = [];
    for (const [x0, y0, x1, y1] of boxes(map, W, H)) {
      const py = (y1 - y0) * 0.5, px = (y1 - y0) * 1.2;
      const bx = Math.max(0, (x0 - px) * w / W), by = Math.max(0, (y0 - py) * h / H);
      const bw = Math.min(w, (x1 + px) * w / W) - bx, bh = Math.min(h, (y1 + py) * h / H) - by;
      if (bw < 4 || bh < 4) continue;
      const rw = Math.min(1600, Math.max(16, Math.round((48 * bw) / bh)));
      const rec = await m.rec.run({ [m.rec.inputNames[0]]: tensor(pixels(bitmap, bx, by, bw, bh, rw, 48), rw, 48,
        [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]) });
      const out = rec[m.rec.outputNames[0]];
      const [, T, C] = out.dims;
      let text = "", last = 0;
      for (let t = 0; t < T; t++) {
        let k = 0;
        for (let c = 1; c < C; c++) if (out.data[t * C + c] > out.data[t * C + k]) k = c;
        if (k !== last && k !== 0) text += m.keys[k] || "";
        last = k;
      }
      if (text.trim()) lines.push({ text: text.trim(), box: [bx, by, bw, bh] });
    }
    return lines;
  };
  onmessage = async (e) => {
    try {
      ready = ready || boot(e.data.base);
      const m = await ready;
      postMessage({ id: e.data.id, lines: await read(m, e.data.bitmap) });
    } catch (err) {
      postMessage({ id: e.data.id, error: String((err && err.message) || err) });
    }
  };
}

let ocrWorker = null;
let ocrSeq = 0;
/// THE LINES ON AN IMAGE, each `{ text, box: [x, y, w, h] }` in its pixels.
async function ocrLines(blob) {
  const bitmap = await createImageBitmap(blob);
  if (!ocrWorker) {
    ocrWorker = new Worker(URL.createObjectURL(new Blob([`(${ocrWorkerMain.toString()})()`], { type: "text/javascript" })));
  }
  const id = ++ocrSeq;
  return new Promise((resolve, reject) => {
    const on = (e) => {
      if (e.data.id !== id) return;
      ocrWorker.removeEventListener("message", on);
      if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.lines);
    };
    ocrWorker.addEventListener("message", on);
    ocrWorker.postMessage({ id, base: new URL(OCR_BASE, location.href).href, bitmap }, [bitmap]);
  });
}

/// THE CARD'S OWN RECTANGLE, around every line read, as a JPEG — what an
/// offered screenshot carries, so a chat or a name beside the card stays home.
async function ocrCardCrop(blob, lines) {
  const bitmap = await createImageBitmap(blob);
  if (!lines.length) return null;
  const x0 = Math.min(...lines.map((l) => l.box[0])), y0 = Math.min(...lines.map((l) => l.box[1]));
  const x1 = Math.max(...lines.map((l) => l.box[0] + l.box[2])), y1 = Math.max(...lines.map((l) => l.box[1] + l.box[3]));
  const pad = Math.round((y1 - y0) * 0.04);
  const sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad);
  const sw = Math.min(bitmap.width, x1 + pad) - sx, sh = Math.min(bitmap.height, y1 + pad) - sy;
  const c = new OffscreenCanvas(sw, sh);
  c.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

// ---- the editor's side ----------------------------------------------------

/// The last screenshot read: what it said, the card it made, and the offer.
let ocrLast = null;

/// A SCREENSHOT INTO A NEW CARD. The values are the card's as printed; the
/// engine turns them into rolls at the rank a card is read at, its maximum.
async function ocrRead(blob) {
  const w = weaponInfo($("weapon").value);
  if (!w || !blob) return;
  ocrLast = { state: "reading", first: !ocrWorker };
  renderRivenOcr();
  try {
    const lines = await ocrLines(blob);
    const pool = (META.riven_stats || {})[w.riven_class] || [];
    const res = rivenFromOcr(pool, [I18N].concat(ALT_NAMES || []).filter(Boolean), lines.map((l) => l.text));
    if (res.bonuses.length < 2) {
      ocrLast = { state: "none", lines };
      return renderRivenOcr();
    }
    const at = (x) => ({ id: x.id, roll: 1, value: x.value });
    const r = await api("/api/riven", { weapon: w.id, bonuses: res.bonuses.map(at),
      malus: res.malus ? at(res.malus) : null, rank: rivenRules().max_rank, polarity: "madurai" });
    const roll = (slot) => ((r.stats || []).find((s) => s.slot === slot) || { roll: 1 }).roll;
    const id = newRiven({ bonuses: res.bonuses.map((b, i) => ({ id: b.id, roll: roll(String(i)) })),
      malus: res.malus ? { id: res.malus.id, roll: roll("malus") } : null,
      rank: rivenRules().max_rank, polarity: "madurai" });
    const read = lines.filter((l) => ocrNumber(l.text) && !res.unread.includes(l.text));
    ocrLast = { state: "done", blob, lines, read, unread: res.unread, rivenId: id, offer: "",
      first: { bonuses: res.bonuses, malus: res.malus } };
  } catch (e) {
    ocrLast = { state: "error", note: String((e && e.message) || e) };
  }
  renderRivenOcr();
}

/// A CORRECTION: the card's rectangle, what the reader first got, and what the
/// card says NOW — the reader telling us what this screenshot should have read.
async function ocrGive() {
  const o = ocrLast;
  if (!o || o.state !== "done") return;
  o.offer = "sending";
  renderRivenOcr();
  try {
    const crop = await ocrCardCrop(o.blob, o.read);
    const image = await new Promise((res, rej) => {
      const f = new FileReader();
      f.onload = () => res(f.result);
      f.onerror = rej;
      f.readAsDataURL(crop);
    });
    const card = (loadPresetList(RIVENS).find((p) => p.id === o.rivenId) || {}).state || null;
    const r = await fetch("/api/ocr/sample", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ weapon: $("weapon").value, lang: LANG, image, lines: o.lines.map((l) => l.text),
        read: o.first, riven: card }) });
    o.offer = r.ok ? "sent" : r.status === 501 || r.status === 404 ? "closed" : "failed";
  } catch (_) {
    o.offer = "failed";
  }
  renderRivenOcr();
}

function renderRivenOcr() {
  const box = $("riven-ocr");
  if (!box) return;
  const o = ocrLast;
  if (!o) { box.innerHTML = ""; return; }
  const close = `<button class="cu-btn rv-ocr-x" title="${escHtml(tr("close"))}">✕</button>`;
  const raw = (ls) => (ls.length ? `<div class="sb-empty">${ls.map((l) => escHtml(l.text || l)).join(" · ")}</div>` : "");
  let body = "";
  if (o.state === "reading") {
    body = escHtml(tr("Reading the screenshot…"))
      + (o.first ? ` <span class="sb-empty">${escHtml(tr("the first time downloads the reader, about 30 MB"))}</span>` : "");
  } else if (o.state === "error") {
    body = `${escHtml(tr("The screenshot could not be read"))}: ${escHtml(o.note)}`;
  } else if (o.state === "none") {
    body = escHtml(tr("No riven stats were found on this screenshot.")) + raw(o.lines);
  } else {
    const done = { sending: tr("sending…"), sent: tr("sent — thank you"), closed: tr("not taken here"),
      failed: tr("could not be sent") }[o.offer];
    body = escHtml(tr("A new card from the screenshot. Check its numbers; they are read at the card's maximum rank, so change the rank if yours is lower."))
      + (o.unread.length ? `<div class="sb-empty">${escHtml(tr("not read"))}: ${o.unread.map(escHtml).join(" · ")}</div>` : "")
      + `<div class="rv-ocr-give">${done ? `<span class="sb-empty">${escHtml(done)}</span>`
        : `<button class="cu-btn rv-ocr-send">${escHtml(tr("Send a correction"))}</button>`
          + ` <span class="sb-empty">${escHtml(tr("tells WFSim this screenshot should read as the card does now; sends the rectangle around its stats"))}</span>`}</div>`;
  }
  box.innerHTML = `<div class="rv-ocr-in">${body}</div>${close}`;
  box.querySelector(".rv-ocr-x").onclick = () => { ocrLast = null; renderRivenOcr(); };
  const send = box.querySelector(".rv-ocr-send");
  if (send) send.onclick = ocrGive;
}

/// THREE WAYS IN, wired once: the button's file, Ctrl+V on the Rivens tab, and
/// a file dropped on its block.
let ocrWired = false;
function wireRivenOcr() {
  if (ocrWired || !$("riven-ocr-file")) return;
  ocrWired = true;
  $("riven-ocr-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) ocrRead(f);
  });
  document.addEventListener("paste", (e) => {
    if (!document.body.classList.contains("on-rivens")) return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((x) => x.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    ocrRead(item.getAsFile());
  });
  const block = $("riven-block");
  block.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  block.addEventListener("drop", (e) => {
    const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    ocrRead(f);
  });
}
