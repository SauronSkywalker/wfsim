// SPDX-License-Identifier: AGPL-3.0-or-later
// CROSS-VERIFICATION — docs/BOARD.md §"Cross-verification". A claim is what a
// submitter's machine measured for one row; this hands its BUILD to another
// client and compares what comes back. Equal bits make it a fact in `scores`
// (the engine is deterministic across every target, docs/WASM.md), anything
// else is the server's to settle. Nothing here computes a number.
//
//   POST /api/board/work    { verifier, engine }         → { work: { lease, record, ruler, mode } | null }
//   POST /api/board/verify  { lease, verifier, score }   → { ok }

/// A browser fights a crowd row in minutes; a lease outlives the slowest.
export const LEASE_MS = 30 * 60_000;
/// The share of agreements the server recomputes anyway, which is what makes
/// two colluding clients a gamble rather than a method.
export const SPOT_SHARE = 0.05;

const VERIFIER_ID = /^[a-z0-9]{16,40}$/;
const ENGINE_ID = /^[A-Za-z0-9._-]{1,40}$/;
const LEASE_ID = /^[a-f0-9]{32}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const day = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().slice(0, 19) + "Z";

async function read(request) {
  if (request.method !== "POST") return { err: json({ ok: false, error: "POST only" }, 405) };
  const raw = await request.text();
  if (raw.length > 2048) return { err: json({ ok: false, error: "payload too large" }, 400) };
  try { return { b: JSON.parse(raw) }; } catch { return { err: json({ ok: false, error: "not json" }, 400) }; }
}

/// THE CLIENT, remembered by the id it made and nothing else. `null` when it
/// may not verify.
async function admit(db, id) {
  await db.prepare("INSERT INTO verifiers (id, seen) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET seen = excluded.seen")
    .bind(id, day()).run();
  const v = await db.prepare("SELECT banned FROM verifiers WHERE id = ?").bind(id).first();
  return v && !v.banned ? id : null;
}

/// ONE ROW TO FIGHT, chosen at random among those this client's release can
/// measure — never one the client picks, never one already settled, and never
/// the number to agree with.
async function work(request, env) {
  const { b, err } = await read(request);
  if (err) return err;
  if (!VERIFIER_ID.test(b.verifier || "") || !ENGINE_ID.test(b.engine || "")) return json({ ok: false, error: "bad request" }, 400);
  const db = env.LIBRARY, now = Date.now();
  if (!(await admit(db, b.verifier))) return json({ ok: true, work: null });
  // ONE AT A TIME: a client holding a live lease gets nothing more.
  const held = await db.prepare("SELECT 1 AS x FROM claims WHERE leased_to = ? AND state = 'leased' AND lease_until > ?")
    .bind(b.verifier, now).first();
  if (held) return json({ ok: true, work: null });
  const pick = await db.prepare(
    `SELECT identity, ruler, mode, record FROM claims c
      WHERE engine = ? AND (state = 'open' OR (state = 'leased' AND lease_until < ?))
        AND NOT EXISTS (SELECT 1 FROM scores s WHERE s.identity = c.identity AND s.ruler = c.ruler AND s.mode = c.mode)
      ORDER BY random() LIMIT 1`).bind(b.engine, now).first();
  if (!pick) return json({ ok: true, work: null });
  const lease = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  // THE RACE IS THE DATABASE'S: two clients reaching one row take it once.
  const took = await db.prepare(
    `UPDATE claims SET state = 'leased', lease = ?, lease_until = ?, leased_to = ?
      WHERE identity = ? AND ruler = ? AND mode = ? AND (state = 'open' OR (state = 'leased' AND lease_until < ?))`)
    .bind(lease, now + LEASE_MS, b.verifier, pick.identity, pick.ruler, pick.mode, now).run();
  if (!took.meta || !took.meta.changes) return json({ ok: true, work: null });
  return json({ ok: true, work: { lease, record: JSON.parse(pick.record), ruler: pick.ruler, mode: pick.mode } });
}

/// WHAT THE CLIENT MEASURED, against the claim. The answer is always `ok`: a
/// verifier learns nothing from it about whether it agreed.
async function verify(request, env) {
  const { b, err } = await read(request);
  if (err) return err;
  if (!LEASE_ID.test(b.lease || "") || !VERIFIER_ID.test(b.verifier || "")
      || typeof b.score !== "number" || !Number.isFinite(b.score) || b.score < 0) {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const db = env.LIBRARY, now = Date.now();
  const c = await db.prepare(
    "SELECT identity, ruler, mode, metric, score, engine FROM claims WHERE lease = ? AND leased_to = ? AND state = 'leased' AND lease_until >= ?")
    .bind(b.lease, b.verifier, now).first();
  if (!c) return json({ ok: true });
  const key = [c.identity, c.ruler, c.mode];
  if (b.score !== c.score) {
    await db.prepare("UPDATE claims SET state = 'dispute', verifier = ?, disputed = ?, lease = NULL WHERE identity = ? AND ruler = ? AND mode = ?")
      .bind(b.verifier, b.score, ...key).run();
    return json({ ok: true });
  }
  const state = Math.random() < SPOT_SHARE ? "spot" : "verified";
  const at = stamp();
  await db.batch([
    db.prepare("UPDATE claims SET state = ?, verifier = ?, lease = NULL WHERE identity = ? AND ruler = ? AND mode = ?")
      .bind(state, b.verifier, ...key),
    // A FACT THE SCORER ALREADY HOLDS STANDS: a verified client's number
    // fills a row nobody measured, and never replaces one somebody did.
    db.prepare(
      `INSERT OR IGNORE INTO scores (identity, ruler, mode, measured_by, score, metric, cost_seconds, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(...key, `verified:${c.engine}`, c.score, c.metric, at, at),
    // …AND THE ROW IS NO LONGER OWED, the same delete `ship_facts.sh` makes.
    db.prepare("DELETE FROM queue WHERE build_id = ? AND ruler = ? AND mode = ?").bind(...key),
    db.prepare("UPDATE verifiers SET agreed = agreed + 1 WHERE id = ?").bind(b.verifier),
  ]);
  return json({ ok: true });
}

export async function verifyRoute(request, env, path) {
  if (!env.LIBRARY) return json({ ok: false, error: "the library is not configured" }, 503);
  if (path === "/api/board/work") return work(request, env);
  if (path === "/api/board/verify") return verify(request, env);
  return json({ ok: false, error: "not found" }, 404);
}
