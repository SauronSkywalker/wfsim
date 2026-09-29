// THE BILLING RULES, RUN AGAINST THE REAL SCHEMA — docs/BILLING.md.
//
// `worker/accounts.sql` and `worker/billing.sql` in node's own SQLite, behind
// the same D1 stub `check_accounts` uses, and Stripe stubbed at `fetch` as a
// small in-memory account: prices by lookup key, customers, subscriptions,
// charges. Events are signed as Stripe signs them. What it holds: an account
// uses what its mirror and the catalog say, the mirror follows Stripe whatever
// the webhook delivered, and money given back takes back what it bought.
// No network, no browser.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac } from "node:crypto";
import { billingRoute, entitlements, consume, billingNightly, signatureValid } from "../worker/billing.js";
import { accountRoute } from "../worker/accounts.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failed++;
};

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

// ---- a catalog of every shape an offer can take ---------------------------------------

const CAT = { offers: {
  member: { kind: "subscription", prices: ["member_month", "member_year"], features: ["watch", "reopt"], included: { calc: 100 } },
  pack: { kind: "one_time", prices: ["calc_pack"], adds: { calc: 500 } },
  pass: { kind: "one_time", prices: ["pass_30"], days: 30, features: ["watch"] },
  plus: { kind: "subscription", prices: ["plus_month"], features: ["nona"], included: {} },
} };

// ---- Stripe, as a small account in memory ------------------------------------------------

const S = {
  prices: [
    { id: "price_m", lookup_key: "member_month", unit_amount: 499, currency: "usd", recurring: { interval: "month" } },
    { id: "price_y", lookup_key: "member_year", unit_amount: 4900, currency: "usd", recurring: { interval: "year" } },
    { id: "price_p", lookup_key: "calc_pack", unit_amount: 299, currency: "usd", recurring: null },
    { id: "price_t", lookup_key: "pass_30", unit_amount: 499, currency: "usd", recurring: null },
  ],
  customers: [], subs: [], sessions: [], charges: [], down: false, n: 0,
};
const id = (p) => `${p}_${++S.n}`;
const unix = (d = 0) => Math.floor(Date.now() / 1000) + d * 86400;
const priceByKey = (k) => S.prices.find((p) => p.lookup_key === k);
const priceById = (i) => S.prices.find((p) => p.id === i);

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host !== "api.stripe.com") throw new Error(`unexpected fetch ${u}`);
  const method = init.method || "GET";
  const q = method === "GET" ? u.searchParams : new URLSearchParams(String(init.body || ""));
  const path = u.pathname.replace(/^\/v1\//, "");
  const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (S.down) return new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
  if (path === "prices") {
    const keys = q.getAll("lookup_keys[]");
    return ok({ data: S.prices.filter((p) => keys.includes(p.lookup_key)) });
  }
  if (path === "customers" && method === "POST") {
    const c = { id: id("cus"), metadata: { account: q.get("metadata[account]") } };
    S.customers.push(c);
    return ok(c);
  }
  if (path === "checkout/sessions") {
    const s = { id: id("cs"), url: `https://checkout.stripe.com/c/pay/${S.n}`, mode: q.get("mode"), customer: q.get("customer"),
      client_reference_id: q.get("client_reference_id"), metadata: { price: q.get("metadata[price]") },
      price: q.get("line_items[0][price]"), managed: q.get("managed_payments[enabled]"), created: unix() };
    S.sessions.push(s);
    return ok(s);
  }
  if (path === "subscriptions" && method === "GET") {
    return ok({ data: S.subs.filter((s) => s.customer === q.get("customer")) });
  }
  const sub = path.match(/^subscriptions\/(.+)$/);
  if (sub && method === "DELETE") {
    const s = S.subs.find((x) => x.id === sub[1]);
    s.status = "canceled";
    return ok(s);
  }
  const ch = path.match(/^charges\/(.+)$/);
  if (ch) return ok(S.charges.find((c) => c.id === ch[1]));
  if (path === "invoices") return ok({ data: [{ number: "WF-1", created: unix(), total: 499, currency: "usd", status: "paid",
    hosted_invoice_url: "https://invoice.stripe.com/i/1", invoice_pdf: "https://pay.stripe.com/invoice/1/pdf" }] });
  if (path === "billing_portal/sessions") return ok({ url: "https://billing.stripe.com/p/session/1" });
  throw new Error(`unstubbed stripe ${method} ${path}`);
};

/// A SUBSCRIPTION AS STRIPE HOLDS IT: the period on its item, as this API
/// version puts it.
function subscribe(customer, key, { start = 0, days = 30, status = "active" } = {}) {
  const s = { id: id("sub"), customer, status, cancel_at_period_end: false,
    items: { data: [{ price: priceByKey(key), current_period_start: unix(start), current_period_end: unix(start + days) }] } };
  S.subs.push(s);
  return s;
}

// ---- the site: env, a signed-in reader, signed events ----------------------------------------

const SECRET = "whsec_test";
const env = { ACCOUNTS: d1(), AUTH_SECRET: "test-secret", STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: SECRET };
const SITE = "https://wfsim.app";
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function reader(name) {
  const account = `acct-${name}`;
  const token = `tok-${name}`;
  env.ACCOUNTS.raw.prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)").run(account, new Date().toISOString());
  env.ACCOUNTS.raw.prepare("INSERT INTO identities (provider, subject, account, label, linked_at) VALUES ('github', ?, ?, ?, ?)")
    .run(name, account, name, new Date().toISOString());
  env.ACCOUNTS.raw.prepare("INSERT INTO sessions (token_hash, account, expires_at) VALUES (?, ?, '2999-01-01T00:00:00.000Z')")
    .run(b64url(createHash("sha256").update(token).digest()), account);
  const call = async (method, path, body, extra = {}) => {
    const req = new Request(SITE + path, { method,
      headers: { cookie: `wfsim_session=${token}`, ...(body ? { "content-type": "application/json", origin: SITE } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const p = new URL(req.url).pathname;
    return (await billingRoute(req, env, p, CAT)) || accountRoute(req, env, p);
  };
  return {
    account,
    get: async (p) => (await call("GET", p)).json(),
    post: async (p, b, h) => (await call("POST", p, b, h)).json(),
    status: async (p, b, h) => (await call("POST", p, b, h)).status,
    customer: () => env.ACCOUNTS.raw.prepare("SELECT customer FROM billing_customers WHERE account = ?").get(account)?.customer,
  };
}

let evn = 0;
async function deliver(type, object, { id: eventId = `evt_${++evn}`, secret = SECRET, age = 0 } = {}) {
  const body = JSON.stringify({ id: eventId, type, data: { object } });
  const t = Math.floor(Date.now() / 1000) - age;
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const req = new Request(`${SITE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body });
  const res = await billingRoute(req, env, "/api/stripe/webhook", CAT);
  return { status: res.status, ...(await res.json()) };
}
const held = (a) => entitlements(env, a.account, CAT);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

// ---- nothing configured ------------------------------------------------------------------

const bare = await (await billingRoute(new Request(`${SITE}/api/billing`), { ACCOUNTS: env.ACCOUNTS }, "/api/billing", CAT)).json();
check("with Stripe unset the page is told billing is off, and nothing else", bare.ok && bare.configured === false, JSON.stringify(bare));

// ---- buying the membership ------------------------------------------------------------------

const ada = reader("ada");
const view = await ada.get("/api/billing");
check("what is on sale is what Stripe states for the catalog's keys",
  view.configured && same(view.prices.map((p) => [p.key, p.offer, p.amount]).sort(),
    [["calc_pack", "pack", 299], ["member_month", "member", 499], ["member_year", "member", 4900], ["pass_30", "pass", 499]]),
  JSON.stringify(view.prices));
check("...and a key with no Stripe price is simply not on sale", !view.prices.some((p) => p.key === "plus_month"));
check("a new account holds nothing", same(view.features, []) && same(view.meters, {}), JSON.stringify(view));

let r = await ada.post("/api/billing/checkout", { price: "nope" });
check("a price the catalog does not name is refused", r.reason === "bad_price", JSON.stringify(r));
r = await ada.post("/api/billing/checkout", { price: "plus_month" });
check("a catalog price Stripe does not sell is refused", r.reason === "not_on_sale", JSON.stringify(r));
r = await ada.post("/api/billing/checkout", { price: "member_month" });
const session = S.sessions.at(-1);
check("checkout is Stripe's page, with Managed Payments, for this account's own customer",
  r.ok && r.url.startsWith("https://checkout.stripe.com/") && session.managed === "true" && session.mode === "subscription"
    && session.customer === ada.customer() && session.client_reference_id === ada.account && session.price === "price_m",
  JSON.stringify([r, session]));
check("returning from checkout grants nothing — only Stripe's word does", same((await held(ada)).features, []));

const sub = subscribe(ada.customer(), "member_month");
r = await deliver("checkout.session.completed", { mode: "subscription", customer: ada.customer() }, { id: "evt_buy" });
let e = await held(ada);
check("a completed checkout switches on what the offer grants",
  r.ok && same(e.features, ["reopt", "watch"]) && same(e.meters.calc, { included: 100, pack: 0 }), JSON.stringify(e));
r = await deliver("checkout.session.completed", { mode: "subscription", customer: ada.customer() }, { id: "evt_buy" });
check("the same event again is handled once", r.duplicate === true, JSON.stringify(r));
r = await ada.post("/api/billing/checkout", { price: "member_year" });
check("an account already holding the membership is not sold it twice", r.reason === "already_subscribed", JSON.stringify(r));

// ---- the webhook's door ------------------------------------------------------------------------

r = await deliver("customer.subscription.deleted", { customer: ada.customer() }, { secret: "whsec_forged" });
check("an event not signed with the endpoint's secret is refused", r.status === 400 && r.reason === "bad_signature");
r = await deliver("customer.subscription.deleted", { customer: ada.customer() }, { age: 3600 });
check("...and so is a signed one an hour old", r.status === 400);
check("the signature rule is Stripe's: t and v1 over `t.body`",
  await signatureValid("k", "{}", `t=100,v1=${createHmac("sha256", "k").update("100.{}").digest("hex")}`, 100000)
    && !(await signatureValid("k", "{}", "t=100,v1=00", 100000)));

// ---- metered use ------------------------------------------------------------------------------------

r = await consume(env, ada.account, "calc", 60, CAT);
check("use spends the period's allowance", r.ok && same(r.left, { included: 40, pack: 0 }), JSON.stringify(r));
r = await consume(env, ada.account, "calc", 50, CAT);
check("a use the pots cannot cover spends nothing", !r.ok && r.reason === "quota"
  && (await held(ada)).meters.calc.included === 40, JSON.stringify(r));

await ada.post("/api/billing/checkout", { price: "calc_pack" });
const packSession = S.sessions.at(-1);
check("a one-time offer checks out as a payment", packSession.mode === "payment" && packSession.metadata.price === "calc_pack");
await deliver("checkout.session.completed", { mode: "payment", payment_status: "paid", payment_intent: "pi_pack",
  customer: ada.customer(), client_reference_id: ada.account, metadata: { price: "calc_pack" }, created: unix() });
e = await held(ada);
check("a bought pack adds credit beside the allowance", same(e.meters.calc, { included: 40, pack: 500 }), JSON.stringify(e.meters));
r = await consume(env, ada.account, "calc", 50, CAT);
check("the allowance is spent before bought credit", r.ok && same(r.left, { included: 0, pack: 490 }), JSON.stringify(r));

// ---- renewal, cancellation, and a webhook that never came ------------------------------------------------

sub.items.data[0].current_period_start = unix(1);
sub.items.data[0].current_period_end = unix(31);
env.ACCOUNTS.raw.prepare("UPDATE billing_usage SET at = ?").run(new Date(Date.now() - 3600e3).toISOString());
await deliver("invoice.paid", { customer: ada.customer() });
e = await held(ada);
check("a renewal starts a fresh allowance and keeps the pack", same(e.meters.calc, { included: 100, pack: 490 }), JSON.stringify(e.meters));

sub.cancel_at_period_end = true;
await deliver("customer.subscription.updated", { customer: ada.customer() });
e = await held(ada);
check("a cancellation at period end keeps access until then, and says so",
  same(e.features, ["reopt", "watch"]) && e.held[0].cancel_at_period_end === true, JSON.stringify(e.held));

sub.status = "past_due";
await deliver("invoice.payment_failed", { customer: ada.customer() });
check("a failed renewal keeps access while Stripe retries", (await held(ada)).features.length === 2);

sub.status = "canceled";
e = await held(ada);
check("with no event yet, the mirror still says what Stripe last said", e.features.length === 2);
const synced = await billingNightly(env);
e = await held(ada);
check("the nightly sync reads Stripe again and ends what ended",
  synced >= 1 && same(e.features, []) && same(e.meters.calc, { included: 0, pack: 490 }), JSON.stringify(e));

sub.status = "active";
sub.items.data[0].current_period_start = unix(-40);
sub.items.data[0].current_period_end = unix(-4);
await billingNightly(env);
check("a period four days past its end with no word from Stripe is not access", same((await held(ada)).features, []));
sub.items.data[0].current_period_end = unix(-1);
await billingNightly(env);
check("...but one day past it still is, while a renewal may be late", (await held(ada)).features.length === 2);
sub.status = "canceled";
await billingNightly(env);

// ---- money given back ---------------------------------------------------------------------------------------

await deliver("charge.refunded", { refunded: true, payment_intent: "pi_pack", customer: ada.customer() });
e = await held(ada);
check("a refunded pack takes its credit back, and a balance never goes below zero",
  same(e.meters.calc, { included: 0, pack: 0 }) || e.meters.calc === undefined, JSON.stringify(e.meters));

const bob = reader("bob");
await bob.post("/api/billing/checkout", { price: "member_year" });
const bobSub = subscribe(bob.customer(), "member_year", { days: 365 });
await deliver("checkout.session.completed", { mode: "subscription", customer: bob.customer() });
await deliver("charge.refunded", { refunded: false, payment_intent: "pi_bob_1", customer: bob.customer() });
check("a partial refund changes nothing", (await held(bob)).features.length === 2);
await deliver("charge.refunded", { refunded: true, payment_intent: "pi_bob_1", customer: bob.customer() });
check("a full refund of a membership payment ends the membership now",
  bobSub.status === "canceled" && same((await held(bob)).features, []));

const cy = reader("cy");
await cy.post("/api/billing/checkout", { price: "member_month" });
const cySub = subscribe(cy.customer(), "member_month");
await deliver("checkout.session.completed", { mode: "subscription", customer: cy.customer() });
S.charges.push({ id: "ch_cy", customer: cy.customer(), payment_intent: "pi_cy" });
await deliver("charge.dispute.created", { charge: "ch_cy", payment_intent: "pi_cy" });
check("a dispute ends the membership now", cySub.status === "canceled" && same((await held(cy)).features, []));

// ---- a pass, a grant, an erasure --------------------------------------------------------------------------------

await cy.post("/api/billing/checkout", { price: "pass_30" });
await deliver("checkout.session.completed", { mode: "payment", payment_status: "paid", payment_intent: "pi_pass",
  customer: cy.customer(), metadata: { price: "pass_30" }, created: unix() });
check("a one-time pass switches its features on", same((await held(cy)).features, ["watch"]));
env.ACCOUNTS.raw.prepare("UPDATE billing_purchases SET created_at = ? WHERE payment_intent = 'pi_pass'")
  .run(new Date(Date.now() - 31 * 86400e3).toISOString());
check("...and off again after its days", same((await held(cy)).features, []));

const dee = reader("dee");
env.ACCOUNTS.raw.prepare("INSERT INTO billing_grants (account, offer, starts_at, ends_at, note) VALUES (?, 'member', ?, ?, 'test')")
  .run(dee.account, new Date(Date.now() - 86400e3).toISOString(), new Date(Date.now() + 86400e3).toISOString());
e = await held(dee);
check("a grant gives the offer without a payment", same(e.features, ["reopt", "watch"]) && e.meters.calc.included === 100, JSON.stringify(e));
env.ACCOUNTS.raw.prepare("UPDATE billing_grants SET ends_at = ? WHERE account = ?").run(new Date(Date.now() - 1000).toISOString(), dee.account);
check("...and lapses on its own", same((await held(dee)).features, []));

const eve = reader("eve");
await eve.post("/api/billing/checkout", { price: "member_month" });
subscribe(eve.customer(), "member_month");
await deliver("checkout.session.completed", { mode: "subscription", customer: eve.customer() });
const eveCustomer = eve.customer();
await deliver("customer.deleted", { id: eveCustomer });
check("Stripe erasing a customer clears the mirror", !eve.customer() && same((await held(eve)).features, []));

// ---- the reader's own records ---------------------------------------------------------------------------------------

const inv = await bob.get("/api/billing/invoices");
check("receipts and invoices are listed from Stripe, with Stripe's own links",
  inv.ok && inv.invoices[0].pdf.startsWith("https://") && inv.invoices[0].url.startsWith("https://"), JSON.stringify(inv));
r = await bob.post("/api/billing/portal", {});
check("managing the subscription hands over to Stripe's portal", r.ok && r.url.startsWith("https://billing.stripe.com/"), JSON.stringify(r));
check("a state-changing billing call from another site is refused",
  (await bob.status("/api/billing/checkout", { price: "member_month" }, { origin: "https://evil.example" })) === 403);
const anon = await (await billingRoute(new Request(`${SITE}/api/billing/checkout`, { method: "POST",
  headers: { "content-type": "application/json", origin: SITE }, body: "{}" }), env, "/api/billing/checkout", CAT)).json();
check("buying needs a signed-in account", anon.reason === "not_signed_in", JSON.stringify(anon));

// ---- deleting an account ends its billing first ------------------------------------------------------------------------

const fay = reader("fay");
await fay.post("/api/billing/checkout", { price: "member_month" });
const faySub = subscribe(fay.customer(), "member_month");
await deliver("checkout.session.completed", { mode: "subscription", customer: fay.customer() });
const exp = await fay.post("/api/account/export", {});
check("the account export carries its billing records",
  exp.billing && exp.billing.customer === fay.customer() && exp.billing.subscriptions.length === 1, JSON.stringify(exp.billing));
S.down = true;
r = await fay.post("/api/account/delete", {});
check("an account whose subscription cannot be ended is not deleted",
  r.reason === "billing_open" && env.ACCOUNTS.raw.prepare("SELECT COUNT(*) n FROM accounts WHERE id = ?").get(fay.account).n === 1,
  JSON.stringify(r));
S.down = false;
r = await fay.post("/api/account/delete", {});
check("deleting an account ends its subscription at Stripe first, then takes every billing row",
  r.ok && faySub.status === "canceled"
    && env.ACCOUNTS.raw.prepare("SELECT COUNT(*) n FROM billing_subscriptions WHERE account = ?").get(fay.account).n === 0
    && env.ACCOUNTS.raw.prepare("SELECT COUNT(*) n FROM billing_customers WHERE account = ?").get(fay.account).n === 0,
  JSON.stringify(r));

console.log(failed ? `\n${failed} failed` : "\nthe billing rules hold");
process.exit(failed ? 1 : 0);
