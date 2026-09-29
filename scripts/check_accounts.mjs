// THE ACCOUNT RULES, RUN AGAINST THE REAL SCHEMA — docs/ACCOUNTS.md.
//
// `worker/accounts.sql` in node's own SQLite with foreign keys on, as D1 runs
// it, behind a stub of the D1 surface the worker touches; the three providers
// and the mailer are stubbed at `fetch` and `env.EMAIL`. What it holds is the
// model the owner fixed: one UUID, four slots, at most one of each; never a
// merge; the UUID gone the moment its last slot empties, whoever empties it.
// No network, no browser.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { accountRoute } from "../worker/accounts.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failed++;
};

// ---- D1, as far as the worker uses it ------------------------------------------

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(resolve(ROOT, "worker/accounts.sql"), "utf8"));
  db.exec(readFileSync(resolve(ROOT, "worker/billing.sql"), "utf8"));
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) {
      db.exec("BEGIN");
      try { for (const s of list) db.prepare(s.sql).run(...s.args); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

// ---- three providers and a mailbox ------------------------------------------------

// WHO EACH CODE BELONGS TO: a test hands a provider a code, and the stub
// answers the token and user calls as that person.
const people = new Map();
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (/oauth2\.googleapis|discord\.com\/api\/oauth2|github\.com\/login\/oauth/.test(u)) {
    const code = new URLSearchParams(String(init.body)).get("code");
    return new Response(JSON.stringify(people.has(code) ? { access_token: code } : { error: "bad" }));
  }
  const who = people.get((init.headers || {}).authorization?.slice(7));
  if (/openidconnect/.test(u)) return new Response(JSON.stringify({ sub: who.id, email: who.name }));
  if (/discord\.com\/api\/users/.test(u)) return new Response(JSON.stringify({ id: who.id, username: who.name }));
  if (/api\.github\.com\/user/.test(u)) return new Response(JSON.stringify({ id: Number(who.id), login: who.name }));
  throw new Error(`unexpected fetch ${u}`);
};
const mail = [];
const env = {
  ACCOUNTS: d1(),
  AUTH_SECRET: "test-secret",
  EMAIL: { send: async (m) => { mail.push(m); return { messageId: "x" }; } },
  GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs",
  DISCORD_CLIENT_ID: "d", DISCORD_CLIENT_SECRET: "ds",
  GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs",
};
const SITE = "https://wfsim.app";
const PASSWORD = "correct horse battery";

// ---- a browser: a cookie jar and the calls the page makes ----------------------------

function browser() {
  const jar = {};
  const keep = (res) => {
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const [pair, ...attrs] = c.split(";");
      const [k, v] = pair.split("=");
      if (/Max-Age=0/.test(attrs.join(";"))) delete jar[k.trim()]; else jar[k.trim()] = v;
    }
    return res;
  };
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const call = async (method, path, body, headers = {}) => {
    const req = new Request(SITE + path, {
      method, headers: { cookie: cookie(), ...(body ? { "content-type": "application/json", origin: SITE } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return keep(await accountRoute(req, env, new URL(req.url).pathname));
  };
  return {
    jar,
    get: (path) => call("GET", path),
    post: (path, body, headers) => call("POST", path, body, headers),
    async me() { return (await (await call("GET", "/api/account")).json()).account; },
    /// A whole OAuth round trip as `person`, answered at the provider.
    async oauth(provider, person, intent = "login", tamper = null) {
      const code = `code-${Math.random()}`;
      people.set(code, person);
      const start = await call("GET", `/api/auth/${provider}/start?intent=${intent}&return=/weapons/Torid`);
      const state = new URL(start.headers.get("location")).searchParams.get("state");
      const back = await call("GET", `/api/auth/${provider}/callback?code=${code}&state=${tamper || state}`);
      return new URL(back.headers.get("location"));
    },
    /// Register or link an address with a password: the mail, then its code.
    async email(address, purpose = "register", { password = PASSWORD, wrong = false } = {}) {
      const s = await (await call("POST", `/api/auth/email/${purpose}`, { email: address, password })).json();
      if (!s.ok) return s;
      const code = mail.at(-1).subject.slice(0, 6);
      return (await call("POST", "/api/auth/email/verify",
        { email: address, code: wrong ? String((Number(code) + 1) % 1e6).padStart(6, "0") : code })).json();
    },
    login: async (address, password) =>
      (await call("POST", "/api/auth/email/login", { email: address, password })).json(),
    async reset(address, password) {
      const before = mail.length;
      const s = await (await call("POST", "/api/auth/email/reset", { email: address })).json();
      if (!s.ok || mail.length === before) return { ...s, mailed: false };
      return (await call("POST", "/api/auth/email/verify",
        { email: address, code: mail.at(-1).subject.slice(0, 6), password })).json();
    },
  };
}
const count = (sql, ...a) => env.ACCOUNTS.raw.prepare(sql).get(...a).n;

// ---- the rules ---------------------------------------------------------------------------

const a = browser();
const ada = { id: "g-ada", name: "ada@example.com" };
let back = await a.oauth("google", ada);
let me = await a.me();
check("a first sign-in makes an account holding that one slot",
  back.searchParams.get("auth") === "created" && me && me.identities.length === 1 && me.identities[0].provider === "google",
  back + " " + JSON.stringify(me));
check("...and returns to the page it left from", back.pathname === "/weapons/Torid", back);
const adaId = me.id;

back = await browser().oauth("google", ada);
check("the same Google person signs into the same account",
  back.searchParams.get("auth") === "signed_in" && count("SELECT COUNT(*) n FROM accounts") === 1, back);

back = await a.oauth("discord", { id: "d-ada", name: "ada#1" }, "link");
me = await a.me();
check("a second slot links onto the signed-in account",
  back.searchParams.get("auth") === "linked" && me.identities.map((i) => i.provider).join() === "google,discord", JSON.stringify(me));

const b = browser();
await b.oauth("github", { id: "77", name: "bob" });
const bobId = (await b.me()).id;
back = await b.oauth("discord", { id: "d-ada", name: "ada#1" }, "link");
check("an identity on another account is refused, never moved",
  back.searchParams.get("auth_error") === "taken"
    && count("SELECT COUNT(*) n FROM identities WHERE account = ? AND provider = 'discord'", adaId) === 1
    && count("SELECT COUNT(*) n FROM identities WHERE account = ?", bobId) === 1, back);

const sameMail = await browser().email("ada@example.com");
check("an email matching a Google address is its own account — nothing merges by address",
  sameMail.ok && sameMail.outcome === "created" && count("SELECT COUNT(*) n FROM accounts") === 3, JSON.stringify(sameMail));

back = await a.oauth("google", { id: "g-ada-2", name: "ada2@example.com" }, "link");
me = await a.me();
check("a filled slot is replaced, not doubled",
  back.searchParams.get("auth") === "replaced" && me.identities.length === 2
    && count("SELECT COUNT(*) n FROM identities WHERE subject = 'g-ada'") === 0, JSON.stringify(me));

const wrong = await a.email("ada.other@example.com", "link", { wrong: true });
check("a wrong code fills nothing", wrong.ok === false && wrong.reason === "wrong_code"
  && count("SELECT COUNT(*) n FROM identities WHERE provider = 'email' AND account = ?", adaId) === 0, JSON.stringify(wrong));
const tooSoon = await (await a.post("/api/auth/email/link", { email: "ada.other@example.com", password: PASSWORD })).json();
check("a second code inside a minute is refused", tooSoon.reason === "too_soon", JSON.stringify(tooSoon));
env.ACCOUNTS.raw.prepare("UPDATE email_codes SET sent_at = '2000-01-01T00:00:00.000Z'").run();
const linked = await a.email("Ada.Other@Example.com", "link");
check("an address links once its code is right, lowercased", linked.ok && linked.outcome === "linked"
  && count("SELECT COUNT(*) n FROM identities WHERE subject = 'ada.other@example.com' AND account = ?", adaId) === 1,
  JSON.stringify(linked));
check("the mail carries the code and no link", mail.length > 0 && /^\d{6} /.test(mail.at(-1).subject)
  && !/https?:\/\//.test(mail.at(-1).text), JSON.stringify(mail.at(-1)));

// ---- the password: signing in sends no mail -------------------------------------------

const mailed = mail.length;
const pw = await browser().login("ada.other@example.com", PASSWORD);
check("an address and its password sign in to its account, and nothing is mailed",
  pw.ok && pw.outcome === "signed_in" && mail.length === mailed, JSON.stringify(pw));
const badPw = await browser().login("ada.other@example.com", "not-the-password");
const nobody = await browser().login("nobody@example.com", PASSWORD);
check("a wrong password and an unknown address answer alike",
  badPw.reason === "wrong_credentials" && nobody.reason === "wrong_credentials", JSON.stringify([badPw, nobody]));
check("a password is never kept as itself", !env.ACCOUNTS.raw.prepare(
  "SELECT group_concat(password_hash) h FROM identities").get().h.includes(PASSWORD));
me = await a.me();
check("the account page says the address has a password, and never shows it",
  me.identities.find((i) => i.provider === "email").has_password === true && !JSON.stringify(me).includes("pbkdf2"),
  JSON.stringify(me));

const short = await browser().post("/api/auth/email/register", { email: "short@example.com", password: "1234567" });
check("a password under eight characters is refused", (await short.json()).reason === "bad_password");
const again = await (await browser().post("/api/auth/email/register", { email: "ADA@example.com", password: PASSWORD })).json();
check("registering an address that has an account says so", again.reason === "email_taken", JSON.stringify(again));

const other = browser();
const reg = await other.email("carol@example.com");
const carolId = (await other.me()).id;
check("registering is the only mail before the account exists", reg.ok && reg.outcome === "created", JSON.stringify(reg));
const elsewhere = browser();
await elsewhere.login("carol@example.com", PASSWORD);
for (let i = 0; i < 5; i++) await browser().login("carol@example.com", "wrong-wrong");
const locked = await browser().login("carol@example.com", PASSWORD);
check("five wrong passwords close the address to passwords for a while", locked.reason === "locked", JSON.stringify(locked));
const noMail = await browser().reset("nobody@example.com", "fresh-password");
check("a reset for an address nobody holds answers the same, and mails nothing",
  noMail.ok === true && noMail.mailed === false, JSON.stringify(noMail));
env.ACCOUNTS.raw.prepare("UPDATE email_codes SET sent_at = '2000-01-01T00:00:00.000Z'").run();
const reset = await browser().reset("carol@example.com", "a-new-password");
check("a reset sets the new password and lifts the lock",
  reset.ok && reset.outcome === "password_reset" && (await browser().login("carol@example.com", "a-new-password")).ok,
  JSON.stringify(reset));
check("...and signs every other browser out", (await elsewhere.me()) === null && (await other.me()) === null);

const keep = browser();
await keep.login("carol@example.com", "a-new-password");
const second = browser();
await second.login("carol@example.com", "a-new-password");
const refused = await (await keep.post("/api/account/password", { current: "wrong", password: "third-password" })).json();
check("changing the password asks for the old one", refused.reason === "wrong_password", JSON.stringify(refused));
const changed = await (await keep.post("/api/account/password", { current: "a-new-password", password: "third-password" })).json();
check("...and with it, changes it, keeps this browser and signs the others out",
  changed.ok && (await keep.me())?.id === carolId && (await second.me()) === null, JSON.stringify(changed));

env.ACCOUNTS.raw.prepare("UPDATE identities SET password_hash = NULL WHERE subject = 'carol@example.com'").run();
check("an address linked before passwords cannot sign in with one",
  (await browser().login("carol@example.com", "third-password")).reason === "wrong_credentials");
const set = await (await keep.post("/api/account/password", { password: "fourth-password" })).json();
check("...and its signed-in owner sets one without an old one to give",
  set.ok && (await browser().login("carol@example.com", "fourth-password")).ok, JSON.stringify(set));

let r = await (await a.post("/api/account/unlink", { provider: "discord" })).json();
check("a slot empties while another is filled", r.ok && r.deleted === false, JSON.stringify(r));
r = await (await a.post("/api/account/unlink", { provider: "email" })).json();
r = await (await a.post("/api/account/unlink", { provider: "google" })).json();
check("the last slot is not emptied by accident", r.ok === false && r.reason === "last_slot"
  && count("SELECT COUNT(*) n FROM accounts WHERE id = ?", adaId) === 1, JSON.stringify(r));
r = await (await a.post("/api/account/unlink", { provider: "google", delete_account: true })).json();
check("...and emptied on purpose, it takes the account and its sessions",
  r.ok && r.deleted === true && count("SELECT COUNT(*) n FROM accounts WHERE id = ?", adaId) === 0
    && count("SELECT COUNT(*) n FROM sessions WHERE account = ?", adaId) === 0 && (await a.me()) === null, JSON.stringify(r));

env.ACCOUNTS.raw.prepare("DELETE FROM identities WHERE account = ?").run(bobId);
check("the schema holds the rule too: a last slot deleted by hand takes its account",
  count("SELECT COUNT(*) n FROM accounts WHERE id = ?", bobId) === 0);

// ---- the doors a stranger tries ---------------------------------------------------------

const c = browser();
back = await c.oauth("github", { id: "88", name: "carol" }, "login", "forged-state");
check("a callback whose state is not this browser's is refused", back.searchParams.get("auth_error") === "state", back);
const odd = await c.get("/api/auth/github/start?return=//evil.example/x");
check("a return address off this site is not followed",
  (await (async () => { const code = "x"; people.set(code, { id: "88", name: "carol" });
    const st = new URL(odd.headers.get("location")).searchParams.get("state");
    const cb = await c.get(`/api/auth/github/callback?code=${code}&state=${st}`);
    return new URL(cb.headers.get("location")).host; })()) === "wfsim.app");
const cross = await c.post("/api/auth/logout", {}, { origin: "https://evil.example" });
check("a state-changing call from another site is refused", cross.status === 403, cross.status);
const notYet = await browser().oauth("discord", { id: "d-new", name: "new" }, "link");
check("linking needs a signed-in account", notYet.searchParams.get("auth_error") === "not_signed_in", notYet);

const bare = await (await accountRoute(new Request(SITE + "/api/account"), {}, "/api/account")).json();
check("with nothing configured the page is offered no way in", bare.ok && bare.providers.length === 0 && bare.account === null,
  JSON.stringify(bare));

console.log(failed ? `\n${failed} failed` : "\nthe account rules hold");
process.exit(failed ? 1 : 0);
