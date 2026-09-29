// ---- BILLING ----------------------------------------------------------------------
//
// docs/BILLING.md. Stripe, through Managed Payments, is the merchant of record:
// it takes the money, the tax, the receipts, the invoices and the disputes. This
// file keeps one thing straight — what an account has paid for — and derives
// from it what the account may use.
//
// STRIPE IS THE AUTHORITY. An event is only a hint that a customer changed: the
// handler fetches that customer's subscriptions and rewrites our mirror whole,
// and a nightly sync does the same for everyone, so a lost or reordered event
// costs a delay and never a wrong answer.
//
// THE CODE ASKS FOR A FEATURE OR A METER, NEVER FOR A PLAN. What an offer
// grants lives in CATALOG alone, so repackaging is an edit here and nothing a
// feature reads changes.

import { sessionAccount, sameSite, json, no } from "./accounts.js";

export const STRIPE_VERSION = "2025-03-31.basil";

/// WHAT CAN BE BOUGHT. A price is named by its Stripe LOOKUP KEY, which the
/// dashboard sets on each price, so test and live mode share this table and a
/// price change is a new Stripe price under the same key.
///
///   kind      "subscription" | "one_time"
///   prices    lookup keys that sell this offer (a month and a year, say)
///   features  what it switches on while it is held
///   included  per subscription period: { meter: amount }, reset each period
///   adds      one-time credit: { meter: amount }, kept until spent
///   days      a one-time offer that switches its features on for this long
export const CATALOG = {
  offers: {
    member: { kind: "subscription", prices: ["member_month", "member_year"], features: [], included: {} },
  },
};

/// STRIPE'S STATUSES THAT KEEP ACCESS. `past_due` is the retry window after a
/// failed renewal: Stripe keeps trying, and ends the subscription if it fails.
const ACCESS = new Set(["active", "trialing", "past_due"]);
/// A period whose end passed with no word from Stripe still counts this long,
/// so a late renewal event never switches a paying reader off.
const GRACE_SECONDS = 3 * 24 * 3600;
const PRICE_CACHE_SECONDS = 600;
const SYNC_PER_RUN = 200;
const SIGNATURE_TOLERANCE_SECONDS = 300;

export const billingConfigured = (env) => !!(env.ACCOUNTS && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
const now = () => new Date().toISOString();
const iso = (unix) => new Date(unix * 1000).toISOString();

// ---- the catalog ---------------------------------------------------------------------

function offerOf(catalog, price) {
  for (const [id, offer] of Object.entries(catalog.offers)) if (offer.prices.includes(price)) return { id, ...offer };
  return null;
}

// ---- Stripe's API ----------------------------------------------------------------------

/// Stripe's form encoding: nested keys in brackets, scalar lists as `key[]`.
function form(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((x, i) => (typeof x === "object" ? form(x, `${key}[${i}]`, out) : out.append(`${key}[]`, String(x))));
    } else if (typeof v === "object") {
      form(v, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

async function stripe(env, method, path, params = {}) {
  const body = form(params).toString();
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`;
  const r = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "stripe-version": STRIPE_VERSION,
      ...(method === "GET" ? {} : { "content-type": "application/x-www-form-urlencoded" }),
    },
    ...(method === "GET" ? {} : { body }),
  });
  const out = await r.json();
  if (!r.ok) throw Object.assign(new Error(`stripe ${method} ${path}: ${out.error?.message || r.status}`), { status: r.status });
  return out;
}

// ---- what an account holds -----------------------------------------------------------

/// EVERYTHING AN ACCOUNT MAY USE, derived now from the mirror and the catalog:
/// the features switched on, and per meter what is left in each pot.
export async function entitlements(env, account, catalog = CATALOG, at = now()) {
  const db = env.ACCOUNTS;
  const [subs, buys, grants] = await Promise.all([
    db.prepare("SELECT price, status, period_start, period_end, cancel_at_period_end FROM billing_subscriptions WHERE account = ?1")
      .bind(account).all(),
    db.prepare("SELECT price, status, created_at FROM billing_purchases WHERE account = ?1").bind(account).all(),
    db.prepare("SELECT offer, starts_at, ends_at FROM billing_grants WHERE account = ?1 AND starts_at <= ?2 AND ends_at > ?2")
      .bind(account, at).all(),
  ]);
  const features = new Set();
  const included = {};
  const packs = {};
  const hold = (offer, since) => {
    for (const f of offer.features || []) features.add(f);
    for (const [m, n] of Object.entries(offer.included || {})) {
      const pot = included[m] || (included[m] = { quota: 0, since });
      pot.quota += n;
      if (since < pot.since) pot.since = since;
    }
  };
  const graceEnd = (end) => new Date(Date.parse(end) + GRACE_SECONDS * 1000).toISOString();
  const held = [];
  for (const s of subs.results) {
    const offer = offerOf(catalog, s.price);
    if (!offer || !ACCESS.has(s.status) || graceEnd(s.period_end) <= at) continue;
    hold(offer, s.period_start);
    held.push({ offer: offer.id, price: s.price, status: s.status, period_end: s.period_end,
      cancel_at_period_end: !!s.cancel_at_period_end });
  }
  for (const g of grants.results) {
    const offer = catalog.offers[g.offer];
    if (!offer) continue;
    hold(offer, g.starts_at);
    held.push({ offer: g.offer, grant: true, period_end: g.ends_at });
  }
  for (const b of buys.results) {
    const offer = offerOf(catalog, b.price);
    if (!offer || b.status !== "paid") continue;
    for (const [m, n] of Object.entries(offer.adds || {})) packs[m] = (packs[m] || 0) + n;
    if (offer.days) {
      const ends = new Date(Date.parse(b.created_at) + offer.days * 86400000).toISOString();
      if (ends > at) { hold(offer, b.created_at); held.push({ offer: offer.id, price: b.price, period_end: ends }); }
    }
  }
  const meters = {};
  const names = new Set([...Object.keys(included), ...Object.keys(packs)]);
  for (const m of names) {
    const inc = included[m];
    const usedIncluded = inc ? (await db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS n FROM billing_usage WHERE account = ?1 AND meter = ?2 AND pot = 'included' AND at >= ?3",
    ).bind(account, m, inc.since).first()).n : 0;
    const usedPack = (await db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS n FROM billing_usage WHERE account = ?1 AND meter = ?2 AND pot = 'pack'",
    ).bind(account, m).first()).n;
    meters[m] = {
      included: inc ? Math.max(0, inc.quota - usedIncluded) : 0,
      pack: Math.max(0, (packs[m] || 0) - usedPack),
    };
  }
  return { features: [...features].sort(), meters, held };
}

export async function hasFeature(env, account, feature, catalog = CATALOG) {
  return (await entitlements(env, account, catalog)).features.includes(feature);
}

/// SPEND `amount` OF A METER: the period's allowance first, then bought
/// credit. All or nothing — a use the two pots cannot cover spends neither.
/// Two uses racing can both pass on the same balance; at this size that is a
/// few units over, and it is taken from the next period.
export async function consume(env, account, meter, amount, catalog = CATALOG) {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "bad_amount" };
  const m = (await entitlements(env, account, catalog)).meters[meter] || { included: 0, pack: 0 };
  const fromIncluded = Math.min(amount, m.included);
  const fromPack = amount - fromIncluded;
  if (fromPack > m.pack) return { ok: false, reason: "quota", left: m };
  const db = env.ACCOUNTS;
  const at = now();
  const rows = [];
  if (fromIncluded) rows.push(db.prepare("INSERT INTO billing_usage (account, meter, pot, amount, at) VALUES (?1, ?2, 'included', ?3, ?4)")
    .bind(account, meter, fromIncluded, at));
  if (fromPack) rows.push(db.prepare("INSERT INTO billing_usage (account, meter, pot, amount, at) VALUES (?1, ?2, 'pack', ?3, ?4)")
    .bind(account, meter, fromPack, at));
  await db.batch(rows);
  return { ok: true, left: { included: m.included - fromIncluded, pack: m.pack - fromPack } };
}

// ---- the mirror --------------------------------------------------------------------------

const accountOfCustomer = async (env, customer) => (customer
  ? (await env.ACCOUNTS.prepare("SELECT account FROM billing_customers WHERE customer = ?1").bind(customer).first())?.account
  : null) || null;

/// REWRITE ONE CUSTOMER'S SUBSCRIPTIONS FROM STRIPE. The period lives on the
/// subscription item in this API version; the top-level fields are read as a
/// fallback for a subscription that carries them.
export async function sync(env, customer) {
  const account = await accountOfCustomer(env, customer);
  if (!account) return false;
  const list = await stripe(env, "GET", "subscriptions", { customer, status: "all", limit: 100 });
  const db = env.ACCOUNTS;
  const rows = [db.prepare("DELETE FROM billing_subscriptions WHERE account = ?1").bind(account)];
  for (const s of list.data) {
    const item = s.items?.data?.[0] || {};
    const start = item.current_period_start ?? s.current_period_start;
    const end = item.current_period_end ?? s.current_period_end;
    const price = item.price?.lookup_key || item.price?.id;
    if (!price || !start || !end) continue;
    rows.push(db.prepare(
      `INSERT INTO billing_subscriptions (id, account, price, status, period_start, period_end, cancel_at_period_end)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(s.id, account, price, s.status, iso(start), iso(end), s.cancel_at_period_end ? 1 : 0));
  }
  rows.push(db.prepare("UPDATE billing_customers SET synced_at = ?1 WHERE customer = ?2").bind(now(), customer));
  await db.batch(rows);
  return true;
}

/// A FULL REFUND OR A DISPUTE ENDS WHAT THE MONEY BOUGHT. A one-time purchase
/// is found by its payment intent; any other charge is a subscription payment,
/// and the customer's live subscriptions end now rather than at period end.
async function reverse(env, paymentIntent, customer, status) {
  const hit = paymentIntent && await env.ACCOUNTS.prepare("SELECT 1 FROM billing_purchases WHERE payment_intent = ?1")
    .bind(paymentIntent).first();
  if (hit) {
    await env.ACCOUNTS.prepare("UPDATE billing_purchases SET status = ?1 WHERE payment_intent = ?2").bind(status, paymentIntent).run();
    return;
  }
  if (!customer) return;
  const live = await stripe(env, "GET", "subscriptions", { customer, status: "all", limit: 100 });
  for (const s of live.data) if (ACCESS.has(s.status)) await stripe(env, "DELETE", `subscriptions/${s.id}`);
  await sync(env, customer);
}

async function recordPurchase(env, session) {
  if (session.mode !== "payment" || session.payment_status !== "paid" || !session.payment_intent) return;
  const account = await accountOfCustomer(env, session.customer) || session.client_reference_id;
  const price = session.metadata?.price;
  if (!account || !price) return;
  await env.ACCOUNTS.prepare(
    "INSERT OR IGNORE INTO billing_purchases (payment_intent, account, price, status, created_at) VALUES (?1, ?2, ?3, 'paid', ?4)",
  ).bind(session.payment_intent, account, price, iso(session.created)).run();
}

async function handle(env, event) {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (o.mode === "subscription") await sync(env, o.customer);
      else await recordPurchase(env, o);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.paid":
    case "invoice.payment_failed":
      await sync(env, o.customer);
      return;
    case "charge.refunded":
      if (o.refunded) await reverse(env, o.payment_intent, o.customer, "refunded");
      return;
    case "charge.dispute.created": {
      const charge = o.charge ? await stripe(env, "GET", `charges/${o.charge}`) : {};
      await reverse(env, o.payment_intent || charge.payment_intent, charge.customer, "disputed");
      return;
    }
    case "customer.deleted": {
      // STRIPE ERASED THIS PERSON at their request, and ended what they held.
      const account = await accountOfCustomer(env, o.id);
      if (!account) return;
      await env.ACCOUNTS.batch([
        env.ACCOUNTS.prepare("DELETE FROM billing_subscriptions WHERE account = ?1").bind(account),
        env.ACCOUNTS.prepare("DELETE FROM billing_customers WHERE customer = ?1").bind(o.id),
      ]);
      return;
    }
    default:
  }
}

// ---- the webhook ----------------------------------------------------------------------------

const enc = new TextEncoder();
async function hmacHex(key, s) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sameText = (a, b) => {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/// STRIPE'S SIGNATURE: `t=<unix>,v1=<hex>` over `<t>.<body>`, keyed with the
/// endpoint's secret, and no older than the tolerance so a copy cannot be replayed.
export async function signatureValid(secret, body, header, at = Date.now()) {
  const parts = String(header || "").split(",").map((p) => p.split("="));
  const t = Number((parts.find(([k]) => k === "t") || [])[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(at / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const want = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => sameText(s, want));
}

async function webhook(request, env) {
  const body = await request.text();
  if (!(await signatureValid(env.STRIPE_WEBHOOK_SECRET, body, request.headers.get("stripe-signature")))) {
    return no("bad_signature", 400);
  }
  const event = JSON.parse(body);
  const seen = await env.ACCOUNTS.prepare("SELECT 1 FROM billing_events WHERE id = ?1").bind(event.id).first();
  if (seen) return json({ ok: true, duplicate: true });
  // A FAILURE IS A 500, so Stripe delivers the event again; it is recorded as
  // handled only once the handling is done.
  try {
    await handle(env, event);
  } catch (e) {
    return json({ ok: false, reason: "handler", detail: String(e.message || e) }, 500);
  }
  await env.ACCOUNTS.prepare("INSERT OR IGNORE INTO billing_events (id, type, at) VALUES (?1, ?2, ?3)")
    .bind(event.id, event.type, now()).run();
  return json({ ok: true });
}

// ---- the reader's side ----------------------------------------------------------------------

let priceCache = { at: 0, key: "", prices: [] };

/// THE PRICES ON SALE, as Stripe states them — amount, currency, interval —
/// for the keys the catalog names. A key with no active price is not on sale.
async function prices(env, catalog) {
  const keys = Object.values(catalog.offers).flatMap((o) => o.prices);
  const key = keys.join(",");
  if (priceCache.key === key && Date.now() - priceCache.at < PRICE_CACHE_SECONDS * 1000) return priceCache.prices;
  const list = keys.length ? await stripe(env, "GET", "prices", { lookup_keys: keys, active: true, limit: 100 }) : { data: [] };
  const out = list.data.filter((p) => p.lookup_key).map((p) => ({
    key: p.lookup_key, offer: offerOf(catalog, p.lookup_key)?.id, id: p.id,
    amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval || null,
  }));
  priceCache = { at: Date.now(), key, prices: out };
  return out;
}

async function customerOf(env, account) {
  const row = await env.ACCOUNTS.prepare("SELECT customer FROM billing_customers WHERE account = ?1").bind(account).first();
  if (row) return row.customer;
  const c = await stripe(env, "POST", "customers", { metadata: { account } });
  await env.ACCOUNTS.prepare("INSERT INTO billing_customers (account, customer) VALUES (?1, ?2)").bind(account, c.id).run();
  return c.id;
}

async function checkout(request, env, account, b, catalog) {
  const offer = offerOf(catalog, b.price);
  if (!offer) return no("bad_price");
  if (offer.kind === "subscription" && (await entitlements(env, account, catalog)).held.some((h) => h.offer === offer.id && !h.grant)) {
    return no("already_subscribed", 409);
  }
  const price = (await prices(env, catalog)).find((p) => p.key === b.price);
  if (!price) return no("not_on_sale", 409);
  const origin = new URL(request.url).origin;
  const subscription = offer.kind === "subscription";
  const session = await stripe(env, "POST", "checkout/sessions", {
    mode: subscription ? "subscription" : "payment",
    line_items: [{ price: price.id, quantity: 1 }],
    managed_payments: { enabled: true },
    customer: await customerOf(env, account),
    client_reference_id: account,
    metadata: { account, price: b.price },
    ...(subscription
      ? { subscription_data: { metadata: { account, price: b.price } } }
      : { payment_intent_data: { metadata: { account, price: b.price } } }),
    success_url: `${origin}/account?billing=done#billing`,
    cancel_url: `${origin}/account#billing`,
  });
  return json({ ok: true, url: session.url });
}

async function portal(request, env, account) {
  const row = await env.ACCOUNTS.prepare("SELECT customer FROM billing_customers WHERE account = ?1").bind(account).first();
  if (!row) return no("no_customer", 404);
  const s = await stripe(env, "POST", "billing_portal/sessions",
    { customer: row.customer, return_url: `${new URL(request.url).origin}/account#billing` });
  return json({ ok: true, url: s.url });
}

async function invoices(env, account) {
  const row = await env.ACCOUNTS.prepare("SELECT customer FROM billing_customers WHERE account = ?1").bind(account).first();
  if (!row) return json({ ok: true, invoices: [] });
  const list = await stripe(env, "GET", "invoices", { customer: row.customer, limit: 24 });
  return json({ ok: true, invoices: list.data.filter((i) => i.status !== "draft").map((i) => ({
    number: i.number, created: iso(i.created), total: i.total, currency: i.currency, status: i.status,
    url: i.hosted_invoice_url, pdf: i.invoice_pdf,
  })) });
}

/// An account's rows, or none where `worker/billing.sql` has not been applied —
/// the account paths run before billing exists in a database, and must not
/// fail on a table that would hold nothing.
async function rowsOf(env, sql, account) {
  try {
    return (await env.ACCOUNTS.prepare(sql).bind(account).all()).results;
  } catch (e) {
    if (/no such table/i.test(String(e.message || e))) return [];
    throw e;
  }
}

/// BEFORE AN ACCOUNT IS DELETED its subscriptions end, or it would go on being
/// charged for an account that no longer exists. False when one could not be
/// ended — and then the account is not deleted.
export async function endBilling(env, account) {
  const results = await rowsOf(env, "SELECT id, status FROM billing_subscriptions WHERE account = ?1", account);
  const live = results.filter((s) => ACCESS.has(s.status));
  if (!live.length) return true;
  if (!billingConfigured(env)) return false;
  try {
    for (const s of live) await stripe(env, "DELETE", `subscriptions/${s.id}`);
    return true;
  } catch (_) {
    return false;
  }
}

/// EVERYTHING BILLING HOLDS ABOUT AN ACCOUNT, for its export.
export async function billingExport(env, account) {
  const all = (t) => rowsOf(env, `SELECT * FROM ${t} WHERE account = ?1`, account);
  return {
    customer: (await all("billing_customers"))[0]?.customer || null,
    subscriptions: await all("billing_subscriptions"),
    purchases: await all("billing_purchases"),
    grants: await all("billing_grants"),
    usage: await all("billing_usage"),
  };
}

/// THE NIGHTLY SYNC: the customers least recently synced first, a bounded
/// number per run, so every mirror is re-read from Stripe within a few nights
/// whatever the webhook delivered.
export async function billingNightly(env) {
  if (!billingConfigured(env)) return 0;
  const { results } = await env.ACCOUNTS.prepare(
    "SELECT customer FROM billing_customers ORDER BY synced_at IS NOT NULL, synced_at LIMIT ?1",
  ).bind(SYNC_PER_RUN).all();
  for (const r of results) await sync(env, r.customer);
  return results.length;
}

/// The response for a billing path, or null for a path that is not one.
export async function billingRoute(request, env, path, catalog = CATALOG) {
  const routes = ["/api/billing", "/api/billing/invoices", "/api/billing/checkout", "/api/billing/portal", "/api/stripe/webhook"];
  if (!routes.includes(path)) return null;
  if (!billingConfigured(env)) return path === "/api/billing" ? json({ ok: true, configured: false }) : no("unavailable", 503);
  try {
    if (path === "/api/stripe/webhook") return request.method === "POST" ? await webhook(request, env) : no("method", 405);
    const get = path === "/api/billing" || path === "/api/billing/invoices";
    if (request.method !== (get ? "GET" : "POST")) return no("method", 405);
    if (!get && !sameSite(request)) return no("cross_site", 403);
    const account = await sessionAccount(env, request);
    if (path === "/api/billing") {
      const on = await prices(env, catalog);
      return json({ ok: true, configured: true, prices: on, ...(account ? await entitlements(env, account, catalog) : { signed_in: false }) });
    }
    if (!account) return no("not_signed_in", 401);
    if (path === "/api/billing/invoices") return await invoices(env, account);
    let b = {};
    try { b = JSON.parse((await request.text()) || "{}"); } catch (_) { return no("not_json"); }
    if (path === "/api/billing/checkout") return await checkout(request, env, account, b, catalog);
    return await portal(request, env, account);
  } catch (e) {
    return no("stripe", 502, { detail: String(e.message || e) });
  }
}
