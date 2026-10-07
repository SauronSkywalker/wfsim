// COMPUTE ORDERS' DOOR (worker/verify.js), with no network: an order is handed
// out as a build and never a number; its first result waits for the server's
// rank; a second must come from another client of the same engine; equal bits
// make a fact and settle the queue row, anything else is a dispute, and the
// answer never says which; a row nobody owes, a top-ten row, a live lease and a
// banned client get nothing.
//   node scripts/check_board_verify.mjs
import { verifyRoute, LEASE_MS, PROTOCOL } from "../worker/verify.js";
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
const order = (identity, state = "todo", extra = {}) => {
  db.prepare(`INSERT INTO orders (identity, ruler, mode, record, state, slot, at) VALUES (?, 'standard_single_target', 'base', ?, ?, ?, 0)`)
    .run(identity, JSON.stringify({ weapon: "braton_prime", mods: ["serration"] }), state, Math.floor(Math.random() * 1e9));
  db.prepare("INSERT INTO queue (batch, build_id, ruler, mode) VALUES ('arrivals', ?, 'standard_single_target', 'base')").run(identity);
  const sets = Object.keys(extra);
  if (sets.length) db.prepare(`UPDATE orders SET ${sets.map((k) => `${k} = ?`).join(", ")} WHERE identity = ?`).run(...Object.values(extra), identity);
};
const row = (identity) => db.prepare("SELECT * FROM orders WHERE identity = ?").get(identity);
const fact = (identity) => db.prepare("SELECT * FROM scores WHERE identity = ?").get(identity);
const only = (identity) => db.prepare("UPDATE orders SET slot = CASE WHEN identity = ? THEN 1 ELSE slot END").run(identity);
const work = (v, engine = "e1", protocol = PROTOCOL) => call("/api/board/work", { verifier: v, engine, protocol });
const answer = (w, v, score, metric = "kpm", engine = "e1") => call("/api/board/verify", { lease: w.lease, verifier: v, engine, score, metric });
const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24), D = "d".repeat(24);
const SCORE = 1.1070976928071055;
Math.random = () => 0.5;  // no spot check unless a test asks for one

order("one");
check("a page that cannot fill an order is handed none", (await work(A, "e1", null)).work === null && row("one").lease === null);
const first = await work(A);
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
check("...but to another client of its engine", second.work && second.work.record.weapon === "braton_prime");
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

console.log(failures ? `\n${failures} failed` : "\nan order reaches the board when two clients measured the same bits");
process.exitCode = failures ? 1 : 0;
