// ---- BUILD SYNC ------------------------------------------------------------
//
// docs/UI.md §"Build sync". What a reader saved — every preset and custom list —
// kept the same on every browser signed in to one account, entry by entry,
// matched by `id` (`mintPresetIds`). The server keeps the newest write of each
// entry and hands back everything taken since this browser last asked; this
// file decides what changed here, and folds in what changed elsewhere.
//
// localStorage stays the working copy. Signed out, or without the feature,
// nothing here runs and the page is exactly what it was.
const SYNC_KEY = "wfsim-sync";
const SYNC_PATH = "/api/cloud/sync";
/// How long after an edit it is pushed, so a burst of edits is one call.
const SYNC_DELAY_MS = 2000;
/// A return to the tab pulls at most this often.
const SYNC_IDLE_MS = 30000;
/// The server's `PUSH_MAX`.
const SYNC_CHUNK = 200;
const isSyncList = (k) => /^wfsim-(presets|customs)-/.test(k);

/// AN ENTRY STAYS ON THIS BROWSER when its `cloud_sync` is false: the reader's
/// choice (the cloud on its chip), or a new entry's default while "upload new
/// items" is off or the pool's allowance is used. Absent is synced. Saving is
/// never limited — only what the account holds.
const isCloudSynced = (p) => !!p && p.cloud_sync !== false;
const SYNC_AUTO_KEY = "wfsim-sync-auto";
const syncAuto = () => { try { return localStorage.getItem(SYNC_AUTO_KEY) !== "0"; } catch (_) { return true; } };
const setSyncAuto = (on) => { try { localStorage.setItem(SYNC_AUTO_KEY, on ? "1" : "0"); } catch (_) { /* this page only */ } };
/// WHAT THE ACCOUNT MAY HOLD, per pool, as the server last said: `{ presets,
/// customs }`, a missing pool unlimited. The server decides it; the page shows
/// it and stops asking past it.
let syncAllowance = null;
const syncPool = (list) => (list.startsWith("wfsim-customs-") ? "customs" : "presets");
/// How many of this browser's entries each pool syncs.
function syncedCounts() {
  const out = { presets: 0, customs: 0 };
  for (const { list, p } of syncLocal().values()) if (isCloudSynced(p)) out[syncPool(list)]++;
  return out;
}
const syncRoom = (pool, counts) => !syncAllowance || syncAllowance[pool] == null
  || (counts || syncedCounts())[pool] < syncAllowance[pool];
/// Set one entry's choice, in place in its list. The next round tells the
/// account; turning one on past the allowance is refused and says so.
function setCloudSync(list, id, on) {
  let ps;
  try { ps = JSON.parse(localStorage.getItem(list)); } catch (_) { return false; }
  const p = Array.isArray(ps) && ps.find((x) => x && x.id === id);
  if (!p || isCloudSynced(p) === on) return false;
  if (on && !syncRoom(syncPool(list))) {
    noteInline(tr("the account syncs {n} of these already, its allowance - turn another off, or become a member")
      .replace("{n}", syncAllowance[syncPool(list)]));
    return false;
  }
  if (on) delete p.cloud_sync; else p.cloud_sync = false;
  try { localStorage.setItem(list, JSON.stringify(ps)); } catch (_) { return false; }
  syncSoon(0);
  return true;
}
/// WHERE A PULLED ENTRY LIVES: a page from before one store per collection
/// pushed `wfsim-presets-<owner>-<domain>`, and its entry is the collection's,
/// filed under that owner unless it names its own.
function syncHome(e) {
  const o = e.body && ownerKeyed(e.list);
  if (!o) return e;
  return { ...e, list: presetListKey(o.domain), body: { ...e.body, scope: e.body.scope || o.owner } };
}

/// WHERE SYNC STANDS, for the account page: `idle` before it has run, `on`,
/// `not_included` (the account lacks the feature), `other` (this browser
/// synced with another account), `error`.
let syncStatus = { state: "idle", at: 0, full: false };
let syncTimer = null, syncRunning = null, syncQueued = null;

/// `{ account, cursor, known: { id: { list, sig, at } } }` — what this browser
/// last agreed with the server about each entry. An entry whose signature has
/// moved since is a local change; one that is gone is a local deletion.
function syncState() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY));
    if (s && typeof s === "object" && s.known) return s;
  } catch (_) { /* none */ }
  return null;
}
const saveSyncState = (s) => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch (_) { /* resent next time */ } };

/// WHAT TRAVELS is the entry less a measured result an older page left in it —
/// results are records of their own (`results`) and do not travel.
const syncBody = (p) => { const { lastResult, ...rest } = p; return rest; };
/// WHAT COUNTS AS A CHANGE: everything that travels except when it was saved,
/// which an auto-save moves without changing anything.
function syncSig(p) {
  const { lastResult, savedAt, ...rest } = p;
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36) + ":" + s.length;
}

/// Every saved entry in this browser: id → { list, p }. A read-only board row
/// is the board's, not the reader's.
function syncLocal() {
  const out = new Map();
  for (const list of Object.keys(localStorage)) {
    if (!isSyncList(list)) continue;
    let ps;
    try { ps = JSON.parse(localStorage.getItem(list)); } catch (_) { continue; }
    if (!Array.isArray(ps)) continue;
    for (const p of ps) if (p && p.id && !p.builtin && !out.has(p.id)) out.set(p.id, { list, p });
  }
  return out;
}

async function syncCall(body, keepalive) {
  try {
    const r = await fetch(SYNC_PATH, {
      method: "POST", credentials: "same-origin", keepalive: !!keepalive,
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    return j || { ok: false, reason: `http_${r.status}` };
  } catch (_) {
    return { ok: false, reason: "offline" };
  }
}

/// Soon: after an edit settles, or now with `ms = 0`.
function syncSoon(ms = SYNC_DELAY_MS) {
  if (typeof accountState === "undefined" || !accountState.account) return;
  // A STATUS IS ONE ACCOUNT'S: signing in as someone else asks again.
  if (syncStatus.account !== accountState.account.id) syncStatus = { state: "idle", at: 0, full: false, account: accountState.account.id };
  if (syncStatus.state === "not_included" || syncStatus.state === "other") return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncNow(); }, ms);
}

/// One round: push what changed here, then pull what changed elsewhere. A
/// round asked for while one runs runs once more after it.
function syncNow() {
  // A ROUND ASKED FOR WHILE ONE RUNS IS THE NEXT ONE, and what it returns is
  // that round: the one running collected its changes before this call, so
  // resolving with it would tell the caller an edit had gone when it had not.
  if (syncRunning) {
    if (!syncQueued) syncQueued = syncRunning.then(() => { syncQueued = null; return syncNow(); });
    return syncQueued;
  }
  // SYNC NEVER TAKES THE PAGE DOWN: whatever a round throws is its status.
  syncRunning = syncRound().catch((e) => setSyncStatus({ state: "error", reason: String(e && e.message || e) }))
    .finally(() => { syncRunning = null; });
  return syncRunning;
}

async function syncRound() {
  const who = accountState.account && accountState.account.id;
  if (!who) return;
  let st = syncState();
  // ANOTHER ACCOUNT'S ENTRIES ARE NOT MERGED WITHOUT A WORD: this browser
  // synced with someone else, and signing in here must not hand their builds
  // to this account. The account page offers the merge (`syncAdopt`).
  if (st && st.account && st.account !== who) { setSyncStatus({ state: "other" }); return; }
  const first = !st;
  if (first) st = { account: who, cursor: 0, known: {} };
  flushPresetSaves();

  // 1. WHAT CHANGED HERE.
  const local = syncLocal();
  const sigs = new Map();
  const changes = [];
  const now = Date.now();
  // WHAT THE ACCOUNT ALREADY HOLDS, per pool; each new entry is counted in as
  // it is taken, so the one that fills the allowance is still taken.
  const counts = { presets: 0, customs: 0 };
  for (const [id, { list, p }] of local) {
    if (st.known[id] && !st.known[id].off && isCloudSynced(p)) counts[syncPool(list)]++;
  }
  for (const [id, { list, p }] of local) {
    // A NEW ENTRY TAKES THE DEFAULT: synced, unless "upload new items" is off
    // or its pool's allowance is used — then it stays here, and says so.
    if (!st.known[id] && p.cloud_sync === undefined) {
      if (!syncAuto() || !syncRoom(syncPool(list), counts)) {
        setCloudSync(list, id, false);
        p.cloud_sync = false;
      } else counts[syncPool(list)]++;
    }
    if (!isCloudSynced(p)) {
      // TAKEN OFF THE ACCOUNT: the others keep their copy and stop syncing it,
      // told by a body that says only that. Nothing of it travels.
      const k = st.known[id];
      if (k && !k.off) changes.push({ id, list, body: { id, cloud_sync: false }, updated_at: Math.max(now, k.at + 1), off: true });
      continue;
    }
    const sig = syncSig(p);
    sigs.set(id, sig);
    const k = st.known[id];
    if (k && k.sig === sig && k.list === list) continue;
    // WHEN IT CHANGED: its own save time when that moved past what the server
    // has, and otherwise now — a rename moves no save time and must still win.
    // AND ALWAYS AFTER THE VERSION IT CHANGED: the server keeps a tie, so an
    // edit stamped in the same millisecond as the last agreed write was lost.
    const seen = p.savedAt && (!k || p.savedAt > k.at) ? Math.min(p.savedAt, now) : now;
    const at = k ? Math.max(seen, k.at + 1) : seen;
    changes.push({ id, list, body: syncBody(p), updated_at: at, sig });
  }
  for (const [id, k] of Object.entries(st.known)) {
    if (!local.has(id)) changes.push({ id, list: k.list, deleted: true, updated_at: now });
  }

  // 2. PUSH, in chunks the server takes.
  for (let i = 0; i < changes.length; i += SYNC_CHUNK) {
    const chunk = changes.slice(i, i + SYNC_CHUNK);
    const r = await syncCall({ changes: chunk.map(({ sig, off, ...c }) => c), pull: false });
    if (!r.ok) return syncRefused(r);
    syncAllowance = r.allowance || null;
    if (r.full) syncStatus.full = true;
    for (const c of chunk) {
      if (c.deleted) delete st.known[c.id];
      else if (c.off) st.known[c.id] = { list: c.list, off: true, at: c.updated_at };
      else st.known[c.id] = { list: c.list, sig: c.sig, at: c.updated_at };
    }
    saveSyncState(st);
  }

  // 3. PULL, every page.
  const pulled = [];
  let r = await syncCall({ since: st.cursor });
  if (!pulledPage(r)) return syncRefused(r);
  syncAllowance = r.allowance || null;
  pulled.push(...r.entries);
  let cursor = r.cursor;
  while (r.next) {
    r = await syncCall({ after: r.next });
    if (!pulledPage(r)) return syncRefused(r);
    pulled.push(...r.entries);
    cursor = Math.max(cursor, r.cursor);
  }
  const applied = syncApply(st, pulled, sigs);
  st.cursor = Math.max(st.cursor || 0, cursor || 0);
  saveSyncState(st);
  const added = first ? changes.filter((c) => !c.deleted).length : 0;
  setSyncStatus({ state: "on", at: Date.now() });
  if (added) presetToast(tr("{n} saved items from this browser were added to your account").replace("{n}", added));
  if (applied) syncShow(applied);
}

/// A page the server sent, in the shape a pull reads — or a refusal.
const pulledPage = (r) => !!(r && r.ok && Array.isArray(r.entries));

function syncRefused(r) {
  if (r.reason === "not_included") setSyncStatus({ state: "not_included" });
  else if (r.reason === "not_signed_in") setSyncStatus({ state: "idle" });
  else setSyncStatus({ state: "error", reason: (r && r.reason) || "bad_reply" });
}

/// FOLD IN WHAT CHANGED ELSEWHERE. The server's copy wins over this browser's
/// last agreed one — both pushes have landed, so what comes back IS the newest
/// — except where this browser edited the entry while the round was running:
/// that edit is newer still, and the next round pushes it. Returns what it
/// changed, for `syncShow`, or null.
function syncApply(st, entries, sigs) {
  if (!entries.length) return null;
  const lists = new Map();
  const listOf = (k) => {
    if (!lists.has(k)) {
      let ps = [];
      try { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) ps = v; } catch (_) { /* empty */ }
      lists.set(k, ps);
    }
    return lists.get(k);
  };
  const changedLists = new Set(), ids = new Set(), removed = new Set();
  const current = syncLocal();
  for (const pulled of entries) {
    const e = syncHome(pulled);
    const here = current.get(e.id);
    if (sigs.has(e.id) && (!here || syncSig(here.p) !== sigs.get(e.id))) continue;
    if (e.body === null) {
      if (here) {
        const ps = listOf(here.list);
        const at = ps.findIndex((p) => p && p.id === e.id);
        if (at >= 0) { removed.add(e.id); ps.splice(at, 1); changedLists.add(here.list); ids.add(e.id); }
      }
      delete st.known[e.id];
      continue;
    }
    // ANOTHER BROWSER TOOK IT OFF THE ACCOUNT: this copy stays, and stops syncing.
    if (e.body.cloud_sync === false) {
      st.known[e.id] = { list: e.list, off: true, at: e.updated_at };
      if (here && isCloudSynced(here.p)) {
        const ps = listOf(here.list);
        const at = ps.findIndex((p) => p && p.id === e.id);
        if (at >= 0) { ps[at] = { ...ps[at], cloud_sync: false }; changedLists.add(here.list); ids.add(e.id); }
      }
      continue;
    }
    const sig = syncSig(e.body);
    st.known[e.id] = { list: e.list, sig, at: e.updated_at };
    if (here && here.list === e.list && syncSig(here.p) === sig) continue;
    if (here && here.list !== e.list) {
      const old = listOf(here.list);
      const at = old.findIndex((p) => p && p.id === e.id);
      if (at >= 0) { old.splice(at, 1); changedLists.add(here.list); }
    }
    const ps = listOf(e.list);
    const at = ps.findIndex((p) => p && p.id === e.id);
    const mine = at >= 0 ? ps[at] : null;
    if (at >= 0) ps[at] = e.body; else ps.push(e.body);
    changedLists.add(e.list);
    ids.add(e.id);
  }
  // TWO ENTRIES MAY SHARE A NAME: everything points at an id, so nothing is
  // renamed on the way in.
  for (const k of changedLists) {
    try { localStorage.setItem(k, JSON.stringify(lists.get(k))); }
    catch (_) { noteInline(tr("this browser's storage is full - the change is on screen but was not saved")); }
  }
  return changedLists.size ? { lists: changedLists, ids, removed } : null;
}

/// MAKE THE PAGE SHOW IT, through the same trio undo restores through
/// (`presetDoc`). An undo step taken before a list changed underneath it would
/// write the old list back and push it, so those steps go.
function syncShow({ lists, ids, removed }) {
  undoStack = undoStack.filter((s) => !lists.has(presetListKey(s.domain, s.weapon)));
  redoStack = redoStack.filter((s) => !lists.has(presetListKey(s.domain, s.weapon)));
  for (const { domain: d } of COLLECTIONS) {
    const w = undoOwner(d);
    const doc = presetDoc(d);
    if (!doc || !lists.has(presetListKey(d, w))) continue;
    const list = loadPresetList(d, w);
    const act = doc.active() || "";
    const cur = list.find((p) => presetId(p) === act);
    whileApplying(() => {
      if (cur && ids.has(cur.id)) doc.apply(cur.state);
      else if (!cur && removed.has(act) && list[0]) { doc.setActive(presetId(list[0])); doc.apply(list[0].state); }
    });
    doc.rerender();
  }
  // THE BUILD A LINK WAS WAITING FOR, now that it is here.
  const want = buildWanted && buildWanted.weapon === presetWeapon()
    && loadPresetList(BUILDS).find((p) => p.id === buildWanted.id);
  if (want) {
    buildWanted = null;
    pickPreset(buildBarCfg(), presetId(want));
  }
}

function setSyncStatus(s) {
  syncStatus = { ...syncStatus, ...s };
  if (typeof renderSyncStatus === "function") renderSyncStatus();
}

/// "ADD THEM TO THIS ACCOUNT": the one way another account's entries become
/// this one's — what this browser holds is pushed as new, and nothing of the
/// other account is touched.
function syncAdopt() {
  try { localStorage.removeItem(SYNC_KEY); } catch (_) { /* nothing to forget */ }
  setSyncStatus({ state: "idle" });
  return syncNow();
}

// WHEN: an edit (`storePresetList`), signing in (`loadAccount`), coming back to
// the tab, and leaving it with an edit not yet pushed.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - (syncStatus.at || 0) > SYNC_IDLE_MS) syncSoon(0);
});
window.addEventListener("pagehide", () => {
  if (!syncTimer) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  const st = syncState();
  if (!st || !accountState.account || st.account !== accountState.account.id) return;
  const changes = [];
  for (const [id, { list, p }] of syncLocal()) {
    const k = st.known[id];
    if (!isCloudSynced(p)) continue;
    if (!k || k.sig !== syncSig(p) || k.list !== list) changes.push({ id, list, body: syncBody(p), updated_at: Date.now() });
  }
  // A PAGE ON ITS WAY OUT GETS ONE SMALL CALL: `keepalive` carries 64 KB, and
  // what does not fit is pushed the next time this browser opens the site.
  const body = { changes: changes.slice(0, SYNC_CHUNK), pull: false };
  if (changes.length && JSON.stringify(body).length < 60000) syncCall(body, true);
});
