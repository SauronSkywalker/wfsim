// SPDX-License-Identifier: AGPL-3.0-or-later
// THE COMPUTE A READER'S MACHINES GIVE THE BOARD, counted under their name —
// docs/BOARD.md §"Contribution". A signed-in page claims the browser it runs
// in (its verifier id, `69-board-work.js`); the work every fact credited to that
// id (`verifiers.work`, worker/verify.js) is then the account's. Only the owner
// is joined to a device, never a submission, and an account is on the public
// ranking only once it chose to be.
//
//   GET  /api/account/devices        → { devices: [{ id, claimed_at, points, recent }], points, recent, shown }
//   POST /api/account/devices/claim  { verifier } → { ok }
//   POST /api/account/contribution   { shown }    → { ok }
//   POST /api/board/points           { verifier } → { points, recent, claimed }
//   GET  /api/contributors[?period=recent] → { contributors: [{ name, username, points, recent }] }
//
// `recent` is the last `RECENT_DAYS` days, so a newcomer can lead somewhere.
import { json, no, now, sameSite, sessionAccount } from "./accounts.js";

/// `WORK_WEIGHTS` counts in billionths of a point.
const WORK_PER_POINT = 1e9;
/// The ranking's other column: the days counted back from today, today included.
export const RECENT_DAYS = 30;
/// How many names the ranking shows.
export const RANKED = 100;
const VERIFIER_ID = /^[a-z0-9]{16,40}$/;
/// D1 binds at most a hundred parameters a statement.
const PER_STATEMENT = 90;

const points = (work) => Math.floor(work / WORK_PER_POINT);

const since = () => new Date(Date.now() - (RECENT_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);

/// THE WORK EACH OF `ids` IS CREDITED — `{ work, recent }`, all of it and the
/// last `RECENT_DAYS` days — a refused client's counting for nothing.
async function workOf(env, ids) {
  const out = new Map();
  if (!env.LIBRARY) return out;
  const from = since();
  for (let i = 0; i < ids.length; i += PER_STATEMENT) {
    const part = ids.slice(i, i + PER_STATEMENT);
    const marks = part.map(() => "?").join(", ");
    const [all, recent] = await env.LIBRARY.batch([
      env.LIBRARY.prepare(`SELECT id, work FROM verifiers WHERE banned = 0 AND id IN (${marks})`).bind(...part),
      env.LIBRARY.prepare(
        `SELECT d.verifier AS id, SUM(d.work) AS work FROM verifier_days d JOIN verifiers v ON v.id = d.verifier
          WHERE v.banned = 0 AND d.day >= ? AND d.verifier IN (${marks}) GROUP BY d.verifier`).bind(from, ...part),
    ]);
    for (const r of all.results) out.set(r.id, { work: r.work || 0, recent: 0 });
    for (const r of recent.results) if (out.has(r.id)) out.get(r.id).recent = r.work || 0;
  }
  return out;
}
const NONE = { work: 0, recent: 0 };

async function devices(env, account) {
  const { results } = await env.ACCOUNTS.prepare(
    "SELECT verifier, claimed_at FROM devices WHERE account = ?1 ORDER BY claimed_at").bind(account).all();
  const work = await workOf(env, results.map((d) => d.verifier));
  const shown = !!(await env.ACCOUNTS.prepare("SELECT 1 FROM contributors WHERE account = ?1").bind(account).first());
  const list = results.map((d) => ({ id: d.verifier.slice(0, 6), claimed_at: d.claimed_at, ...(work.get(d.verifier) || NONE) }));
  return json({ ok: true, shown,
    points: points(list.reduce((s, d) => s + d.work, 0)), recent: points(list.reduce((s, d) => s + d.recent, 0)),
    devices: list.map(({ work: w, recent: r, ...d }) => ({ ...d, points: points(w), recent: points(r) })) });
}

/// WHAT ONE BROWSER HAS EARNED, asked by the browser itself: its id is a secret
/// only it holds, so this tells nobody else anything. `claimed` says whether
/// an account owns it, and never which.
async function devicePoints(env, b) {
  if (!VERIFIER_ID.test(b.verifier || "")) return no("bad_device");
  const w = (await workOf(env, [b.verifier])).get(b.verifier) || NONE;
  const claimed = !!(env.ACCOUNTS && await env.ACCOUNTS.prepare("SELECT 1 FROM devices WHERE verifier = ?1").bind(b.verifier).first());
  return json({ ok: true, points: points(w.work), recent: points(w.recent), claimed });
}

/// A DEVICE BELONGS TO THE LAST ACCOUNT TO CLAIM IT, and its work goes with it:
/// the id is a secret only that browser holds, so whoever sends it is at it.
async function claim(env, account, b) {
  if (!VERIFIER_ID.test(b.verifier || "")) return no("bad_device");
  await env.ACCOUNTS.prepare(
    `INSERT INTO devices (verifier, account, claimed_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (verifier) DO UPDATE SET account = ?2, claimed_at = ?3 WHERE account != ?2`,
  ).bind(b.verifier, account, now().slice(0, 10)).run();
  return json({ ok: true });
}

async function shown(env, account, b) {
  await (b.shown === true
    ? env.ACCOUNTS.prepare("INSERT OR IGNORE INTO contributors (account, shown_at) VALUES (?1, ?2)").bind(account, now().slice(0, 10))
    : env.ACCOUNTS.prepare("DELETE FROM contributors WHERE account = ?1").bind(account)).run();
  return json({ ok: true });
}

/// THE RANKING: every account that chose to be on it, by the work its devices
/// were credited — all of it, or the last `RECENT_DAYS` days — most first.
async function ranking(env, period) {
  const { results } = await env.ACCOUNTS.prepare(
    `SELECT a.id, a.username, a.display_name, d.verifier FROM contributors c
       JOIN accounts a ON a.id = c.account JOIN devices d ON d.account = c.account`).all();
  const work = await workOf(env, results.map((r) => r.verifier));
  const by = new Map();
  for (const r of results) {
    const e = by.get(r.id) || { name: r.display_name || r.username, username: r.username, work: 0, recent: 0 };
    const w = work.get(r.verifier) || NONE;
    e.work += w.work;
    e.recent += w.recent;
    by.set(r.id, e);
  }
  const key = period === "recent" ? "recent" : "points";
  const contributors = [...by.values()]
    .map((e) => ({ name: e.name, username: e.username, points: points(e.work), recent: points(e.recent) }))
    .filter((e) => e[key] > 0)
    .sort((x, y) => y[key] - x[key] || y.points - x.points || x.username.localeCompare(y.username))
    .slice(0, RANKED);
  return json({ ok: true, period: key === "recent" ? "recent" : "all", contributors });
}

/// The response for a contribution path, or null for a path that is not one.
export async function contributionRoute(request, env, path) {
  if (path === "/api/contributors") {
    if (request.method !== "GET") return no("method", 405);
    if (!env.ACCOUNTS) return json({ ok: true, contributors: [] });
    return ranking(env, new URL(request.url).searchParams.get("period"));
  }
  if (path === "/api/board/points") {
    if (request.method !== "POST") return no("method", 405);
    let b = {};
    try { b = JSON.parse((await request.text()) || "{}"); } catch (_) { return no("not_json"); }
    return devicePoints(env, b);
  }
  if (path !== "/api/account/devices" && path !== "/api/account/devices/claim" && path !== "/api/account/contribution") return null;
  if (!env.ACCOUNTS || !env.AUTH_SECRET) return no("unavailable", 503);
  const get = path === "/api/account/devices";
  if (request.method !== (get ? "GET" : "POST")) return no("method", 405);
  if (!get && !sameSite(request)) return no("cross_site", 403);
  const account = await sessionAccount(env, request);
  if (!account) return no("not_signed_in", 401);
  if (get) return devices(env, account);
  let b = {};
  try { b = JSON.parse((await request.text()) || "{}"); } catch (_) { return no("not_json"); }
  return path === "/api/account/devices/claim" ? claim(env, account, b) : shown(env, account, b);
}
