// SPDX-License-Identifier: AGPL-3.0-or-later
// THE UTILITY PAGES' WORLD, from DE's world state — docs/UI.md §"Utility".
// DE's host refuses a request from a Cloudflare Worker (403 whatever it sends),
// and a page cannot read it across origins, so the bot server relays it: each
// minute it PUTs DE's file here, this turns each thing a page lists into one
// ITEM, names it, and keeps the result in R2 for anyone to read.
//
//   GET /api/world                                   the items, as last relayed
//   PUT /api/world   (bearer BOT_RELAY_TOKEN)         DE's worldState.php, as read
import NAMES from "./world_names.json";

const KEY = "world/items.json";
/// The relay runs each minute; a reader is never more than this behind it.
const FRESH_S = 30;
const MAX_BYTES = 4 * 1024 * 1024;
const OPEN = { "access-control-allow-origin": "*" };

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", ...OPEN, ...extra } });
const msOf = (d) => Number(d && d.$date && d.$date.$numberLong) || 0;

export async function worldRoute(request, env, ctx, path) {
  if (path !== "/api/world") return json({ ok: false, error: "not found" }, 404);
  if (request.method === "PUT") return worldRelay(request, env);
  if (request.method !== "GET") return json({ ok: false, error: "GET or PUT" }, 405);
  const cache = caches.default;
  const key = new Request(new URL(path, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const obj = env.UPLOADS && await env.UPLOADS.get(KEY).catch(() => null);
  if (!obj) return json({ ok: false, error: "the world state has not been relayed yet" }, 503);
  const res = new Response(obj.body, { headers: { "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${FRESH_S}`, ...OPEN } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function worldRelay(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.BOT_RELAY_TOKEN || auth !== `Bearer ${env.BOT_RELAY_TOKEN}`) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ ok: false, error: "too large" }, 413);
  let ws;
  try { ws = JSON.parse(body); } catch (_) { return json({ ok: false, error: "not json" }, 400); }
  if (!ws || !Array.isArray(ws.ActiveMissions)) return json({ ok: false, error: "not a world state" }, 400);
  const now = Date.now();
  const items = worldItems(ws, now);
  await env.UPLOADS.put(KEY, JSON.stringify({ ok: true, read_at_ms: now, items }),
    { httpMetadata: { contentType: "application/json" } });
  return json({ ok: true, items: items.length });
}

/// ONE SHAPE FOR EVERYTHING A UTILITY PAGE LISTS: `{kind, id, attributes,
/// names, started_at_ms, ends_at_ms}`. A reminder matches on `attributes` and
/// nothing else, so a new kind is a parser here and a page, and reminders reach
/// it unchanged. `names` holds `{en, zh}` for each attribute it can name.
const KINDS = { fissure: fissuresOf };

export const worldItems = (ws, now) => Object.entries(KINDS)
  .flatMap(([kind, of]) => of(ws).map((x) => ({ kind, ...x })))
  .filter((x) => x.ends_at_ms > now);

/// EVERY OPEN FISSURE. `list` is which of the game's three it is in: a Steel
/// Path fissure is an ordinary one marked `Hard`, and a Void Storm is a Railjack
/// node's. An id the table does not know has no name, and the page shows the id.
function fissuresOf(ws) {
  const missions = (ws.ActiveMissions || []).map((m) => ({ id: m._id && m._id.$oid,
    list: m.Hard ? "steel_path" : "normal", tier: m.Modifier, node: m.Node, mission: m.MissionType,
    started_at_ms: msOf(m.Activation), ends_at_ms: msOf(m.Expiry) }));
  const storms = (ws.VoidStorms || []).map((s) => ({ id: s._id && s._id.$oid,
    list: "railjack", tier: s.ActiveMissionTier, node: s.Node, mission: null,
    started_at_ms: msOf(s.Activation), ends_at_ms: msOf(s.Expiry) }));
  return [...missions, ...storms].map((f) => {
    const n = NAMES.nodes[f.node] || {};
    // A STORM'S MISSION IS ITS NODE'S: every Railjack node is `MT_RAILJACK`,
    // whatever it plays, so a storm has no mission to match on and names the
    // node's own.
    return { id: f.id,
      attributes: { list: f.list, tier: f.tier, mission: f.mission, node: f.node },
      names: { tier: NAMES.tiers[f.tier] || null,
        mission: (f.mission ? NAMES.missions[f.mission] : n.mission) || null,
        node: n.name || null, system: n.system || null },
      started_at_ms: f.started_at_ms, ends_at_ms: f.ends_at_ms };
  });
}
