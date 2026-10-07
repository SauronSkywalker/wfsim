// SPDX-License-Identifier: AGPL-3.0-or-later
/// THE BOARD'S WORK, DONE ON THIS MACHINE — one compute order at a time, in the
/// background (docs/BOARD.md §"Compute orders"). The worker hands out a build,
/// a ruler and a mode; this fights it by the scorer's own path and sends back
/// the number. Whether it is the first measurement of that row or the second
/// that confirms one, this side cannot tell and does not need to.
///
/// THE SCORER'S PATH, NOT A COPY OF IT. `/api/board/order` names the fight off
/// the library's record, `/api/board/fold` folds its runs one at a time and
/// `/api/board/score` ends it the scorer's way — all `webapi::board_rows` — so
/// the number sent is the scorer's to the bit.
///
/// THE READER GOES FIRST. Every piece waits on `yieldToForeground` and is sized
/// to about `PIECE_MS`, so a run the reader starts waits for one piece at most.
/// Not on a phone: minutes of background work on a battery is a cost the reader
/// never agreed to.
const PIECE_MS = 250;
const onPhone = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);

/// ONE ROW, MEASURED: its runs folded in pieces, then scored. `null` when the
/// engine refused or `live()` went false between pieces.
async function measureRow(request, ruler, live) {
  const runs = Number(request.runs) || 0;
  let acc = null;
  let from = 0;
  let count = 1;
  while (from < runs) {
    await yieldToForeground();
    if (!live()) return null;
    const n = Math.min(count, runs - from);
    const began = performance.now();
    const step = await api("/api/board/fold", { request, acc, from, count: n });
    if (!step || !step.ok) return null;
    acc = step.acc;
    from += n;
    // THE NEXT PIECE IS SIZED FROM THIS ONE, so a crowd fight and a single
    // target both come out at about a quarter second a call.
    const ms = Math.max(1, performance.now() - began);
    count = Math.max(1, Math.min(1000, Math.round((n * PIECE_MS) / ms)));
  }
  const s = await api("/api/board/score", { ruler, request, acc });
  return s && s.ok && Number.isFinite(s.score) ? s : null;
}

/// WHO IS WORKING: a random id this browser makes for itself, joined to no
/// account and to no submission, sent with this work alone — so a client caught
/// once can be refused (docs/BOARD.md §"Compute orders"). A browser that cannot
/// keep it does not work: a new id every visit is a ban nobody can apply.
const VERIFIER_KEY = "wfsim-verifier";
const VERIFY_KEY = "wfsim-board-verify";
const VERIFIED_KEY = "wfsim-board-verified";
/// How long an idle browser waits before asking again; one that just finished
/// an order asks at once.
const ASK_EVERY_MS = 30000;

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

const postBoardWork = (path, body) => fetch(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/// ONE ORDER, fought here and answered — `true` when there was one. The answer
/// never says whether it agreed; a lease this browser leaves lapses on its own.
async function workOnce() {
  if (!boardVerifyOn() || onPhone()) return false;
  const id = verifierId();
  if (!id) return false;
  const ask = await postBoardWork("/api/board/work", { verifier: id, engine: ENGINE_ID });
  const w = ask && ask.work;
  if (!w) return false;
  const order = await api("/api/board/order", { record: w.record, ruler: w.ruler, mode: w.mode });
  if (!order || !order.ok) return true;
  const s = await measureRow(order.request, w.ruler, boardVerifyOn);
  if (!s) return true;
  const sent = await postBoardWork("/api/board/verify",
    { lease: w.lease, verifier: id, engine: ENGINE_ID, score: s.score, metric: s.metric });
  if (!sent) return true;
  try { localStorage.setItem(VERIFIED_KEY, String(boardVerifiedCount() + 1)); } catch (_) { /* private mode */ }
  renderBoardConsent();
  return true;
}

/// ONLY THE DEPLOYED SITE WORKS: the dev server has no orders to hand out.
if (WASM) {
  (async () => {
    for (;;) {
      let worked = false;
      try { worked = await workOnce(); } catch (_) { /* the next ask tries again */ }
      if (!worked) await new Promise((r) => setTimeout(r, ASK_EVERY_MS));
    }
  })();
}

/// THE SWITCH, stated beside the board's own in the consent box.
function boardVerifyHtml() {
  const on = boardVerifyOn();
  const text = on
    ? tr("Your browser also computes the board's scores in the background ({n} so far).")
      .replace("{n}", String(boardVerifiedCount()))
    : tr("Your browser does not compute the board's scores.");
  return ` <span class="board-state">${escHtml(text)}</span>` +
    ` <button class="ghost-btn small" id="board-verify-flip">${escHtml(on ? tr("stop computing") : tr("start computing"))}</button>`;
}
function wireBoardVerify() {
  const b = $("board-verify-flip");
  if (b) b.onclick = () => setBoardVerify(!boardVerifyOn());
}
