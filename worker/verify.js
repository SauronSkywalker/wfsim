// SPDX-License-Identifier: AGPL-3.0-or-later
// COMPUTE ORDERS — docs/BOARD.md §"Compute orders". Every owed row is an order;
// this hands one at a time to a machine that has the site open, and keeps what
// comes back. The first result makes an order `fresh` (the server ranks it);
// each later one, from a client that has not measured it, is compared bit for
// bit — the engine is deterministic on every target (docs/WASM.md) — and
// `CLIENTS_PER_FACT` equal results make a fact in `scores`. Nothing here
// computes a number.
//
//   POST /api/board/work    { verifier, engine, protocol }              → { work: { lease, record, ruler, mode } | null }
//   POST /api/board/verify  { lease, verifier, engine, score, metric }  → { ok }

/// A browser fights a crowd row in minutes; a lease outlives the slowest.
export const LEASE_MS = 30 * 60_000;
/// HOW MANY DIFFERENT CLIENTS MUST MEASURE THE SAME BITS before a result is a
/// fact. 1 takes the first result unchecked; each one more is one more
/// independent client the result waits for. A check sets `env.CLIENTS_PER_FACT`.
export const CLIENTS_PER_FACT = 2;
/// The share of facts the server recomputes anyway, which is what makes
/// two colluding clients a gamble rather than a method.
export const SPOT_SHARE = 0.05;
/// The range an order's `slot` is drawn from (`ship_queue.sh`).
const SLOT_SPAN = 2147483647;
/// WHAT A PAGE THAT CAN FILL AN ORDER SENDS. A tab opened before orders existed
/// asks too, takes an order, and answers in a shape this refuses — holding the
/// order for a lease's length — so a page that does not say this gets nothing.
export const PROTOCOL = 2;

const VERIFIER_ID = /^[a-z0-9]{16,40}$/;
const ENGINE_ID = /^[A-Za-z0-9._-]{1,40}$/;
const LEASE_ID = /^[a-f0-9]{32}$/;
const METRIC_ID = /^[a-z_]{1,24}$/;

const needed = (env) => env.CLIENTS_PER_FACT ?? CLIENTS_PER_FACT;
/// EVERY CLIENT THAT MEASURED AN ORDER, in the order their results came.
const clientsOf = (o) => (o.clients || o.produced_by || "").split(",").filter(Boolean);

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

/// THE CLIENT, remembered by the id it made and nothing else — written once,
/// and again only when the day changes. `null` when it may not work.
async function admit(db, id) {
  const v = await db.prepare("SELECT banned, seen FROM verifiers WHERE id = ?").bind(id).first();
  if (!v) {
    await db.prepare("INSERT OR IGNORE INTO verifiers (id, seen) VALUES (?, ?)").bind(id, day()).run();
    return id;
  }
  if (v.banned) return null;
  if (v.seen !== day()) await db.prepare("UPDATE verifiers SET seen = ? WHERE id = ?").bind(day(), id).run();
  return id;
}

/// UP TO `n` LEASABLE ORDERS IN ONE STATE, from a random slot onwards and then
/// from the start: a seek on `orders_pick`, so a lease reads a few rows however
/// long the book is.
async function candidates(db, state, engine, now, n) {
  const start = Math.floor(Math.random() * SLOT_SPAN);
  const out = [];
  for (const from of [start, 0]) {
    const { results } = await db.prepare(
      `SELECT identity, ruler, mode, record, produced_by, clients FROM orders
        WHERE state = ? AND engine = ? AND slot >= ? AND (lease_until IS NULL OR lease_until < ?)
        ORDER BY slot LIMIT ?`).bind(state, engine, from, now, n).all();
    out.push(...results);
    if (out.length) break;
  }
  return out;
}

const owed = async (db, o) => !!(await db.prepare(
  "SELECT 1 AS x FROM queue WHERE build_id = ? AND ruler = ? AND mode = ? LIMIT 1").bind(o.identity, o.ruler, o.mode).first());

/// ONE ORDER TO FIGHT: a further result wanted first (never from a client
/// that measured it already), then a first one. Never the number to agree with.
async function work(request, env) {
  const { b, err } = await read(request);
  if (err) return err;
  if (!VERIFIER_ID.test(b.verifier || "") || !ENGINE_ID.test(b.engine || "")) return json({ ok: false, error: "bad request" }, 400);
  if (b.protocol !== PROTOCOL) return json({ ok: true, work: null });
  const db = env.LIBRARY, now = Date.now();
  if (!(await admit(db, b.verifier))) return json({ ok: true, work: null });
  // ONE AT A TIME: a client holding a live lease gets nothing more.
  const held = await db.prepare("SELECT 1 AS x FROM orders WHERE leased_to = ? AND lease_until > ? LIMIT 1")
    .bind(b.verifier, now).first();
  if (held) return json({ ok: true, work: null });
  const pool = [
    ...(await candidates(db, "open", b.engine, now, 4)).filter((o) => !clientsOf(o).includes(b.verifier)).map((o) => ({ ...o, state: "open" })),
    ...(await candidates(db, "todo", "", now, 4)).map((o) => ({ ...o, state: "todo" })),
  ];
  for (const o of pool) {
    const key = [o.identity, o.ruler, o.mode];
    // A ROW NOBODY OWES ANY MORE — the scorer measured it — is settled here,
    // where it is found, rather than by a sweep nobody runs.
    if (!(await owed(db, o))) {
      await db.prepare("UPDATE orders SET state = 'settled' WHERE identity = ? AND ruler = ? AND mode = ? AND state = ?")
        .bind(...key, o.state).run();
      continue;
    }
    const lease = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    // THE RACE IS THE DATABASE'S: two clients reaching one order take it once.
    const took = await db.prepare(
      `UPDATE orders SET lease = ?, lease_until = ?, leased_to = ?
        WHERE identity = ? AND ruler = ? AND mode = ? AND state = ? AND (lease_until IS NULL OR lease_until < ?)`)
      .bind(lease, now + LEASE_MS, b.verifier, ...key, o.state, now).run();
    if (took.meta && took.meta.changes) {
      return json({ ok: true, work: { lease, record: JSON.parse(o.record), ruler: o.ruler, mode: o.mode } });
    }
  }
  return json({ ok: true, work: null });
}

/// WHAT THE CLIENT MEASURED. The answer is always `ok`: a client learns
/// nothing from it about whether it agreed.
async function verify(request, env) {
  const { b, err } = await read(request);
  if (err) return err;
  if (!LEASE_ID.test(b.lease || "") || !VERIFIER_ID.test(b.verifier || "") || !ENGINE_ID.test(b.engine || "")
      || !METRIC_ID.test(b.metric || "")
      || typeof b.score !== "number" || !Number.isFinite(b.score) || b.score < 0) {
    return json({ ok: false, error: "bad request" }, 400);
  }
  const db = env.LIBRARY, now = Date.now();
  const o = await db.prepare(
    `SELECT identity, ruler, mode, state, engine, score, metric, produced_by, clients FROM orders
      WHERE lease = ? AND leased_to = ? AND lease_until >= ?`).bind(b.lease, b.verifier, now).first();
  if (!o) return json({ ok: true });
  const key = [o.identity, o.ruler, o.mode];
  const done = "lease = NULL, lease_until = NULL, leased_to = NULL";
  if (o.state === "todo") {
    if (needed(env) <= 1) {
      await fact(db, key, { ...o, score: b.score, metric: b.metric, engine: b.engine, produced_by: b.verifier }, [b.verifier], b.verifier);
      return json({ ok: true });
    }
    // THE FIRST RESULT, which the server ranks before anyone may agree with it.
    await db.prepare(`UPDATE orders SET state = 'fresh', score = ?, metric = ?, engine = ?, produced_by = ?, clients = ?, ${done}
                      WHERE identity = ? AND ruler = ? AND mode = ? AND state = 'todo'`)
      .bind(b.score, b.metric, b.engine, b.verifier, b.verifier, ...key).run();
    return json({ ok: true });
  }
  if (o.state !== "open") return json({ ok: true });
  const clients = [...clientsOf(o), b.verifier];
  if (b.engine !== o.engine || b.score !== o.score || b.metric !== o.metric) {
    await db.prepare(`UPDATE orders SET state = 'dispute', verifier = ?, disputed = ?, clients = ?, ${done}
                      WHERE identity = ? AND ruler = ? AND mode = ?`).bind(b.verifier, b.score, clients.join(","), ...key).run();
    return json({ ok: true });
  }
  if (clients.length < needed(env)) {
    await db.batch([
      db.prepare(`UPDATE orders SET clients = ?, ${done} WHERE identity = ? AND ruler = ? AND mode = ?`)
        .bind(clients.join(","), ...key),
      db.prepare("UPDATE verifiers SET agreed = agreed + 1 WHERE id = ?").bind(b.verifier),
    ]);
    return json({ ok: true });
  }
  await fact(db, key, o, clients, b.verifier);
  return json({ ok: true });
}

/// THE RESULT `clients` MEASURED, made a fact — stamped when the last of them
/// answered, which is when it was verified.
async function fact(db, key, o, clients, last) {
  const state = Math.random() < SPOT_SHARE ? "spot" : "verified";
  const at = stamp();
  await db.batch([
    db.prepare(`UPDATE orders SET state = ?, score = ?, metric = ?, engine = ?, produced_by = ?, verifier = ?, clients = ?,
                lease = NULL, lease_until = NULL, leased_to = NULL WHERE identity = ? AND ruler = ? AND mode = ?`)
      .bind(state, o.score, o.metric, o.engine, o.produced_by, last, clients.join(","), ...key),
    // A FACT THE SCORER ALREADY HOLDS STANDS: the clients fill a row nobody
    // measured, and never replace one somebody did.
    db.prepare(
      `INSERT OR IGNORE INTO scores (identity, ruler, mode, measured_by, score, metric, cost_seconds, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(...key, `verified:${o.engine}`, o.score, o.metric, at, at),
    // …AND THE ROW IS NO LONGER OWED, the same delete `ship_facts.sh` makes.
    db.prepare("DELETE FROM queue WHERE build_id = ? AND ruler = ? AND mode = ?").bind(...key),
    db.prepare("UPDATE verifiers SET agreed = agreed + 1 WHERE id = ?").bind(last),
  ]);
}

export async function verifyRoute(request, env, path) {
  if (!env.LIBRARY) return json({ ok: false, error: "the library is not configured" }, 503);
  if (path === "/api/board/work") return work(request, env);
  if (path === "/api/board/verify") return verify(request, env);
  return json({ ok: false, error: "not found" }, 404);
}
