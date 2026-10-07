// CROSS-VERIFICATION'S DOOR (worker/verify.js), with no network: a lease hands
// out a build and never its number, to a client of the claim's own release and
// one lease at a time; equal bits make a fact and anything else a dispute; a
// fact already held stands; the answer never says whether the client agreed.
//   node scripts/check_board_verify.mjs
import { verifyRoute, LEASE_MS } from "../worker/verify.js";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (what, ok, detail = "") => {
  console.log(`  ${ok ? "ok " : "FAIL"}  ${what}${ok || !detail ? "" : `   ${detail}`}`);
  if (!ok) failures++;
};

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  each: async () => (/^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
});
const env = { LIBRARY: { prepare: (sql) => stmt(sql), batch: async (ss) => Promise.all(ss.map((x) => x.each())) } };
const call = async (path, body) => {
  const r = await verifyRoute(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) }), env, path);
  return r.json();
};
const claim = (identity, score, engine = "r1", state = "open") => db.prepare(
  `INSERT INTO claims (identity, ruler, mode, record, metric, score, engine, state, at)
   VALUES (?, 'standard_single_target', 'base', ?, 'kpm', ?, ?, ?, '2026-10-07')`)
  .run(identity, JSON.stringify({ weapon: "braton_prime", mods: ["serration"] }), score, engine, state);
const row = (identity) => db.prepare("SELECT * FROM claims WHERE identity = ?").get(identity);
const fact = (identity) => db.prepare("SELECT * FROM scores WHERE identity = ?").get(identity);
const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);
const SCORE = 1.1070976928071055;
Math.random = () => 0.5;  // no spot check unless a test asks for one

claim("one", SCORE);
db.prepare("INSERT INTO queue (batch, build_id, ruler, mode) VALUES ('arrivals', 'one', 'standard_single_target', 'base')").run();

check("a client of another release is handed nothing",
  (await call("/api/board/work", { verifier: B, engine: "r2" })).work === null);
const got = await call("/api/board/work", { verifier: A, engine: "r1" });
check("a client of the claim's release is handed its build", got.work && got.work.record.weapon === "braton_prime", JSON.stringify(got));
check("...and NOT the number to agree with", got.work && !JSON.stringify(got.work).includes(String(SCORE)));
check("...and one lease at a time", (await call("/api/board/work", { verifier: A, engine: "r1" })).work === null);

const stranger = await call("/api/board/verify", { lease: got.work.lease, verifier: B, score: SCORE });
check("another client's answer on that lease is ignored", stranger.ok && row("one").state === "leased");

const agreed = await call("/api/board/verify", { lease: got.work.lease, verifier: A, score: SCORE });
check("equal bits make a fact", agreed.ok && fact("one") && fact("one").score === SCORE, JSON.stringify(fact("one")));
check("...measured by the release, verified", fact("one") && fact("one").measured_by === "verified:r1");
check("...the claim is verified by that client", row("one").state === "verified" && row("one").verifier === A);
check("...the queue no longer owes the row",
  !db.prepare("SELECT 1 FROM queue WHERE build_id = 'one'").get());
check("...and the client is credited",
  db.prepare("SELECT agreed FROM verifiers WHERE id = ?").get(A).agreed === 1);

claim("two", SCORE);
const w2 = await call("/api/board/work", { verifier: B, engine: "r1" });
const disagreed = await call("/api/board/verify", { lease: w2.work.lease, verifier: B, score: SCORE * 2 });
check("a different number makes a dispute, and no fact", row("two").state === "dispute" && !fact("two") && row("two").disputed === SCORE * 2);
check("...and the answer is the same one an agreement gets", JSON.stringify(disagreed) === JSON.stringify(agreed));

claim("three", SCORE);
db.prepare(`INSERT INTO scores (identity, ruler, mode, measured_by, score, metric, cost_seconds, started_at, finished_at)
  VALUES ('three', 'standard_single_target', 'base', '4f892ee6e4', 2.5, 'kpm', 1, 'x', 'x')`).run();
check("a row the scorer already measured is never handed out",
  (await call("/api/board/work", { verifier: C, engine: "r1" })).work === null);

claim("four", SCORE, "r1", "arbiter");
check("a top-ten row is the server's, never a client's",
  (await call("/api/board/work", { verifier: C, engine: "r1" })).work === null);

claim("five", SCORE);
const w5 = await call("/api/board/work", { verifier: C, engine: "r1" });
db.prepare("UPDATE claims SET lease_until = ? WHERE identity = 'five'").run(Date.now() - 1);
check("an expired lease is answered by nobody", (await call("/api/board/verify", { lease: w5.work.lease, verifier: C, score: SCORE })).ok
  && row("five").state === "leased" && !fact("five"));
const D = "d".repeat(24);
const w5b = await call("/api/board/work", { verifier: D, engine: "r1" });
check("...and goes to the next client", w5b.work && row("five").leased_to === D);
Math.random = () => 0;
await call("/api/board/verify", { lease: w5b.work.lease, verifier: D, score: SCORE });
check("an agreement the dice pick is a spot check: a fact now, recomputed by the server",
  row("five").state === "spot" && fact("five") && fact("five").score === SCORE);
Math.random = () => 0.5;

db.prepare("UPDATE verifiers SET banned = 1 WHERE id = ?").run(D);
claim("six", SCORE);
check("a banned client is handed nothing", (await call("/api/board/work", { verifier: D, engine: "r1" })).work === null);
check("a malformed id is refused", (await verifyRoute(new Request("https://x/api/board/work",
  { method: "POST", body: JSON.stringify({ verifier: "x", engine: "r1" }) }), env, "/api/board/work")).status === 400);
check("a lease is said to be held for longer than the slowest row", LEASE_MS >= 20 * 60_000);

console.log(failures ? `\n${failures} failed` : "\na number reaches the board only when a second client measured the same bits");
process.exitCode = failures ? 1 : 0;
