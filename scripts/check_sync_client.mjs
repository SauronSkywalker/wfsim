/// BUILD SYNC, THE PAGE'S HALF: two browsers of one account end on the same
/// entries (docs/UI.md §"Build sync").
///
/// The server is faked inside the page with the rules the real one keeps — the
/// newer write wins, a deletion is an entry with no body, pages by cursor — and
/// a second browser is this one with its storage swapped. What it holds: the
/// first sync is a union, two entries sharing a name both survive under it, an
/// edit and a deletion reach the other browser, the measured result never travels, another account's entries are
/// not merged without a word, an account without the feature pushes nothing,
/// and a remote edit to the build on screen reaches the screen.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000 });
const { evaluate, check } = app;

const r = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const L = 'wfsim-presets-builder-builds';
  const st = (mod) => buildState('torid', { evoSel: {}, arcane: ['none'], arcaneRank: [null],
    slots: [{ mod, rank: mod ? 0 : null }], mode: null, valence: null, assembly: null, wielder: null });
  // THE FAKE SERVER: per account, id -> { list, body, updated_at, synced_at }.
  const srv = { acc1: new Map(), acc2: new Map() };
  window.__b1Pushes = [];
  let clock = 1, who = 'acc1', calls = 0, allowance = null;
  const realFetch = window.fetch;
  window.fetch = async (url, o = {}) => {
    const path = String(url);
    const reply = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/api/account') return reply({ ok: true, providers: ['email'],
      account: { id: who, created_at: '', identities: [{ provider: 'email', label: who + '@x' }] } });
    if (path !== '/api/cloud/sync') return realFetch(url, o);
    calls++;
    if (who === 'acc3') return reply({ ok: false, reason: 'not_included' }, 403);
    const b = JSON.parse(o.body || '{}');
    const db = srv[who];
    for (const c of b.changes || []) {
      if (c.id === 'b1') window.__b1Pushes.push({ at: c.updated_at, mod: c.body && c.body.state && c.body.state.slots[0].mod, name: c.body && c.body.name });
      const had = db.get(c.id);
      if (had && !(c.updated_at > had.updated_at)) continue;
      db.set(c.id, { list: c.list, body: c.deleted ? null : JSON.parse(JSON.stringify(c.body)), updated_at: c.updated_at, synced_at: clock++ });
    }
    const allow = allowance ? { allowance } : {};
    if (b.pull === false) return reply({ ok: true, full: false, ...allow });
    const since = b.after ? b.after.t : (b.since || 0);
    const rows = [...db.entries()].filter(([, e]) => e.synced_at > since).sort((a, b) => a[1].synced_at - b[1].synced_at);
    const page = rows.slice(0, 2);
    const last = page[page.length - 1];
    return reply({ ok: true, full: false, ...allow,
      entries: page.map(([id, e]) => ({ id, ...e })),
      next: rows.length > 2 ? { t: last[1].synced_at, i: last[0] } : null,
      cursor: last ? last[1].synced_at : (b.since || 0) });
  };
  const signIn = async (id) => { who = id; await loadAccount(); clearTimeout(syncTimer); syncTimer = null; await syncNow(); };
  const builds = () => JSON.parse(localStorage.getItem(L) || '[]');
  const names = () => builds().map((p) => p.id + '=' + p.name).sort();
  const serverNames = () => [...srv.acc1.entries()].filter(([, e]) => e.body && e.list === L).map(([id, e]) => id + '=' + e.body.name).sort();
  // A SECOND BROWSER IS THIS ONE WITH ITS STORAGE SWAPPED, so nothing of the
  // page's own may cross a swap: its sync timer is cleared, any round it started
  // is waited out, and an edit waiting to be saved — the editor's state from
  // the browser being left — is dropped rather than written over the other's.
  const quiet = async () => {
    clearTimeout(syncTimer); syncTimer = null;
    while (syncRunning || syncQueued) await (syncQueued || syncRunning);
    for (const k of [...pendingSaves.keys()]) dropSave(k);
  };
  const keep = async () => { await quiet(); return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('wfsim-')).map((k) => [k, localStorage.getItem(k)])); };
  const become = async (snap) => { await quiet(); localStorage.clear(); for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v); };
  const out = {};

  // BROWSER A: one build, with a measured result an older page left in it.
  localStorage.clear();
  localStorage.setItem(L, JSON.stringify([{ id: 'a1', scope: 'torid', name: 'preset 1', savedAt: 5, state: st('serration'),
    lastResult: { at: 1, r: { dps: 1 } } }]));
  await signIn('acc1');
  out.aPushed = serverNames();
  out.noResult = !('lastResult' in (srv.acc1.get('a1') || {}).body);
  out.statusOn = syncStatus.state;
  const A = await keep();

  // BROWSER B: its own "preset 1".
  localStorage.clear();
  localStorage.setItem(L, JSON.stringify([{ id: 'b1', scope: 'torid', name: 'preset 1', savedAt: 6, state: st('split_chamber') }]));
  await signIn('acc1');
  out.bAfterFirst = names();
  await syncNow();
  out.serverAfterB = serverNames();
  const B = await keep();

  // BACK ON A: it takes B's build, under the name B settled on.
  await become(A);
  await syncNow();
  out.aAfterB = names();

  // A DELETES ITS BUILD; B EDITS ITS OWN.
  localStorage.setItem(L, JSON.stringify(builds().filter((p) => p.id !== 'a1')));
  await syncNow();
  const A2 = await keep();
  await become(B);
  const bl = builds();
  const b1 = bl.find((p) => p.id === 'b1');
  const kb = (JSON.parse(localStorage.getItem('wfsim-sync') || '{}').known || {}).b1 || {};
  out.bBefore = { known_at: kb.at, savedAt: b1.savedAt, name: b1.name, pushes: window.__b1Pushes.length };
  // IN THE SAME MILLISECOND as the version this browser last agreed on, which
  // the server keeps on a tie: the edit must still be the newer write.
  const realNow = Date.now;
  Date.now = () => kb.at;
  b1.state = st('hornet_strike'); b1.savedAt = kb.at;
  localStorage.setItem(L, JSON.stringify(bl));
  await quiet();
  try { await syncNow(); } finally { Date.now = realNow; }
  out.bAfterDelete = names();
  await become(A2);
  await syncNow();
  out.aSeesEdit = ((builds().find((p) => p.id === 'b1') || {}).state || {}).slots?.[0]?.mod || null;
  const sb = srv.acc1.get('b1') || {};
  const ka = (JSON.parse(localStorage.getItem('wfsim-sync') || '{}').known || {}).b1 || {};
  out.editWhy = { server: sb.body && sb.body.state.slots[0].mod, server_at: sb.updated_at, synced_at: sb.synced_at,
    b_before: out.bBefore, pushes: window.__b1Pushes, a_known_at: ka.at, a_cursor: JSON.parse(localStorage.getItem('wfsim-sync') || '{}').cursor, clock };

  // A REMOTE EDIT TO THE BUILD ON SCREEN REACHES THE SCREEN.
  history.pushState({}, '', '/weapons/Torid'); route(); await sleep(3000);
  const onScreen = builds().find((p) => p.id === 'b1');
  if (onScreen) pickPreset(buildBarCfg(), onScreen.name);
  await sleep(600);
  const cur = srv.acc1.get('b1');
  srv.acc1.set('b1', { ...cur, body: { ...cur.body, state: st('vital_sense'), savedAt: Date.now() }, updated_at: Date.now(), synced_at: clock++ });
  await syncNow(); await sleep(600);
  out.screen = (slots[0] || {}).mod || null;

  // A LINK TO A BUILD THIS BROWSER DOES NOT HOLD YET opens it once the sync brings it —
  // pushed by a page from before one store per collection, under its weapon's own list.
  srv.acc1.set('zz1', { list: 'wfsim-presets-torid-builder-builds', body: { id: 'zz1', name: 'from an agent', savedAt: Date.now(), state: st('point_strike') },
    updated_at: Date.now(), synced_at: clock++ });
  // Arriving from elsewhere, as a link does: a weapon is opened, not re-shown.
  history.pushState({}, '', '/weapons/Braton'); route(); await sleep(2500);
  history.pushState({}, '', '/weapons/Torid?build=zz1'); route(); await sleep(3000);
  out.linkBefore = activePreset;
  await syncNow(); await sleep(800);
  out.linkAfter = activePreset;
  out.linkScreen = (slots[0] || {}).mod || null;

  // THE CLOUD ON A CHIP. Off keeps this copy and tells the other browsers to
  // keep theirs, with a body that carries nothing of the build.
  await quiet();
  renderPresetBar();
  const cloudOf = (id) => document.querySelector('#preset-bar-builder-builds .pcloud[data-cloud="' + id + '"]');
  out.markShown = !!cloudOf('b1') && cloudOf('b1').classList.contains('on');
  if (cloudOf('b1')) cloudOf('b1').click();
  await quiet(); await syncNow();
  const sOff = (srv.acc1.get('b1') || {}).body || {};
  out.offHere = (builds().find((p) => p.id === 'b1') || {}).cloud_sync === false && !!cloudOf('b1') && !cloudOf('b1').classList.contains('on');
  out.offServer = sOff.cloud_sync === false && !('state' in sOff) && !('name' in sOff);
  const X = await keep();
  await become(B);
  await syncNow();
  const bb1 = builds().find((p) => p.id === 'b1') || {};
  out.otherKept = bb1.cloud_sync === false && !!bb1.state && !!bb1.name;
  // ON AGAIN, the whole entry travels.
  await become(X);
  renderPresetBar();
  if (cloudOf('b1')) cloudOf('b1').click();
  await quiet(); await syncNow();
  out.onAgain = !!(((srv.acc1.get('b1') || {}).body || {}).state);
  // "UPLOAD NEW ITEMS" OFF: a new entry stays here.
  setSyncAuto(false);
  const add = (id) => localStorage.setItem(L, JSON.stringify(builds().concat([{ id, scope: 'torid', name: id, savedAt: Date.now(), state: st('serration') }])));
  add('n1');
  await syncNow();
  out.autoOff = (builds().find((p) => p.id === 'n1') || {}).cloud_sync === false && !srv.acc1.has('n1');
  setSyncAuto(true);
  // THE ALLOWANCE THE SERVER STATES: the entry that fills it is taken, the one
  // past it stays here, and turning one on past it is refused out loud.
  allowance = { presets: syncedCounts().presets + 1 };
  await syncNow();
  add('n2'); add('n3');
  await syncNow();
  out.allowance = [srv.acc1.has('n2'), (builds().find((p) => p.id === 'n3') || {}).cloud_sync === false, srv.acc1.has('n3')];
  const note = document.getElementById('page-note'); if (note) note.remove();
  out.refused = setCloudSync(L, 'n1', true) === false && !!document.getElementById('page-note');
  allowance = null;

  // ANOTHER ACCOUNT: nothing merged until asked.
  await signIn('acc2');
  out.otherStatus = syncStatus.state;
  out.acc2Before = srv.acc2.size;
  await syncAdopt();
  out.acc2After = srv.acc2.size;

  // AN ACCOUNT WITHOUT THE FEATURE pushes nothing, and says so.
  localStorage.removeItem('wfsim-sync');
  const before = calls;
  await signIn('acc3');
  out.notIncluded = syncStatus.state;
  out.acc3Calls = calls - before;
  window.fetch = realFetch;
  return out;
})()`);

const ok = (x) => JSON.stringify(x);
check("the first browser's build reaches the server", ok(r.aPushed) === ok(["a1=preset 1"]), ok(r.aPushed));
check("...without its measured result", r.noResult === true);
check("...and sync reads as on", r.statusOn === "on", r.statusOn);
check("a second browser's first sync is a union, and two builds keep the one name they share",
  ok(r.bAfterFirst) === ok(["a1=preset 1", "b1=preset 1"]), ok(r.bAfterFirst));
check("...and the rename is pushed, so the server agrees", ok(r.serverAfterB) === ok(r.bAfterFirst), ok(r.serverAfterB));
check("the first browser ends on the same two names", ok(r.aAfterB) === ok(r.bAfterFirst), ok(r.aAfterB));
check("a deletion on one browser reaches the other", ok(r.bAfterDelete) === ok(["b1=preset 1"]), ok(r.bAfterDelete));
check("an edit on one browser reaches the other, even in the millisecond of the last agreed write", r.aSeesEdit === "hornet_strike", ok([r.aSeesEdit, r.editWhy]));
check("a remote edit to the build on screen reaches the screen", r.screen === "vital_sense", r.screen);
check("a link to a saved build not here yet opens it once the sync brings it",
  r.linkBefore !== "zz1" && r.linkAfter === "zz1" && r.linkScreen === "point_strike",
  ok([r.linkBefore, r.linkAfter, r.linkScreen]));
check("a signed-in chip carries its cloud, filled", r.markShown === true);
check("...a click keeps the entry on this browser only", r.offHere === true);
check("...and the account is told with a body that carries nothing of the build", r.offServer === true);
check("another browser keeps its copy, and stops syncing it", r.otherKept === true);
check("on again, the whole entry travels", r.onAgain === true);
check("with \"upload new items\" off, a new entry stays on this browser", r.autoOff === true);
check("the entry that fills the allowance is taken, the one past it stays here",
  ok(r.allowance) === ok([true, true, false]), ok(r.allowance));
check("...and turning one on past it is refused, out loud", r.refused === true);
check("another account's entries are not merged without a word",
  r.otherStatus === "other" && r.acc2Before === 0, ok([r.otherStatus, r.acc2Before]));
check("...until the reader adds them", r.acc2After > 0, r.acc2After);
check("an account without the feature says so, and pushes nothing more",
  r.notIncluded === "not_included" && r.acc3Calls === 1, ok([r.notIncluded, r.acc3Calls]));

await app.finish("two browsers of one account end on the same entries");
