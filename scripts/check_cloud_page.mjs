// /account/sync (19-cloud-page.js): every item this browser holds, from every
// collection and weapon, in one list, against an account and a sync server
// faked in the page. It switches an item's sync and nothing else: one at a
// time or several at once, up to the allowance the server states; it filters,
// searches and groups by weapon; an item opens where it lives; nothing on it
// deletes.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000, lang: "en" });
const { evaluate, check } = app;

const r = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const realFetch = window.fetch;
  let allowance = null;
  window.fetch = async (url, o = {}) => {
    const path = String(url);
    const reply = (j) => new Response(JSON.stringify(j), { headers: { 'content-type': 'application/json' } });
    if (path === '/api/account') return reply({ ok: true, providers: ['email'], account: { id: 'acc1', created_at: '2026-09-01',
      identities: [{ provider: 'email', label: 'a@x' }] } });
    if (path === '/api/billing') return reply({ ok: true, configured: false });
    if (path === '/api/account/agents') return reply({ ok: true, agents: [] });
    if (path === '/api/cloud/sync' && JSON.parse(o.body || '{}').devices) {
      const me = JSON.parse(o.body).device.id;
      return reply({ ok: true, devices: [
        { id: me, label: 'Windows · Chrome', seen_at: Date.now(), round_at: Date.now(), ok: true, reason: null, unsynced: 2, held: 100 },
        { id: 'phone', label: 'iPhone · Safari', seen_at: Date.now() - 864e5, round_at: Date.now() - 864e5, ok: false, reason: 'offline', unsynced: 0, held: 3 }] });
    }
    if (path === '/api/cloud/sync') return reply({ ok: true, full: false, entries: [], next: null, cursor: 0, ...(allowance ? { allowance, refused: [] } : {}) });
    return realFetch(url, o);
  };
  localStorage.clear();
  const at = Date.now();
  const b = (id, scope, name, t, extra = {}) => ({ id, scope, name, savedAt: at - t, state: {}, ...extra });
  localStorage.setItem('wfsim-presets-builder-builds', JSON.stringify([
    b('t1', 'torid', 'crit torid', 1000), b('t2', 'torid', 'old torid', 9000, { cloud_sync: false }), b('f1', 'furis', 'furis one', 2000)]));
  localStorage.setItem('wfsim-presets-simulator-scenarios', JSON.stringify([{ id: 's1', name: 'a crowd', savedAt: at - 3000, state: {} }]));
  localStorage.setItem('wfsim-customs-rivens', JSON.stringify([{ id: 'r1', scope: rivenScope('torid'), name: 'my riven', savedAt: at - 4000, state: {} }]));
  const page = () => document.getElementById('auth-page');
  const rows = () => [...page().querySelectorAll('#cloud-items tbody tr:not(.grp)')].filter((tr) => tr.querySelector('[data-ctoggle]'));
  const names = () => rows().map((tr) => tr.querySelector('.nm').textContent);
  const stored = (id) => JSON.parse(localStorage.getItem('wfsim-presets-builder-builds')).find((p) => p.id === id);
  history.pushState({}, '', '/account/sync'); route(); await loadAccount(); await sleep(800);
  const out = {};
  out.nav = !!page().querySelector('.set-side a[href="/account/sync"].on');
  await sleep(400);
  const devs = [...page().querySelectorAll('.set-main .block')].find((b) => /Devices/.test(b.querySelector('h2').textContent));
  out.devices = devs ? [devs.querySelectorAll('.kv').length, /This device/.test(devs.textContent), /2 items did not sync/.test(devs.textContent),
    /Could not sync/.test(devs.textContent) && /offline/.test(devs.textContent)] : null;
  out.order = names();
  out.link = (rows()[0].querySelector('a.open') || {}).getAttribute ? rows()[0].querySelector('a.open').getAttribute('href') : null;
  out.deletes = !!page().querySelector('#cloud-items [data-del], #cloud-items .del, #cloud-items [data-cdelete]');
  // ONE ITEM, switched off and on.
  page().querySelector('[data-ctoggle="t1"]').click(); await sleep(200);
  out.off = stored('t1').cloud_sync === false && !page().querySelector('[data-ctoggle="t1"]').classList.contains('on');
  page().querySelector('[data-ctoggle="t1"]').click(); await sleep(200);
  out.on = !('cloud_sync' in stored('t1'));
  // FILTER, SEARCH, GROUP.
  page().querySelector('[data-cstatus="local"]').click(); await sleep(150);
  out.local = names();
  page().querySelector('[data-cstatus="all"]').click(); await sleep(150);
  const q = page().querySelector('#cloud-q'); q.value = 'furis'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(150);
  out.search = names();
  const q2 = page().querySelector('#cloud-q'); q2.value = ''; q2.dispatchEvent(new Event('input', { bubbles: true })); await sleep(150);
  const by = page().querySelector('#cloud-by'); by.value = 'owner'; by.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
  out.groups = [...page().querySelectorAll('#cloud-items tr.grp')].map((g) => g.textContent.trim());
  // SEVERAL AT ONCE, up to the allowance the server states.
  allowance = { presets: 3, customs: 50 };
  await syncNow(); await sleep(300);
  const pick = (id) => { const c = page().querySelector('[data-cpick="' + id + '"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); };
  pick('t1'); pick('f1'); pick('s1');
  await sleep(150);
  page().querySelector('[data-cbulk="off"]').click(); await sleep(300);
  out.bulkOff = ['t1', 'f1'].every((id) => stored(id).cloud_sync === false);
  out.meter = (page().querySelector('.meter .of') || {}).textContent || '';
  pick('t1'); pick('t2'); pick('f1'); pick('s1');
  await sleep(150);
  const note = document.getElementById('page-note'); if (note) note.remove();
  page().querySelector('[data-cbulk="on"]').click(); await sleep(300);
  const synced = ['t1', 't2', 'f1'].filter((id) => !('cloud_sync' in stored(id)) || stored(id).cloud_sync !== false).length;
  out.capped = { synced, note: !!document.getElementById('page-note') };
  window.fetch = realFetch;
  return out;
})()`);

const ok = (x) => JSON.stringify(x);
check("the page is in the settings nav, open", r.nav === true);
check("every browser of the account is listed: this one marked, what did not sync, and why one failed",
  JSON.stringify(r.devices) === JSON.stringify([2, true, true, true]), JSON.stringify(r.devices));
check("every item, from every collection and weapon, newest first",
  ok(r.order) === ok(["crit torid", "furis one", "a crowd", "my riven", "old torid"]), ok(r.order));
check("a build opens on its weapon, by id", /^\/weapons\/Torid\?build=t1$/.test(r.link || ""), r.link);
check("nothing on the page deletes", r.deletes === false);
check("an item switches off, kept on this browser", r.off === true);
check("...and on again", r.on === true);
check("the status filter shows only what it names", ok(r.local) === ok(["old torid"]), ok(r.local));
check("the search finds by weapon", ok(r.search) === ok(["furis one"]), ok(r.search));
check("by weapon, one group per weapon", r.groups.length >= 3 && r.groups.some((g) => /^Torid|托里德/.test(g)), ok(r.groups));
check("several switch at once", r.bulkOff === true);
check("the meter states the allowance", / \/ 3/.test(r.meter), r.meter);
check("switching several on stops at the allowance, and says so", r.capped.synced === 3 && r.capped.note === true, ok(r.capped));

await app.finish("every item this browser holds is in one list, and its sync switches there");
