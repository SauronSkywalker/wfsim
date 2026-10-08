// THE CONTRIBUTION RANKING (worker/contribution.js), with no network — docs/BOARD.md
// §"Contribution". A signed-in browser claims its device and the last claim owns
// it; an account's points are its devices' credited work, a refused device's
// counting for nothing; the ranking lists only the accounts that chose to be on
// it, most first; nothing works signed out or from another site; deleting the
// account releases its devices.
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
  return { raw: db, prepare: (sql) => stmt(sql) };
};
const accounts = d1("accounts.sql"), library = d1("schema.sql");
const env = { ACCOUNTS: accounts, LIBRARY: library, AUTH_SECRET: "x" };

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
const call = async (path, { cookie = "", body, method = body ? "POST" : "GET", origin } = {}) => {
  const headers = { cookie, ...(body ? { "content-type": "application/json" } : {}), ...(origin ? { origin } : {}) };
  const r = await contributionRoute(new Request(`https://wfsim.app${path}`,
    { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env, path);
  return r && { status: r.status, ...(await r.json()) };
};
const claim = (cookie, verifier) => call("/api/account/devices/claim", { cookie, body: { verifier } });
const mine = (cookie) => call("/api/account/devices", { cookie });
const show = (cookie, shown) => call("/api/account/contribution", { cookie, body: { shown } });
const ranking = async () => (await call("/api/contributors")).contributors;

const ann = await person("acct-ann", "ann", "Ann"), bob = await person("acct-bob", "bob"), cy = await person("acct-cy", "cy");
const X = "x".repeat(24), Y = "y".repeat(24), Z = "z".repeat(24), W = "w".repeat(24);
device(X, 5 * POINT); device(Y, 3 * POINT); device(Z, 9 * POINT); device(W, 50 * POINT, 1);

check("a path that is not one is left to the next route", (await contributionRoute(
  new Request("https://wfsim.app/api/account"), env, "/api/account")) === null);
check("signed out, nothing is claimed", (await claim("", X)).status === 401);
check("a claim from another site is refused", (await call("/api/account/devices/claim",
  { cookie: ann, body: { verifier: X }, origin: "https://evil.example" })).status === 403);
check("a malformed device is refused", (await claim(ann, "nope")).reason === "bad_device");

await claim(ann, X); await claim(ann, Y);
const a = await mine(ann);
check("an account's points are its devices' credited work", a.points === 8 && a.devices.length === 2, JSON.stringify(a));
check("...and its page never sees a device's whole id", a.devices.every((d) => d.id.length === 6));
check("an account is off the ranking until it chooses", a.shown === false && (await ranking()).length === 0);

await show(ann, true);
check("shown, it is on the ranking by its display name", JSON.stringify(await ranking()) ===
  JSON.stringify([{ name: "Ann", username: "ann", points: 8 }]), JSON.stringify(await ranking()));

await claim(bob, Y);
check("the last claim owns a device, and its work goes with it", (await mine(ann)).points === 5 && (await mine(bob)).points === 3);

await claim(cy, Z); await claim(cy, W); await show(cy, true); await show(bob, true);
const r = await ranking();
check("the ranking is most first, a refused device counting for nothing",
  r.map((e) => `${e.username}:${e.points}`).join(" ") === "cy:9 ann:5 bob:3", JSON.stringify(r));
check("...and an account with no username shows its username", r.find((e) => e.username === "bob").name === "bob");

await show(ann, false);
check("hidden again, it leaves the ranking", !(await ranking()).some((e) => e.username === "ann"));

accounts.raw.prepare("DELETE FROM accounts WHERE id = 'acct-cy'").run();
check("deleting an account releases its devices and its place",
  !accounts.raw.prepare("SELECT 1 FROM devices WHERE account = 'acct-cy'").get()
  && !(await ranking()).some((e) => e.username === "cy"));

console.log(failures ? `\n${failures} failed` : "\nan account's points are the work its devices were credited");
process.exitCode = failures ? 1 : 0;
