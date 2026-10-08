// THE CONTRIBUTION RANKING (worker/contribution.js), with no network — docs/BOARD.md
// §"Contribution". A signed-in browser claims its device and the last claim owns
// it; an account's points are its devices' credited work, a refused device's
// counting for nothing; the ranking lists every account with a claimed device,
// most first, by all their points or the last thirty days', ANONYMOUS until
// the account agrees to show its name; a browser can
// ask what it earned by its own id; nothing works signed out or from another
// site; deleting the account releases its devices.
//   node scripts/check_contribution.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { contributionRoute } from "../worker/contribution.js";
import { sha256 } from "../worker/accounts.js";

let failures = 0;
const check = (what, ok, detail = "") => {
  console.log(`  ${ok ? "ok " : "FAIL"}  ${what}${ok || !detail ? "" : `   ${detail}`}`);
  if (!ok) failures++;
};

const d1 = (file) => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL(`../worker/${file}`, import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { raw: db, prepare: (sql) => stmt(sql), batch: (stmts) => Promise.all(stmts.map((s) => s.all())) };
};
const accounts = d1("accounts.sql"), library = d1("schema.sql");
// THE PAID HALF, stubbed: it proves a mark for Ann and Cy, and records whom it was asked about.
const askedCloud = [];
const CLOUD = { fetch: async (req) => {
  const { accounts: ids } = await req.json();
  askedCloud.push(...ids);
  const held = { "acct-ann": { tier: "member", titles: [] }, "acct-cy": { tier: "patron", titles: [] } };
  return new Response(JSON.stringify({ ok: true, marks: Object.fromEntries(ids.filter((i) => held[i]).map((i) => [i, held[i]])) }));
} };
const env = { ACCOUNTS: accounts, LIBRARY: library, AUTH_SECRET: "x", CLOUD };

const POINT = 1e9;
const person = async (id, username, display = null) => {
  accounts.raw.prepare("INSERT INTO accounts (id, created_at, username, display_name) VALUES (?, '2026-01-01', ?, ?)")
    .run(id, username, display);
  accounts.raw.prepare("INSERT INTO sessions (token_hash, account, expires_at) VALUES (?, ?, '2999-01-01')")
    .run(await sha256(`token-${id}`), id);
  return `wfsim_session=token-${id}`;
};
const device = (id, work, banned = 0) =>
  library.raw.prepare("INSERT INTO verifiers (id, seen, work, banned) VALUES (?, '2026-01-01', ?, ?)").run(id, work, banned);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const credit = (id, ago, work) =>
  library.raw.prepare("INSERT INTO verifier_days (verifier, day, work) VALUES (?, ?, ?)").run(id, daysAgo(ago), work);
const call = async (path, { cookie = "", body, method = body ? "POST" : "GET", origin } = {}) => {
  const headers = { cookie, ...(body ? { "content-type": "application/json" } : {}), ...(origin ? { origin } : {}) };
  const r = await contributionRoute(new Request(`https://wfsim.app${path}`,
    { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path.split("?")[0]);
  return r && { status: r.status, ...(await r.json()) };
};
const claim = (cookie, verifier) => call("/api/account/devices/claim", { cookie, body: { verifier } });
const mine = (cookie) => call("/api/account/devices", { cookie });
const choose = (cookie, named) => call("/api/account/contribution", { cookie, body: { named } });
const ranking = async (cookie = "", q = "") => (await call(`/api/contributors${q}`, { cookie })).contributors;

const ann = await person("acct-ann", "ann", "Ann"), bob = await person("acct-bob", "bob"), cy = await person("acct-cy", "cy");
const X = "x".repeat(24), Y = "y".repeat(24), Z = "z".repeat(24), W = "w".repeat(24);
device(X, 5 * POINT); device(Y, 3 * POINT); device(Z, 9 * POINT); device(W, 50 * POINT, 1);
// X earned 2 today and 3 forty days ago; Y all 3 a week ago; Z 9 long ago; W
// 50 yesterday, and is refused.
credit(X, 0, 2 * POINT); credit(X, 40, 3 * POINT); credit(Y, 7, 3 * POINT); credit(Z, 60, 9 * POINT); credit(W, 1, 50 * POINT);
const points = (verifier) => call("/api/board/points", { body: { verifier } });

check("a path that is not one is left to the next route", (await contributionRoute(
  new Request("https://wfsim.app/api/account"), env, "/api/account")) === null);
check("signed out, nothing is claimed", (await claim("", X)).status === 401);
check("a claim from another site is refused", (await call("/api/account/devices/claim",
  { cookie: ann, body: { verifier: X }, origin: "https://evil.example" })).status === 403);
check("a malformed device is refused", (await claim(ann, "nope")).reason === "bad_device");

await claim(ann, X); await claim(ann, Y);
const a = await mine(ann);
check("an account's points are its devices' credited work", a.points === 8 && a.devices.length === 2, JSON.stringify(a));
check("...and its last thirty days, the days before them left out", a.recent === 5, JSON.stringify(a));
check("...and its page never sees a device's whole id", a.devices.every((d) => d.id.length === 6));
check("an account is on the ranking once it claims a device, ANONYMOUS and not yet asked",
  a.named === false && a.decided === false && JSON.stringify(await ranking()) === JSON.stringify([{ name: null, points: 8, recent: 5 }]),
  JSON.stringify(await ranking()));

await claim(bob, Y);
check("the last claim owns a device, and its work goes with it", (await mine(ann)).points === 5 && (await mine(bob)).points === 3);

await claim(cy, Z); await claim(cy, W);
const r = await ranking();
check("the ranking is most first, a refused device counting for nothing",
  r.map((e) => e.points).join(" ") === "9 5 3", JSON.stringify(r));
check("...and an anonymous row carries no name, handle or mark, and the paid half is not asked about it",
  r.every((e) => e.name === null && !("username" in e) && !("mark" in e)) && askedCloud.length === 0,
  `${JSON.stringify(r)} ${askedCloud}`);
check("the reader's own row is marked to them, and to nobody else",
  JSON.stringify((await ranking(ann)).map((e) => !!e.you)) === "[false,true,false]" && !(await ranking()).some((e) => e.you));

await choose(ann, true); await choose(bob, true); await choose(cy, false);
const named = await ranking();
check("agreed, a row shows the display name alone, or the username when there is none",
  JSON.stringify(named.map((e) => e.name)) === JSON.stringify([null, "Ann", "bob"]) && named.every((e) => !("username" in e)),
  JSON.stringify(named));
check("...a named row carries the mark the paid half proves, and only named rows were asked about",
  JSON.stringify(named[1].mark) === JSON.stringify({ tier: "member", titles: [] }) && !("mark" in named[0]) && !("mark" in named[2])
  && !askedCloud.includes("acct-cy"), `${JSON.stringify(named)} ${askedCloud}`);
check("...and a no is kept, so it is not asked again", (await mine(cy)).decided === true && (await mine(cy)).named === false);
await choose(ann, false);
check("taken back, the name leaves the ranking", !(await ranking()).some((e) => e.name === "Ann") && (await mine(ann)).named === false);
check("an answer that is not one is refused", (await call("/api/account/contribution", { cookie: ann, body: { named: "yes" } })).reason === "bad_choice");

const recent = await ranking("", "?period=recent");
check("the last thirty days rank by those days, and an account with none there is not on it",
  recent.map((e) => `${e.name}:${e.recent}`).join(" ") === "bob:3 null:2", JSON.stringify(recent));

check("a browser asks what it earned by its own id, and is told whether it is claimed",
  JSON.stringify(await points(X)) === JSON.stringify({ status: 200, ok: true, points: 5, recent: 2, claimed: true }),
  JSON.stringify(await points(X)));
check("...an id nobody claimed or credited earns nothing", (await points("q".repeat(24))).points === 0
  && (await points("q".repeat(24))).claimed === false);
check("...a refused one, nothing either", (await points(W)).points === 0 && (await points(W)).recent === 0);
check("...and a malformed id is refused", (await points("nope")).reason === "bad_device");

accounts.raw.prepare("DELETE FROM accounts WHERE id = 'acct-cy'").run();
check("deleting an account releases its devices, its place and its answer",
  !accounts.raw.prepare("SELECT 1 FROM devices WHERE account = 'acct-cy'").get()
  && !accounts.raw.prepare("SELECT 1 FROM contribution_choice WHERE account = 'acct-cy'").get()
  && !(await ranking()).some((e) => e.points === 9));

console.log(failures ? `\n${failures} failed` : "\nan account's points are the work its devices were credited");
process.exitCode = failures ? 1 : 0;
