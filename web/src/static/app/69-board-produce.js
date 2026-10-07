// SPDX-License-Identifier: AGPL-3.0-or-later
/// THE PRODUCER — the board's own fights for a build just sent, run on this
/// machine in the background and sent after it (docs/BOARD.md §"The producer").
///
/// THE SCORER'S PATH, NOT A COPY OF IT. `/api/board/rows` names the fights the
/// scorer will fight for this build, `/api/board/fold` folds their runs one at a
/// time and `/api/board/score` ends them the scorer's way — all
/// `webapi::board_rows` — so the number sent is the scorer's to the bit. It
/// reaches the owner's live board; a public row still waits for a verified one.
///
/// THE READER GOES FIRST. Every piece waits on `yieldToForeground` and is sized
/// to about `PRODUCE_PIECE_MS`, so a run the reader starts waits for one piece
/// at most and nothing is cancelled to make room.
const PRODUCE_PIECE_MS = 250;
const produceQueue = [];
let producing = false;

/// A BUILD THE BOARD HAS JUST ACCEPTED, queued for its fights. Not on a phone:
/// minutes of background work on a battery is a cost the reader never agreed to.
function produceBoardRows(payload) {
  if (boardConsent() !== "yes") return;
  if (window.matchMedia && matchMedia("(pointer: coarse)").matches) return;
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
  const produced = [];
  for (const row of rows) {
    const runs = Number(row.request.runs) || 0;
    let acc = null;
    let from = 0;
    let count = 1;
    while (from < runs) {
      await yieldToForeground();
      // CONSENT WITHDRAWN MID-ROW ENDS IT: nothing measured so far is sent.
      if (boardConsent() !== "yes") return;
      const n = Math.min(count, runs - from);
      const began = performance.now();
      const step = await api("/api/board/fold", { request: row.request, acc, from, count: n });
      if (!step || !step.ok) return;
      acc = step.acc;
      from += n;
      // THE NEXT PIECE IS SIZED FROM THIS ONE, so a crowd fight and a single
      // target both come out at about a quarter second a call.
      const ms = Math.max(1, performance.now() - began);
      count = Math.max(1, Math.min(1000, Math.round((n * PRODUCE_PIECE_MS) / ms)));
    }
    const s = await api("/api/board/score", { ruler: row.ruler, request: row.request, acc });
    if (!s || !s.ok || !Number.isFinite(s.score)) return;
    produced.push({ ruler: row.ruler, mode: row.mode, score: s.score });
  }
  if (boardConsent() !== "yes") return;
  // THE SAME DOOR AS THE BUILD, with what was measured beside it. A second
  // inbox row for one build is one build in the library; the endpoint keeps the
  // numbers with it for the owner's live board.
  await fetch("/api/board/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, produced, engine: RELEASE_ID }),
  }).catch(() => {});
}
