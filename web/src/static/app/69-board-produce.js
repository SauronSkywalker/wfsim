// SPDX-License-Identifier: AGPL-3.0-or-later
/// THE PRODUCER AND THE VERIFIER — the board's own fights, run on this machine
/// in the background (docs/BOARD.md §"The producer", §"Cross-verification").
///
/// THE SCORER'S PATH, NOT A COPY OF IT. `/api/board/rows` names the fights the
/// scorer will fight for a build, `/api/board/fold` folds their runs one at a
/// time and `/api/board/score` ends them the scorer's way — all
/// `webapi::board_rows` — so a number sent from here is the scorer's to the bit.
///
/// THE READER GOES FIRST. Every piece waits on `yieldToForeground` and is sized
/// to about `PRODUCE_PIECE_MS`, so a run the reader starts waits for one piece
/// at most and nothing is cancelled to make room. Not on a phone: minutes of
/// background work on a battery is a cost the reader never agreed to.
const PRODUCE_PIECE_MS = 250;
const produceQueue = [];
let producing = false;
const onPhone = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

/// ONE ROW, MEASURED: its runs folded in pieces, then scored. `null` when the
/// engine refused or `live()` went false between pieces.
async function measureRow(row, live) {
  const runs = Number(row.request.runs) || 0;
  let acc = null;
  let from = 0;
  let count = 1;
  while (from < runs) {
    await yieldToForeground();
    if (!live()) return null;
    const n = Math.min(count, runs - from);
    const began = performance.now();
    const step = await api("/api/board/fold", { request: row.request, acc, from, count: n });
    if (!step || !step.ok) return null;
    acc = step.acc;
    from += n;
    // THE NEXT PIECE IS SIZED FROM THIS ONE, so a crowd fight and a single
    // target both come out at about a quarter second a call.
    const ms = Math.max(1, performance.now() - began);
    count = Math.max(1, Math.min(1000, Math.round((n * PRODUCE_PIECE_MS) / ms)));
  }
  const s = await api("/api/board/score", { ruler: row.ruler, request: row.request, acc });
  return s && s.ok && Number.isFinite(s.score) ? s.score : null;
}

/// A BUILD THE BOARD HAS JUST ACCEPTED, queued for its fights.
function produceBoardRows(payload) {
  if (boardConsent() !== "yes" || onPhone()) return;
  produceQueue.push(payload);
  if (!producing) drainProduce();
}

async function drainProduce() {
  producing = true;
  try {
    while (produceQueue.length) {
      // A RUN THAT FAILS SENDS NOTHING. The build itself was already sent, so
      // the pipeline measures it as it always has.
      try { await produceOne(produceQueue.shift()); } catch (_) { /* nothing sent */ }
    }
  } finally {
    producing = false;
  }
}

async function produceOne(payload) {
  const plan = await api("/api/board/rows", payload);
  const rows = (plan && plan.rows) || [];
  if (!rows.length) return;
  const live = () => boardConsent() === "yes";
  const produced = [];
  for (const row of rows) {
    const score = await measureRow(row, live);
    // CONSENT WITHDRAWN MID-BUILD ENDS IT: nothing measured so far is sent.
    if (score === null) return;
    produced.push({ ruler: row.ruler, mode: row.mode, score });
  }
  if (!live()) return;
  rememberProduced(plan.record);
  // THE SAME DOOR AS THE BUILD, with what was measured beside it. A second
  // inbox row for one build is one build in the library.
  await fetch("/api/board/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, produced, engine: ENGINE_ID }),
  }).catch(() => {});
}

/// WHO IS VERIFYING: a random id this browser makes for itself, joined to no
/// account and to no submission, sent with verification alone — so a client
/// caught once can be refused (docs/BOARD.md §"Cross-verification"). A browser
/// that cannot keep it does not verify: a new id every visit is a ban nobody
/// can apply.
const VERIFIER_KEY = "wfsim-verifier";
const VERIFY_KEY = "wfsim-board-verify";
const VERIFIED_KEY = "wfsim-board-verified";
const PRODUCED_KEY = "wfsim-board-produced";
const VERIFY_EVERY_MS = 30000;

function verifierId() {
  try {
    let id = localStorage.getItem(VERIFIER_KEY);
    if (!id || !/^[a-z0-9]{16,40}$/.test(id)) {
      id = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VERIFIER_KEY, id);
    }
    return localStorage.getItem(VERIFIER_KEY) === id ? id : null;
  } catch (_) { return null; }
}

/// ON BY DEFAULT, the owner's call; the switch sits beside the board's own.
function boardVerifyOn() {
  try { return localStorage.getItem(VERIFY_KEY) !== "no"; } catch (_) { return false; }
}
function setBoardVerify(on) {
  try { localStorage.setItem(VERIFY_KEY, on ? "yes" : "no"); } catch (_) { /* private mode */ }
  renderBoardConsent();
}
function boardVerifiedCount() {
  try { return Number(localStorage.getItem(VERIFIED_KEY)) || 0; } catch (_) { return 0; }
}

/// THE BUILDS THIS BROWSER PRODUCED, by a hash of their canonical record, so it
/// is never the second client on its own claim. Bounded: an old one has long
/// been verified by somebody else.
const recordHash = (rec) => {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(rec || null)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};
function producedHashes() {
  try { return JSON.parse(localStorage.getItem(PRODUCED_KEY) || "[]"); } catch (_) { return []; }
}
function rememberProduced(rec) {
  try {
    const list = producedHashes().filter((h) => h !== recordHash(rec));
    list.push(recordHash(rec));
    localStorage.setItem(PRODUCED_KEY, JSON.stringify(list.slice(-200)));
  } catch (_) { /* private mode */ }
}

/// ONE ROW SOMEBODY ELSE CLAIMED, fought here and answered. The answer never
/// says whether it agreed; a lease this browser leaves lapses on its own.
async function verifyOnce() {
  if (!boardVerifyOn() || onPhone() || producing || produceQueue.length) return;
  const id = verifierId();
  if (!id) return;
  const ask = await fetch("/api/board/work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifier: id, engine: ENGINE_ID }),
  }).then((r) => r.json()).catch(() => null);
  const w = ask && ask.work;
  if (!w || producedHashes().includes(recordHash(w.record))) return;
  const plan = await api("/api/board/rows", w.record);
  const row = ((plan && plan.rows) || []).find((x) => x.ruler === w.ruler && x.mode === w.mode);
  if (!row) return;
  const score = await measureRow(row, boardVerifyOn);
  if (score === null) return;
  const sent = await fetch("/api/board/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lease: w.lease, verifier: id, score }),
  }).then((r) => r.ok).catch(() => false);
  if (!sent) return;
  try { localStorage.setItem(VERIFIED_KEY, String(boardVerifiedCount() + 1)); } catch (_) { /* private mode */ }
  renderBoardConsent();
}

/// ONLY THE DEPLOYED SITE VERIFIES: the dev server has no board to ask.
if (WASM) {
  (async () => {
    for (;;) {
      await new Promise((r) => setTimeout(r, VERIFY_EVERY_MS));
      try { await verifyOnce(); } catch (_) { /* the next tick asks again */ }
    }
  })();
}

/// THE SWITCH, stated beside the board's own in the consent box.
function boardVerifyHtml() {
  const on = boardVerifyOn();
  const text = on
    ? tr("Your browser also checks other players' scores in the background ({n} so far).")
      .replace("{n}", String(boardVerifiedCount()))
    : tr("Your browser does not check other players' scores.");
  return ` <span class="board-state">${escHtml(text)}</span>` +
    ` <button class="ghost-btn small" id="board-verify-flip">${escHtml(on ? tr("stop checking") : tr("start checking"))}</button>`;
}
function wireBoardVerify() {
  const b = $("board-verify-flip");
  if (b) b.onclick = () => setBoardVerify(!boardVerifyOn());
}
