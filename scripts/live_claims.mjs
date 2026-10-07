// SPDX-License-Identifier: AGPL-3.0-or-later
// THE LIVE BOARD'S CLAIMS, AND THE SERVER'S SIDE OF CROSS-VERIFICATION —
// docs/BOARD.md §"Cross-verification". Run by `live_board.sh` every cycle.
//
//   node live_claims.mjs file <work-dir>              claims from this cycle's intake
//   node live_claims.mjs settle <work-dir> <bin-dir>  the server's rows, fought natively
//
// A CLAIM IN ITS GROUP'S TOP TEN IS THE SERVER'S: a second client is the
// check everywhere else, and a forged number at the top is the one that would
// be read. `settle` fights those, every dispute and every spot check with the
// scorer itself (`wfsim-board --queue-in`), ships the fact through
// `ship_facts.sh`, and refuses a verifier its number disproves — but only when
// the claim's engine is the one this server runs (`ENGINE_ID`), since another
// is a different engine and proves nothing.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOP = 10;
const SETTLE_PER_CYCLE = 3;
const HERE = dirname(fileURLToPath(import.meta.url));
const [mode, work, bin] = process.argv.slice(2);

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
const day = () => new Date().toISOString().slice(0, 10);

/// WHERE A CLAIM STANDS in its own group of the live board — one ruler, one
/// mode, no riven, the grouping the page draws.
function rank(weapon, f) {
  const p = join(work, "board", `${weapon}.json`);
  if (!existsSync(p)) return Infinity;
  const rows = JSON.parse(readFileSync(p, "utf8"));
  const group = rows.filter((r) => r.benchmark === f.ruler && (r.mode || "base") === f.mode && !r.riven);
  return 1 + group.filter((r) => r.score > f.score).length;
}

async function file() {
  const known = new Set(lines(join(work, "facts-known.ndjson")).map(key));
  const builds = new Map(lines(join(work, "new-builds.ndjson")).map((b) => [b.id, b.record]));
  let filed = 0;
  for (const f of lines(join(work, "produced-new.ndjson"))) {
    const record = builds.get(f.identity);
    if (!record || known.has(key(f))) continue;
    const engine = String(f.measured_by || "").replace(/^client:/, "");
    const state = rank(record.weapon, f) <= TOP ? "arbiter" : "open";
    await d1(`INSERT OR IGNORE INTO claims (identity, ruler, mode, record, metric, score, engine, state, at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.identity, f.ruler, f.mode, JSON.stringify(record), f.metric, f.score, engine, state, day()]);
    filed += 1;
  }
  console.error(`claims: filed ${filed}`);
}

/// THE SCORER'S OWN NUMBER for one row, and the fact shipped to `scores`.
function fight(c) {
  const dir = join(work, "settle");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lib.json"), JSON.stringify([JSON.parse(c.record)]));
  writeFileSync(join(dir, "q.ndjson"), JSON.stringify({ build_id: c.identity, ruler: c.ruler, mode: c.mode }) + "\n");
  execFileSync(join(bin, "wfsim-board"), [c.ruler, join(dir, "board"), "--facts", join(dir, "facts.ndjson"),
    "--measured-by", readFileSync(join(bin, "VERSION"), "utf8").trim(), "--queue-in", join(dir, "q.ndjson")],
  { input: readFileSync(join(dir, "lib.json")), stdio: ["pipe", "ignore", "ignore"] });
  const got = lines(join(dir, "facts.ndjson")).find((f) => key(f) === key(c));
  if (!got) return null;
  execFileSync("bash", [join(HERE, "ship_facts.sh"), join(dir, "facts.ndjson")], { stdio: ["ignore", "ignore", "inherit"] });
  return got.score;
}

/// A VERIFIER ITS NUMBER DISPROVED, refused — and every row it agreed to goes
/// back to be verified again, its facts withdrawn.
async function ban(id) {
  await d1("UPDATE verifiers SET banned = 1 WHERE id = ?", [id]);
  const agreed = await d1("SELECT identity, ruler, mode FROM claims WHERE verifier = ? AND state IN ('verified', 'spot')", [id]);
  for (const c of agreed) {
    await d1("DELETE FROM scores WHERE identity = ? AND ruler = ? AND mode = ? AND measured_by LIKE 'verified:%'", [c.identity, c.ruler, c.mode]);
    await d1("UPDATE claims SET state = 'open', verifier = NULL WHERE identity = ? AND ruler = ? AND mode = ?", [c.identity, c.ruler, c.mode]);
  }
  console.error(`claims: refused verifier ${id.slice(0, 6)}…, ${agreed.length} row(s) re-opened`);
}

async function settle() {
  const engine = existsSync(join(bin, "ENGINE")) ? readFileSync(join(bin, "ENGINE"), "utf8").trim() : "";
  const todo = await d1(`SELECT identity, ruler, mode, record, score, engine, state, verifier, disputed FROM claims
                         WHERE state IN ('arbiter', 'dispute', 'spot') ORDER BY state LIMIT ?`, [SETTLE_PER_CYCLE]);
  for (const c of todo) {
    let truth = null;
    try { truth = fight(c); } catch (e) { console.error(`claims: ${c.identity.slice(0, 8)} did not fight — ${e.message}`); }
    if (truth === null) continue;
    const ours = c.engine === engine;
    const state = truth === c.score ? "verified" : "rejected";
    // WHOEVER THE SERVER DISAGREES WITH WAS WRONG. A dispute names a verifier
    // who sent a different number; a spot check, one who agreed with a wrong one.
    if (ours && c.verifier && ((c.state === "dispute" && truth !== c.disputed) || (c.state === "spot" && truth !== c.score))) {
      await ban(c.verifier);
    }
    await d1("UPDATE claims SET state = ? WHERE identity = ? AND ruler = ? AND mode = ?", [state, c.identity, c.ruler, c.mode]);
    console.error(`claims: settled ${c.state} ${c.identity.slice(0, 8)} ${c.ruler}/${c.mode} — ${state}`);
  }
}

if (mode === "file") await file();
else if (mode === "settle") await settle();
else { console.error("usage: live_claims.mjs file|settle <work-dir> [bin-dir]"); process.exit(2); }
