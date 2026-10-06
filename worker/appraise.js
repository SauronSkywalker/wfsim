// SPDX-License-Identifier: AGPL-3.0-or-later
// RIVEN APPRAISAL — docs/AGENT.md §"Riven appraisal". Someone in a chat asks
// Nona about their own riven; the chat's bot opens an appraisal here, and whoever
// opens its link runs the search in their own browser and hands back the build.
// The worker keeps the appraisal and every build handed back; it computes
// nothing and trusts no number — the bot replays the build before anyone sees one.
//
// CHANNEL-BLIND: `chat` is where the answer goes, written and read only by that
// channel's bot (QQ today, Discord later); this file never looks inside it.

const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
const CODE_LEN = 5;
const KEEP_MS = 86_400_000;
/// A build handed back and not judged within this is handed to the bot again.
const RECLAIM_MS = 120_000;
/// How many appraisals one asker / one room may open in an hour.
const PER_ASKER = 5, PER_ROOM = 20, HOUR = 3_600_000;
const MAX_BUILD = 8_000, MAX_THANKS = 24;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const newCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
};

/// A name to thank, as a person typed it: short, one line, and never a link —
/// it is posted into a chat on their behalf.
const cleanThanks = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>]/g, " ")
  .replace(/(https?:\/\/|www\.)\S*/gi, "").replace(/\S+\.(com|net|org|cn|app|io|gg)\b\S*/gi, "")
  .replace(/\s+/g, " ").trim().slice(0, MAX_THANKS).trim();

const botAuthed = (request, env) => {
  const auth = request.headers.get("authorization") || "";
  return !!env.BOT_RELAY_TOKEN && auth === `Bearer ${env.BOT_RELAY_TOKEN}`;
};

export async function appraiseRoute(request, env, path) {
  if (!env.LIBRARY) return json({ ok: false, error: "not offered here" }, 501);
  if (path === "/api/appraise/new") return open(request, env);
  if (path === "/api/appraise/claim") return claim(request, env);
  const m = path.match(/^\/api\/appraise\/([A-Za-z0-9]{3,12})(\/result)?$/);
  if (!m) return json({ ok: false, error: "not found" }, 404);
  const code = m[1].toUpperCase();
  return m[2] ? handBack(request, env, code) : read(request, env, code);
}

/// THE BOT OPENS ONE: `{ channel, chat, asker, room, weapon, ruler, riven }`.
async function open(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!botAuthed(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch (_) { return json({ ok: false, error: "not json" }, 400); }
  const need = ["channel", "asker", "weapon", "ruler"];
  if (need.some((k) => typeof b[k] !== "string" || !b[k]) || !b.riven || typeof b.riven !== "object") {
    return json({ ok: false, error: `needs ${need.join(", ")} and riven` }, 400);
  }
  const db = env.LIBRARY, now = Date.now();
  const room = typeof b.room === "string" ? b.room : "";
  await db.prepare("DELETE FROM appraisals WHERE at < ?").bind(now - KEEP_MS).run();
  await db.prepare("DELETE FROM appraisal_results WHERE at < ?").bind(now - KEEP_MS).run();
  const [byAsker, byRoom] = await db.batch([
    db.prepare("SELECT count(*) AS n FROM appraisals WHERE channel = ? AND asker = ? AND at > ?").bind(b.channel, b.asker, now - HOUR),
    db.prepare("SELECT count(*) AS n FROM appraisals WHERE channel = ? AND room = ? AND room != '' AND at > ?").bind(b.channel, room, now - HOUR),
  ]);
  if (byAsker.results[0].n >= PER_ASKER) return json({ ok: false, error: "asker_limit", per_hour: PER_ASKER }, 429);
  if (room && byRoom.results[0].n >= PER_ROOM) return json({ ok: false, error: "room_limit", per_hour: PER_ROOM }, 429);
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const r = await db.prepare(`INSERT OR IGNORE INTO appraisals (code, channel, chat, asker, room, weapon, ruler, riven, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(code, b.channel, JSON.stringify(b.chat || {}), b.asker, room,
      b.weapon, b.ruler, JSON.stringify(b.riven), now).run();
    if (r.meta.changes) return json({ ok: true, code });
  }
  return json({ ok: false, error: "no code free" }, 503);
}

/// WHAT THE PAGE READS: the weapon, the ruler and the riven, whether it is done
/// and whom it thanked — never where the chat is or who asked.
async function read(request, env, code) {
  if (request.method !== "GET") return json({ ok: false, error: "GET only" }, 405);
  const a = await env.LIBRARY.prepare("SELECT * FROM appraisals WHERE code = ?").bind(code).first();
  if (!a || a.at < Date.now() - KEEP_MS) return json({ ok: false, error: "no such appraisal" }, 404);
  const won = a.winner && await env.LIBRARY.prepare("SELECT thanks FROM appraisal_results WHERE id = ?").bind(a.winner).first();
  // ONE BUILD HANDED BACK, by its id — what the bot's replay reads. A build is
  // board material and public; whose browser found it is not said.
  const rid = Number(new URL(request.url).searchParams.get("result"));
  const res = Number.isInteger(rid) && rid > 0
    && await env.LIBRARY.prepare("SELECT id, build, thanks FROM appraisal_results WHERE id = ? AND code = ?").bind(rid, code).first();
  return json({ ok: true, code, weapon: a.weapon, ruler: a.ruler, riven: JSON.parse(a.riven), at: a.at,
    done: !!a.done_at, ...(won ? { thanked: won.thanks } : {}),
    ...(res ? { result: { id: res.id, build: JSON.parse(res.build), thanks: res.thanks } } : {}) });
}

/// A BUILD HANDED BACK: `{ build, thanks }`, a board record and an optional name.
/// Every one is kept until the bot judges it; the first it accepts wins.
async function handBack(request, env, code) {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (env.OCR_LIMIT) {
    const { success } = await env.OCR_LIMIT.limit({ key: "appraise" + (request.headers.get("cf-connecting-ip") || "unknown") });
    if (!success) return json({ ok: false, error: "slow down" }, 429);
  }
  const text = await request.text();
  if (text.length > MAX_BUILD) return json({ ok: false, error: "too large" }, 413);
  let b;
  try { b = JSON.parse(text); } catch (_) { return json({ ok: false, error: "not json" }, 400); }
  if (!b.build || typeof b.build !== "object" || !Array.isArray(b.build.mods)) return json({ ok: false, error: "needs build" }, 400);
  const db = env.LIBRARY, now = Date.now();
  const a = await db.prepare("SELECT code, done_at, at FROM appraisals WHERE code = ?").bind(code).first();
  if (!a || a.at < now - KEEP_MS) return json({ ok: false, error: "no such appraisal" }, 404);
  await db.prepare("INSERT INTO appraisal_results (code, build, thanks, at) VALUES (?, ?, ?, ?)")
    .bind(code, JSON.stringify(b.build), cleanThanks(b.thanks), now).run();
  return json({ ok: true, first: !a.done_at });
}

/// THE BOT'S PULL, per channel. Its body reports what it judged and what it told:
/// `{ channel, judged: [{ id, ok, verdict }], told: [code] }`. It gets back the
/// builds still to judge and the finished appraisals still to tell.
async function claim(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!botAuthed(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  let b = {};
  try { b = await request.json(); } catch (_) {}
  const channel = String(b.channel || "");
  if (!channel) return json({ ok: false, error: "needs channel" }, 400);
  const db = env.LIBRARY, now = Date.now();
  for (const j of (Array.isArray(b.judged) ? b.judged : []).slice(0, 50)) {
    const id = Number(j.id);
    if (!Number.isInteger(id)) continue;
    await db.prepare("UPDATE appraisal_results SET verdict = ?, checked_at = ? WHERE id = ?")
      .bind(JSON.stringify({ ok: !!j.ok, ...(j.verdict || {}) }), now, id).run();
    // THE FIRST ACCEPTED BUILD WINS, once: a later one changes nothing.
    if (j.ok) {
      await db.prepare(`UPDATE appraisals SET winner = ?, done_at = ?
        WHERE done_at IS NULL AND code = (SELECT code FROM appraisal_results WHERE id = ?)`).bind(id, now, id).run();
    }
  }
  for (const code of (Array.isArray(b.told) ? b.told : []).slice(0, 50)) {
    await db.prepare("UPDATE appraisals SET told_at = ? WHERE code = ?").bind(now, String(code)).run();
  }
  const { results: toJudge } = await db.prepare(`SELECT r.id, r.code, r.build, r.thanks, r.at,
      a.weapon, a.ruler, a.riven, a.chat, a.asker, a.at AS asked_at
    FROM appraisal_results r JOIN appraisals a ON a.code = r.code
    WHERE a.channel = ? AND a.done_at IS NULL AND r.checked_at IS NULL AND (r.claimed_at IS NULL OR r.claimed_at < ?)
    ORDER BY r.at LIMIT 5`).bind(channel, now - RECLAIM_MS).all();
  if (toJudge.length) {
    await db.batch(toJudge.map((r) => db.prepare("UPDATE appraisal_results SET claimed_at = ? WHERE id = ?").bind(now, r.id)));
  }
  const { results: toTell } = await db.prepare(`SELECT a.code, a.weapon, a.ruler, a.riven, a.chat, a.asker, a.at AS asked_at,
      a.done_at, r.id AS result_id, r.thanks, r.verdict
    FROM appraisals a JOIN appraisal_results r ON r.id = a.winner
    WHERE a.channel = ? AND a.done_at IS NOT NULL AND a.told_at IS NULL ORDER BY a.done_at LIMIT 20`).bind(channel).all();
  const parse = (r) => ({ ...r, riven: JSON.parse(r.riven), chat: JSON.parse(r.chat),
    ...(r.build ? { build: JSON.parse(r.build) } : {}), ...(r.verdict ? { verdict: JSON.parse(r.verdict) } : {}) });
  return json({ ok: true, judge: toJudge.map(parse), tell: toTell.map(parse) });
}
