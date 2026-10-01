// THE PRICING PAGE (`/pricing`, 17-account.js `pricingPage`): what is free
// beside what the membership adds, every number the server's. Not on sale, it
// says so and still states the free allowance, which holds before anything is
// sold; on sale it shows the offer and the free allowance, a way to sign in
// when signed out, and a member's own plan.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000, lang: "en" });
const { evaluate, check } = app;

const r = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const realFetch = window.fetch;
  let billing = { ok: true, configured: false, free: { sync_allowance: { presets: 100, customs: 100 } } }, account = null;
  window.fetch = async (url, o = {}) => {
    const path = String(url);
    const reply = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/api/account') return account ? reply({ ok: true, providers: ['email'], account }) : reply({ ok: false, providers: ['email'] }, 401);
    if (path === '/api/billing') return reply(billing);
    if (path === '/api/billing/invoices') return account ? reply({ ok: true, invoices: [] }) : reply({ ok: false }, 401);
    if (path === '/api/cloud/sync') return reply({ ok: true, full: false, entries: [], next: null, cursor: 0 });
    return realFetch(url, o);
  };
  const open = async () => {
    history.pushState({}, '', '/pricing'); route(); await loadAccount(); await sleep(400);
    const page = document.getElementById('auth-page');
    return { text: page.textContent, signIn: !!page.querySelector('a[href^="/login"]'),
      subscribe: !!page.querySelector('[data-auth="checkout"]'), title: document.title,
      held: !!page.querySelector('.tag.ok') && !!page.querySelector('a[href="/account/billing"]') };
  };
  const out = {};
  out.off = await open();
  billing = { ok: true, configured: true, signed_in: false, free: { sync_allowance: { presets: 50, customs: 50 } },
    names: { offers: { member: { en: 'WFSim Membership', zh: 'WFSim 会员', includes: [{ en: 'Any number of items synced to your account' }] } }, meters: {} },
    prices: [{ key: 'member_month', offer: 'member', interval: 'month', amount: 500, currency: 'usd' },
             { key: 'member_year', offer: 'member', interval: 'year', amount: 5000, currency: 'usd' }] };
  out.onOut = await open();
  account = { id: 'acc1', created_at: '', identities: [{ provider: 'email', label: 'a@x' }] };
  out.onIn = await open();
  billing = { ...billing, subscription: { offer: 'member', status: 'active', amount: 500, currency: 'usd', interval: 'month',
    period_end: new Date(Date.now() + 864e5).toISOString(), started_at: new Date().toISOString() } };
  out.member = await open();
  window.fetch = realFetch;
  return out;
})()`);

const has = (t, s) => (t || "").includes(s);
check("not on sale, the page says so", has(r.off.text, "not on sale"), r.off.text.slice(0, 300));
check("...and still states the free allowance", has(r.off.text, "100 presets and 100 customs"), r.off.text.slice(0, 300));
check("on sale, it shows the price and what the membership adds",
  has(r.onOut.text, "$5.00") && has(r.onOut.text, "Any number of items synced"), r.onOut.text.slice(0, 400));
check("...the free allowance the server states", has(r.onOut.text, "50 presets and 50 customs"), r.onOut.text.slice(0, 400));
check("...a way to sign in, signed out, and no checkout", r.onOut.signIn && !r.onOut.subscribe);
check("signed in, a subscribe button", r.onIn.subscribe === true);
check("a member sees their plan, active, and no checkout", r.member.held && !r.member.subscribe, r.member.text.slice(0, 300));
check("the page is titled", /^Pricing — WFSim$/.test(r.off.title), r.off.title);

await app.finish("the pricing page states what is free and what the membership adds, from the server's numbers");
