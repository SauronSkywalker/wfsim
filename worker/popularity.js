// SPDX-License-Identifier: AGPL-3.0-or-later
// THE POPULARITY RANKING — docs/ANALYTICS.md §"Shown publicly". Per weapon, how
// many people ran a simulation or a search on it, each counted once a day per
// kind, added up over the last 30 finished days `usage_days` holds. Totals the
// cron already keeps; nothing new is collected, and no visitor is in it.

const DAYS = 30;
const EVENTS = ["simulator.run", "optimizer.run"];

const reply = (body, status, maxAge) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8",
    "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });

export async function popularity(request, env, ctx) {
  if (request.method !== "GET") return reply({ ok: false, error: "GET only" }, 405);
  if (!env.LIBRARY) return reply({ ok: false, error: "not offered here" }, 501);
  // ONE ANSWER AN HOUR at each edge: the totals move once a day.
  const key = new Request(new URL("/api/popularity", request.url).toString());
  const hit = await caches.default.match(key);
  if (hit) return hit;
  // THE WINDOW ENDS AT THE NEWEST FINISHED DAY, not today: a day is written
  // after midnight UTC, so "today" would always be an empty day in the sum.
  const { results } = await env.LIBRARY.prepare(
    `WITH last AS (SELECT MAX(day) AS d FROM usage_days WHERE event = 'visitors' AND subject = 'all')
     SELECT subject, SUM(visitors) AS n, MIN(day) AS first, (SELECT d FROM last) AS last
     FROM usage_days, last
     WHERE event IN (${EVENTS.map(() => "?").join(",")}) AND day > date(last.d, ?)
     GROUP BY subject`).bind(...EVENTS, `-${DAYS} day`).all();
  const scores = Object.fromEntries(results.filter((r) => r.n > 0).map((r) => [r.subject, r.n]));
  const days = results.map((r) => r.first).sort();
  const res = reply({ ok: true, window_days: DAYS, from: days[0] || null, to: (results[0] || {}).last || null,
    events: EVENTS, scores }, 200, 3600);
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}
