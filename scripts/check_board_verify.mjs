// COMPUTE ORDERS' DOOR (worker/verify.js), with no network: an order is handed
// out as a build and never a number; its first result waits for the server's
// rank; each further one must come from another client of the same engine;
// CLIENTS_PER_FACT equal results make a fact naming every client and settle the
// queue row, anything else is a dispute, and the
// answer never says which; a row nobody owes, a top-ten row, a live lease and a
// banned client get nothing; only the engine `release.json` names works, and
// what each fight cost its client is kept beside it. Equal includes the WORK,
// which a fact credits to every client that measured it; and a further result
// never comes from a device of the same owner (docs/BOARD.md §"Contribution").
// A scorer run's claim takes the old rows no client holds, and no client is
// handed one until its release (scripts/fetch_queue.sh).
//   node scripts/check_board_verify.mjs
import { verifyRoute, LEASE_MS, PROTOCOL } from "../worker/verify.js";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let failures = 0;
const check = (what, ok, detail = "") => {
  console.log(`  ${ok ? "ok " : "FAIL"}  ${what}${ok || !detail ? "" : `   ${detail}`}`);
  if (!ok) failures++;
};

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
const accounts = new DatabaseSync(":memory:");
accounts.exec(readFileSync(new URL("../worker/accounts.sql", import.meta.url), "utf8"));
const stmtIn = (base) => function stmt(sql, args = []) {
  return {
    bind: (...a) => stmt(sql, a),
    first: async () => base.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: base.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(base.prepare(sql).run(...args).changes) } }),
  };
};
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  each: async () => (/^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...args) } : { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
});
/// THE SITE'S `release.json`, naming the engine it serves.
const site = (engine) => ({ fetch: async () => new Response(JSON.stringify({ engine })) });
const env = { LIBRARY: { prepare: (sql) => stmt(sql), batch: async (ss) => Promise.all(ss.map((x) => x.each())) }, ASSETS: site("e1"),
  ACCOUNTS: { prepare: (sql) => stmtIn(accounts)(sql) } };
const WORK = 7_000_000_000;
const callIn = async (e, path, body) =>
  (await verifyRoute(new Request(`https://x${path}`, { method: "POST", body: JSON.stringify(body) }), e, path)).json();
const call = (path, body) => callIn(env, path, body);
const order = (identity, state = "todo", extra = {}) => {
  db.prepare(`INSERT INTO orders (identity, ruler, mode, record, state, slot, at) VALUES (?, 'standard_single_target', 'base', ?, ?, ?, 0)`)
    .run(identity, JSON.stringify({ weapon: "braton_prime", mods: ["serration"] }), state, Math.floor(Math.random() * 1e9));
  db.prepare("INSERT INTO queue (batch, build_id, ruler, mode) VALUES ('arrivals', ?, 'standard_single_target', 'base')").run(identity);
  if (extra.score !== undefined && extra.work === undefined) extra = { ...extra, work: WORK };
  const sets = Object.keys(extra);
  if (sets.length) db.prepare(`UPDATE orders SET ${sets.map((k) => `${k} = ?`).join(", ")} WHERE identity = ?`).run(...Object.values(extra), identity);
};
const row = (identity) => db.prepare("SELECT * FROM orders WHERE identity = ?").get(identity);
const fact = (identity) => db.prepare("SELECT * FROM scores WHERE identity = ?").get(identity);
const only = (identity) => db.prepare("UPDATE orders SET slot = CASE WHEN identity = ? THEN 1 ELSE slot END").run(identity);
const YES = { v: 1, at: "2026-10-08T08:00:00.000Z" };
const work = (v, engine = "e1", protocol = PROTOCOL, consent = YES) => call("/api/board/work", { verifier: v, engine, protocol, consent });
const answer = (w, v, score, metric = "kpm", engine = "e1", compute_ms = 1000, work = WORK) =>
  call("/api/board/verify", { lease: w.lease, verifier: v, engine, score, metric, work, compute_ms });
const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24), D = "d".repeat(24);
const SCORE = 1.1070976928071055;
Math.random = () => 0.5;  // no spot check unless a test asks for one

order("one");
check("a page that cannot fill an order is handed none", (await work(A, "e1", null)).work === null && row("one").lease === null);
check("a computer that never said yes is handed nothing", (await work(A, "e1", PROTOCOL, null)).work === null
  && (await work(A, "e1", PROTOCOL, { v: 1, at: "yesterday" })).work === null);
const first = await work(A);
check("...and the yes it sent is kept on its row, the statement and when",
  JSON.stringify(db.prepare("SELECT consent_v AS v, consent_at AS at FROM verifiers WHERE id = ?").get(A)) === JSON.stringify(YES));
check("an order is handed out as its build", first.work && first.work.record.weapon === "braton_prime", JSON.stringify(first));
check("...one lease at a time", (await work(A)).work === null);
await answer(first.work, A, SCORE);
check("the first result makes it fresh, kept with who measured it and on which engine",
  row("one").state === "fresh" && row("one").score === SCORE && row("one").produced_by === A && row("one").engine === "e1");
check("...and no fact yet", !fact("one"));
check("a fresh order waits for the server's rank and is handed to nobody", (await work(B)).work === null);

db.prepare("UPDATE orders SET state = 'open' WHERE identity = 'one'").run();
check("an open order is never handed back to the client that measured it", (await work(A)).work === null);
check("...nor to a client of another engine", (await work(C, "e2")).work === null);
const second = await work(B);
check("...but to another client of its engine", second.work && second.work.record.weapon === "braton_prime" && !second.stale);
check("...and NOT with the number to agree with", second.work && !JSON.stringify(second.work).includes(String(SCORE)));
const agreed = await answer(second.work, B, SCORE);
check("equal bits make a fact", fact("one") && fact("one").score === SCORE && fact("one").measured_by === "verified:e1", JSON.stringify(fact("one")));
check("...the order is verified by the second client", row("one").state === "verified" && row("one").verifier === B);
check("...and the queue no longer owes the row", !db.prepare("SELECT 1 FROM queue WHERE build_id = 'one'").get());

order("two", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: A });
only("two");
const w2 = await work(C);
const disagreed = await answer(w2.work, C, SCORE * 2);
check("a different number makes a dispute, and no fact", row("two").state === "dispute" && !fact("two") && row("two").disputed === SCORE * 2);
check("...and the answer is the same one an agreement gets", JSON.stringify(disagreed) === JSON.stringify(agreed));

order("three", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: A });
only("three");
const w3 = await work(D);
await answer(w3.work, D, SCORE, "dps");
check("the same number in another metric is a dispute", row("three").state === "dispute");

order("four");
db.prepare("DELETE FROM queue WHERE build_id = 'four'").run();
only("four");
check("an order nobody owes any more is handed to nobody", (await work("e".repeat(24))).work === null);
check("...and is settled where it was found", row("four").state === "settled");

order("five", "arbiter", { score: SCORE, metric: "kpm", engine: "e1", produced_by: A });
only("five");
check("a top-ten order is the server's, never a client's", (await work("f".repeat(24))).work === null);

order("six");
only("six");
const G = "g".repeat(24), H = "h".repeat(24);
const w6 = await work(G);
db.prepare("UPDATE orders SET lease_until = ? WHERE identity = 'six'").run(Date.now() - 1);
await answer(w6.work, G, SCORE);
check("an answer on an expired lease is nobody's", row("six").state === "todo" && row("six").score === null);
const w6b = await work(H);
check("...and the order goes to the next client", w6b.work && row("six").leased_to === H);

order("seven", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: A });
only("seven");
const I = "i".repeat(24);
const w7 = await work(I);
Math.random = () => 0;
await answer(w7.work, I, SCORE);
check("an agreement the dice pick is a spot check: a fact now, recomputed by the server",
  row("seven").state === "spot" && fact("seven") && fact("seven").score === SCORE);
Math.random = () => 0.5;

const J = "j".repeat(24);
order("eight");
await work(J);
db.prepare("UPDATE verifiers SET banned = 1 WHERE id = ?").run(J);
db.prepare("UPDATE orders SET lease = NULL, lease_until = NULL, leased_to = NULL WHERE identity = 'eight'").run();
check("a banned client is handed nothing", (await work(J)).work === null);
const seen = db.prepare("SELECT seen FROM verifiers WHERE id = ?").get(A).seen;
check("a client is written once a day, not once a poll", seen === new Date().toISOString().slice(0, 10)
  && db.prepare("SELECT COUNT(*) AS n FROM verifiers WHERE id = ?").get(A).n === 1);
check("a malformed id is refused", (await verifyRoute(new Request("https://x/api/board/work",
  { method: "POST", body: JSON.stringify({ verifier: "x", engine: "e1" }) }), env, "/api/board/work")).status === 400);
check("a lease is held for longer than the slowest row", LEASE_MS >= 20 * 60_000);

check("a fact names every client that measured it, first to last", row("one").clients === `${A},${B}`, row("one").clients);

// CLIENTS_PER_FACT: how many different clients must send the same bits.
const callWith = async (n, path, body) => (await verifyRoute(new Request(`https://x${path}`,
  { method: "POST", body: JSON.stringify(body) }), { ...env, CLIENTS_PER_FACT: n }, path)).json();
const workWith = (n, v) => callWith(n, "/api/board/work", { verifier: v, engine: "e1", protocol: PROTOCOL, consent: YES });
const answerWith = (n, w, v) => callWith(n, "/api/board/verify", { lease: w.lease, verifier: v, engine: "e1", score: SCORE, metric: "kpm", work: WORK });
const K = "k".repeat(24), L = "l".repeat(24), M = "m".repeat(24), N = "n".repeat(24);

db.prepare("UPDATE orders SET state = 'settled'").run();  // the orders above are not these checks
order("solo");
only("solo");
await answerWith(1, await workWith(1, K).then((r) => r.work), K);
check("with one client a fact, the first result is the fact", fact("solo") && row("solo").clients === K && row("solo").state === "verified");

order("trio", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: L, clients: L });
only("trio");
await answerWith(3, (await workWith(3, M)).work, M);
check("with three, a second agreement is not yet a fact", !fact("trio") && row("trio").state === "open" && row("trio").clients === `${L},${M}`);
check("...and the order goes to neither client again", (await workWith(3, L)).work === null && (await workWith(3, M)).work === null);
await answerWith(3, (await workWith(3, N)).work, N);
check("...the third makes it", fact("trio") && row("trio").clients === `${L},${M},${N}` && row("trio").verifier === N);

// THE ENGINE LOCK, and what a fight cost.
db.prepare("UPDATE orders SET state = 'settled'").run();
order("lock");
only("lock");
const P = "p".repeat(24), Q = "q".repeat(24);
check("a tab of an engine the site does not serve is handed nothing", (await work("o".repeat(24), "e0")).work === null);
check("...and is told it is stale, so a machine left computing reloads", (await work("o".repeat(24), "e0")).stale === true
  && (await work("o".repeat(24), "e1", PROTOCOL - 1)).stale === true);
const blind = { ...env, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } };
check("...and nobody is while the served engine cannot be read",
  (await callIn(blind, "/api/board/work", { verifier: P, engine: "e1", protocol: PROTOCOL, consent: YES })).work === null);
await answer((await work(P)).work, P, SCORE, "kpm", "e0");
check("an answer from another engine is dropped, and the order handed out again",
  row("lock").state === "todo" && row("lock").lease === null && row("lock").score === null);
await answer((await work(P)).work, P, SCORE, "kpm", "e1", 4321);
check("what the fight cost is kept beside the client that fought it",
  row("lock").clients_compute_ms === "4321"
  && db.prepare("SELECT compute_ms FROM verifiers WHERE id = ?").get(P).compute_ms === 4321);
check("...and both agreeing clients' costs are kept on a fact, in order", row("one").clients_compute_ms === "1000,1000",
  row("one").clients_compute_ms);
db.prepare("UPDATE orders SET state = 'open' WHERE identity = 'lock'").run();
await callIn({ ...env, ASSETS: site("e9") }, "/api/board/work", { verifier: Q, engine: "e9", protocol: PROTOCOL, consent: YES });
check("once the site serves a new engine, an open result of the old one is opened again from nothing",
  row("lock").state === "todo" && row("lock").clients === "" && row("lock").score === null && row("lock").engine === "");

// THE WORK, and the owners.
const credited = (v) => db.prepare("SELECT work FROM verifiers WHERE id = ?").get(v).work;
check("a fact credits its work to every client that measured it, once a fact",
  credited(B) === WORK && credited(I) === WORK && credited(A) === 2 * WORK, `${credited(A)} ${credited(B)} ${credited(I)}`);
const creditedToday = (v) => db.prepare("SELECT SUM(work) AS w FROM verifier_days WHERE verifier = ? AND day = ?")
  .get(v, new Date().toISOString().slice(0, 10)).w;
check("...and the same work under the day it was credited, for the ranking's last thirty days",
  creditedToday(A) === 2 * WORK && creditedToday(B) === WORK && creditedToday(I) === WORK,
  `${creditedToday(A)} ${creditedToday(B)} ${creditedToday(I)}`);
check("...and a disputed one to nobody", credited(C) === 0 && credited(D) === 0);
db.prepare("UPDATE orders SET state = 'settled'").run();
order("worked", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: A, clients: A });
only("worked");
const R = "r".repeat(24);
await answer((await work(R)).work, R, SCORE, "kpm", "e1", 1000, WORK + 1);
check("the same score with other work is a dispute", row("worked").state === "dispute" && !fact("worked"));
check("a result that does not say its work is refused", (await verifyRoute(new Request("https://x/api/board/verify",
  { method: "POST", body: JSON.stringify({ lease: "a".repeat(32), verifier: R, engine: "e1", score: SCORE, metric: "kpm" }) }),
env, "/api/board/verify")).status === 400);

const S = "s".repeat(24), T = "t".repeat(24), U = "u".repeat(24), V = "v".repeat(24);
for (const [id, name] of [["acct1", "one"], ["acct2", "two"]]) {
  accounts.prepare("INSERT INTO accounts (id, created_at, username) VALUES (?, '2026-01-01', ?)").run(id, `owner_${name}`);
}
const own = (v, a) => accounts.prepare("INSERT INTO devices (verifier, account, claimed_at) VALUES (?, ?, '2026-01-01')").run(v, a);
own(S, "acct1"); own(T, "acct1"); own(U, "acct2");
db.prepare("UPDATE orders SET state = 'settled'").run();
order("owned", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: S, clients: S });
only("owned");
check("a further result never comes from another device of the same owner", (await work(T)).work === null);
const wu = await work(U);
check("...but from another owner's", wu.work && row("owned").leased_to === U);
db.prepare("UPDATE orders SET lease = NULL, lease_until = NULL, leased_to = NULL WHERE identity = 'owned'").run();
check("...or from a device nobody claimed", (await work(V)).work && row("owned").leased_to === V);

// THE CLAIM (scripts/fetch_queue.sh): an old order nobody holds is the scorer
// run's, and while it is no client is handed it; one a client holds stays its.
const body = (...a) => JSON.parse(execFileSync("bash", ["scripts/fetch_queue.sh", "--body", ...a],
  { env: { ...process.env, HOLD_SECONDS: "14400" }, encoding: "utf8" }));
const sql = (b) => db.prepare(b.sql.replaceAll("unixepoch()", String(Math.floor(Date.now() / 1000))));
const W = "w".repeat(24), X = "x".repeat(24), Y = "y".repeat(24);
db.prepare("UPDATE orders SET state = 'settled'").run();
db.prepare("DELETE FROM queue").run();
db.prepare("INSERT INTO batches (id, at, why, total) VALUES ('arrivals', '2026-01-01', 'check', 4)").run();
order("old");
order("oldopen", "open", { score: SCORE, metric: "kpm", engine: "e1", produced_by: R, clients: R });
order("oldheld", "todo", { leased_to: X, lease: "b".repeat(32), lease_until: Date.now() + LEASE_MS });
order("young");
db.prepare("UPDATE orders SET at = ? WHERE identity = 'young'").run(Date.now() - 60_000);
sql(body("claim")).run(...body("claim").params);
check("a run claims every old order no client holds, open or not",
  row("old").state === "scoring:todo" && row("oldopen").state === "scoring:open", `${row("old").state} ${row("oldopen").state}`);
check("...and leaves a held one and a young one to the clients", row("oldheld").state === "todo" && row("young").state === "todo");
const page = body("page", "100", "0");
const read = sql(page).all(...page.params).map((r) => r.build_id).sort();
check("...and reads exactly what it claimed", JSON.stringify(read) === JSON.stringify(["old", "oldopen"]), JSON.stringify(read));
const wy = await work(W);
check("no client is handed a claimed order", wy.work && row("young").leased_to === W && (await work(Y)).work === null);
sql(body("release")).run(...body("release").params);
check("the release hands what the run left back as it was", row("old").state === "todo" && row("oldopen").state === "open");

console.log(failures ? `\n${failures} failed` : "\nan order reaches the board when CLIENTS_PER_FACT clients measured the same bits");
process.exitCode = failures ? 1 : 0;
