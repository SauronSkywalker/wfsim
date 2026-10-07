// SPDX-License-Identifier: AGPL-3.0-or-later
// THE SERVER'S SIDE OF COMPUTE ORDERS — docs/BOARD.md §"Compute orders". Run
// by `live_board.sh`: `rank` every cycle, `settle` in a loop beside it.
//
//   node live_orders.mjs rank <work-dir>               fresh results: top ten → server, the rest → open
//   node live_orders.mjs settle <work-dir> <bin-dir>   top-ten, disputed and spot-checked orders, fought here
//   node live_orders.mjs unverified <work-dir> <out>   every result not yet a fact, as fact lines
//
// A RESULT IN ITS GROUP'S TOP TEN IS THE SERVER'S: a second client is the check
// everywhere else, and a forged number at the top is the one that would be
// read. `settle` fights with the scorer itself (`wfsim-board --queue-in`),
// ships the fact through `ship_facts.sh`, and refuses whichever client its
// number disproves — only when the order's engine is the one this server runs
// (`bin/ENGINE`), since another engine proves nothing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOP = 10;
const RANK_PER_CYCLE = 2000;
const SETTLE_PER_CYCLE = 3;
const HERE = dirname(fileURLToPath(import.meta.url));
const [mode, work, arg] = process.argv.slice(2);

async function d1(sql, params = []) {
  const { CF_ACCOUNT, CF_TOKEN, CF_D1_DATABASE } = process.env;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${CF_D1_DATABASE}/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${CF_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.success) throw new Error(`d1 ${r.status}: ${JSON.stringify(j && j.errors)}`);
  return j.result[0].results;
}

const lines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const key = (f) => `${f.identity}|${f.ruler}|${f.mode}`;
const where = "WHERE identity = ? AND ruler = ? AND mode = ?";
const keyOf = (o) => [o.identity, o.ruler, o.mode];

/// WHERE A RESULT STANDS among the verified rows of its group on the site's
/// board — one ruler, one mode, riven or not, the grouping the page draws.
function rank(o) {
  const record = JSON.parse(o.record);
  const p = join(work, "verified", `${record.weapon}.json`);
  if (!existsSync(p)) return 1;
  const riven = !!(record.riven_pos && record.riven_pos.length);
  const group = JSON.parse(readFileSync(p, "utf8"))
    .filter((r) => r.benchmark === o.ruler && (r.mode || "base") === o.mode && !!r.riven === riven);
  return 1 + group.filter((r) => r.score > o.score).length;
}

// AS MANY ORDERS A STATEMENT AS D1'S HUNDRED BOUND PARAMETERS ALLOW: one call
// an order took a minute a few hundred, while the first results waited.
const KEYS_PER_STATEMENT = Math.floor((100 - 1) / 3);

async function rankFresh() {
  const fresh = await d1("SELECT identity, ruler, mode, record, score FROM orders WHERE state = 'fresh' LIMIT ?", [RANK_PER_CYCLE]);
  const to = { arbiter: [], open: [] };
  for (const o of fresh) to[rank(o) <= TOP ? "arbiter" : "open"].push(o);
  for (const [state, list] of Object.entries(to)) {
    for (let i = 0; i < list.length; i += KEYS_PER_STATEMENT) {
      const part = list.slice(i, i + KEYS_PER_STATEMENT);
      await d1(`UPDATE orders SET state = ? WHERE (identity, ruler, mode) IN (VALUES ${part.map(() => "(?, ?, ?)").join(", ")})
                AND state = 'fresh'`, [state, ...part.flatMap(keyOf)]);
    }
  }
  if (fresh.length) console.error(`orders: ranked ${fresh.length}, ${to.arbiter.length} in a top ten`);
}

/// THE SCORER'S OWN NUMBER for one order, and the fact shipped to `scores`.
function fight(o) {
  const dir = join(work, "settle");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lib.json"), JSON.stringify([JSON.parse(o.record)]));
  writeFileSync(join(dir, "q.ndjson"), JSON.stringify({ build_id: o.identity, ruler: o.ruler, mode: o.mode }) + "\n");
  execFileSync(join(arg, "wfsim-board"), [o.ruler, join(dir, "board"), "--facts", join(dir, "facts.ndjson"),
    "--measured-by", readFileSync(join(arg, "VERSION"), "utf8").trim(), "--queue-in", join(dir, "q.ndjson")],
  { input: readFileSync(join(dir, "lib.json")), stdio: ["pipe", "ignore", "ignore"] });
  const got = lines(join(dir, "facts.ndjson")).find((f) => key(f) === key(o));
  if (!got) return null;
  execFileSync("bash", [join(HERE, "ship_facts.sh"), join(dir, "facts.ndjson")], { stdio: ["ignore", "ignore", "inherit"] });
  return got.score;
}

/// A CLIENT ITS NUMBER DISPROVED, refused. What it agreed to is withdrawn and
/// opened again; what it measured first and nobody has confirmed is measured
/// again. A result of its that an independent client confirmed stands.
async function ban(id) {
  if (!id) return;
  await d1("UPDATE verifiers SET banned = 1 WHERE id = ?", [id]);
  const agreed = await d1("SELECT identity, ruler, mode FROM orders WHERE verifier = ? AND state IN ('verified', 'spot')", [id]);
  for (const o of agreed) {
    await d1(`DELETE FROM scores ${where} AND measured_by LIKE 'verified:%'`, keyOf(o));
    await d1(`UPDATE orders SET state = 'open', verifier = NULL ${where}`, keyOf(o));
  }
  await d1(`UPDATE orders SET state = 'todo', engine = '', score = NULL, metric = NULL, produced_by = NULL
            WHERE produced_by = ? AND state IN ('fresh', 'open', 'arbiter', 'dispute')`, [id]);
  console.error(`orders: refused client ${id.slice(0, 6)}…, ${agreed.length} agreement(s) withdrawn`);
}

async function settle() {
  const engine = existsSync(join(arg, "ENGINE")) ? readFileSync(join(arg, "ENGINE"), "utf8").trim() : "";
  // A TOP-TEN ROW NOBODY OWES ANY MORE — the scorer measured it after the
  // clients' hold — is settled unfought, as a lease settles one: fighting it
  // again queued every new top-ten row behind a day of facts already banked.
  const gone = await d1(`UPDATE orders SET state = 'settled' WHERE state = 'arbiter' AND NOT EXISTS
                         (SELECT 1 FROM queue q WHERE q.build_id = orders.identity AND q.ruler = orders.ruler
                          AND q.mode = orders.mode) RETURNING identity`);
  if (gone.length) console.error(`orders: settled ${gone.length} top-ten order(s) the scorer already measured`);
  const todo = await d1(`SELECT identity, ruler, mode, record, score, engine, state, produced_by, verifier, disputed
                         FROM orders WHERE state IN ('arbiter', 'dispute', 'spot') ORDER BY state LIMIT ?`, [SETTLE_PER_CYCLE]);
  for (const o of todo) {
    let truth = null;
    try { truth = fight(o); } catch (e) { console.error(`orders: ${o.identity.slice(0, 8)} did not fight — ${e.message}`); }
    if (truth === null) continue;
    // WHOEVER THE SERVER DISAGREES WITH WAS WRONG: the first result, the
    // second, or both when they agreed on a wrong number.
    if (o.engine === engine) {
      if (truth !== o.score) await ban(o.produced_by);
      if (o.state === "dispute" && truth !== o.disputed) await ban(o.verifier);
      if (o.state === "spot" && truth !== o.score) await ban(o.verifier);
    }
    const state = truth === o.score ? "verified" : "rejected";
    await d1(`UPDATE orders SET state = ? ${where}`, [state, ...keyOf(o)]);
    console.error(`orders: settled ${o.state} ${o.identity.slice(0, 8)} ${o.ruler}/${o.mode} — ${state}`);
  }
}

/// EVERY RESULT NOT YET A FACT, as the fact lines the owner's board projects
/// (`board::CLIENT_MEASURED` marks them unverified).
async function unverified() {
  const rows = await d1(`SELECT identity, ruler, mode, score, metric, engine FROM orders
                         WHERE state IN ('fresh', 'open', 'arbiter', 'dispute') AND score IS NOT NULL`);
  const at = new Date().toISOString().slice(0, 19) + "Z";
  writeFileSync(arg, rows.map((o) => JSON.stringify({
    identity: o.identity, ruler: o.ruler, mode: o.mode, metric: o.metric, measured_by: `client:${o.engine}`,
    score: o.score, cost_seconds: 0, started_at: at, finished_at: at,
  }) + "\n").join(""));
}

if (mode === "rank") await rankFresh();
else if (mode === "settle") await settle();
else if (mode === "unverified") await unverified();
else { console.error("usage: live_orders.mjs rank|settle|unverified <work-dir> [bin-dir|out]"); process.exit(2); }
