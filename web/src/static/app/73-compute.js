// SPDX-License-Identifier: AGPL-3.0-or-later
/// THE COMPUTE PAGE (`/compute`) — what this browser is doing for WFSim's free
/// services and what it did, and, signed in, every device of the account
/// (docs/BOARD.md §"Contribution"). This browser's task list lives in this
/// browser alone and is never sent. A task is drawn by its KIND
/// (`COMPUTE_KINDS`), which names it from public facts only — a board order is a
/// weapon, a ruler and a mode, never its mods or who submitted it — so a new
/// kind of work adds an entry there and nothing on the page.
const COMPUTE_LOG_KEY = "wfsim-compute-log";
const COMPUTE_LOG_MAX = 50;
/// The task this browser is on: `{ kind, ...facts, started, done, total }`.
let computeNow = null;
let computeEditing = null;
let computeRemoving = null;
let computeDrawnAt = 0;

const COMPUTE_KINDS = {
  board: {
    name: "Leaderboard order",
    what: (t) => {
      const w = META && (META.weapons || []).find((x) => x.id === t.weapon);
      const b = META && (META.benchmarks || []).find((x) => x.id === t.ruler);
      return [w ? w.name : t.weapon, b ? tr(b.name) : t.ruler, t.mode && t.mode !== "base" && w ? modeLabel(w, t.mode) : ""]
        .filter(Boolean).join(" · ");
    },
    href: (t) => (META && t.weapon ? `${weaponPath(t.weapon)}?bench=${encodeURIComponent(t.ruler)}` : null),
  },
  // A RIVEN GAIN someone asked about in a chat: the weapon and the ruler, never
  // the card's rolls or who asked.
  riven_gain: {
    name: "Riven gain",
    what: (t) => {
      const w = META && (META.weapons || []).find((x) => x.id === t.weapon);
      const b = META && (META.benchmarks || []).find((x) => x.id === t.ruler);
      return [w ? w.name : t.weapon, b ? tr(b.name) : t.ruler].filter(Boolean).join(" · ");
    },
    href: () => null,
  },
};
const computeKind = (t) => COMPUTE_KINDS[t && t.kind] || { name: "Task", what: () => "", href: () => null };

function computeLog() {
  try {
    const l = JSON.parse(localStorage.getItem(COMPUTE_LOG_KEY) || "[]");
    return Array.isArray(l) ? l : [];
  } catch (_) { return []; }
}
/// A TASK BEGUN, advanced and ended — called by whatever does the work.
function computeStart(task) {
  computeNow = { ...task, started: Date.now(), done: 0, total: 0 };
  computeRedraw();
}
function computeProgress(done, total) {
  if (computeNow) { computeNow.done = done; computeNow.total = total; }
  computeRedraw(true);
}
function computeEnd(result) {
  const t = computeNow;
  computeNow = null;
  if (t && result) {
    const { done: _d, total: _t, started: _s, ...facts } = t;
    const entry = { ...facts, at: Date.now(), ms: result.ms, work: result.work };
    try { localStorage.setItem(COMPUTE_LOG_KEY, JSON.stringify([entry, ...computeLog()].slice(0, COMPUTE_LOG_MAX))); } catch (_) { /* this page only */ }
  }
  computeRedraw();
}
/// Drawn again while the page is open — a progress tick at most once a second.
function computeRedraw(tick) {
  if (typeof authKindOf !== "function" || authKindOf(location.pathname) !== "compute") return;
  if (tick && Date.now() - computeDrawnAt < 1000) return;
  computeDrawnAt = Date.now();
  renderAuthPage("compute");
}

/// WHAT A DEVICE IS CALLED until its owner names it: the coarse family of its
/// system and browser, read from the browser itself.
function computeDeviceGuess() {
  const ua = navigator.userAgent || "";
  const os = /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux" : tr("Computer");
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}
const computeOwnId = () => { try { return (localStorage.getItem(VERIFIER_KEY) || "").slice(0, 6); } catch (_) { return ""; } };

const computeAgo = (iso) => {
  const t = typeof iso === "number" ? iso : Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return tr("just now");
  if (m < 60) return tr("{n} min ago").replace("{n}", String(m));
  if (m < 48 * 60) return tr("{n} h ago").replace("{n}", String(Math.floor(m / 60)));
  return new Date(t).toLocaleDateString(accountLocale());
};
const computeTook = (ms) => (ms < 60000 ? tr("{n} s").replace("{n}", String(Math.max(1, Math.round(ms / 1000))))
  : tr("{n} min").replace("{n}", String(Math.round(ms / 60000))));
const computePts = (n) => escHtml(Number(n || 0).toLocaleString(accountLocale()));
function computeTaskHtml(t) {
  const k = computeKind(t);
  const what = escHtml(k.what(t));
  const href = k.href(t);
  return `${escHtml(tr(k.name))}${what ? ` · ${href ? `<a href="${escHtml(href)}">${what}</a>` : what}` : ""}`;
}

/// THIS BROWSER: whether it computes and why not, what it is on, what it earned.
function computeHereHtml() {
  const on = boardVerifyOn();
  const state = !WASM ? tr("This copy of WFSim does not compute; the site at wfsim.app does.")
    : onPhone() ? tr("Phones never compute.")
    : !on ? tr("Computing is off in this browser.")
    : boardStale ? tr("A new version is out; this page refreshes itself once it is left idle.")
    : computeNow ? tr("Computing now.")
    : foregroundHeld > 0 ? tr("Paused while you use the calculator.")
    : tr("Waiting for the next task.");
  const flip = WASM && !onPhone()
    ? ` <button class="ghost-btn btn-sm" data-auth="compute-flip">${aT(on ? "stop computing" : "start computing")}</button>` : "";
  const again = on && boardStale ? ` <button class="ghost-btn btn-sm" data-auth="compute-reload">${aT("refresh now")}</button>` : "";
  const n = computeNow;
  const pct = n && n.total ? Math.round((100 * n.done) / n.total) : 0;
  const now = n ? `<div class="kv"><dt>${aT("Now")}</dt><dd>${computeTaskHtml(n)} · ${escHtml(computeTook(Date.now() - n.started))}
      <div style="height:4px;border-radius:2px;background:var(--line);margin-top:6px"><div style="height:4px;border-radius:2px;background:var(--accent);width:${pct}%"></div></div></dd></div>` : "";
  const d = devicePoints;
  const pts = d ? `<div class="kv"><dt>${aT("Points")}</dt><dd>${computePts(d.points)} · ${
    escHtml(tr("{n} in the last 30 days").replace("{n}", Number(d.recent || 0).toLocaleString(accountLocale())))}${
    accountState.account ? "" : ` · <a href="/login?return=${encodeURIComponent("/compute")}">${aT("Sign in to count it under your name")}</a>`}</dd></div>` : "";
  return `<div class="block"><div class="bh"><h2>${aT("This browser")}</h2></div><div class="bb"><dl class="kvs">
    <div class="kv"><dt>${aT("State")}</dt><dd>${escHtml(state)}</dd>${flip}${again}</div>${now}${pts}</dl></div></div>`;
}

/// EVERY DEVICE OF THE ACCOUNT — the server's word on what each last did and
/// holds now, named as its owner calls it; this browser marked.
function computeDevicesHtml() {
  if (!accountState.providers.length) return "";
  if (!accountState.account) {
    return `<div class="block"><div class="bh"><h2>${aT("Your devices")}</h2></div><div class="bb"><p class="set-note" style="margin:0">${
      aT("Signed in, every computer you leave computing shows here together, and its work counts under your name.")}
      <a href="/login?return=${encodeURIComponent("/compute")}">${aT("Sign in")}</a></p></div></div>`;
  }
  const s = devicesState;
  if (!s) return "";
  const own = computeOwnId();
  const rows = s.devices.map((d) => {
    const name = d.label || tr("Device {id}").replace("{id}", d.id);
    const here = d.id === own ? ` <span class="set-note">${aT("(this browser)")}</span>` : "";
    const status = d.now ? `${aT("Computing")}: ${computeTaskHtml(d.now)}`
      : d.last_at ? escHtml(tr("Last answered {when}").replace("{when}", computeAgo(d.last_at))) : aT("Nothing computed yet");
    const pts = `${computePts(d.points)} · ${escHtml(tr("{n} in the last 30 days").replace("{n}", Number(d.recent || 0).toLocaleString(accountLocale())))}`;
    if (computeEditing === d.id) {
      return `<div class="kv"><dt><input id="device-label" maxlength="40" value="${escHtml(d.label || computeDeviceGuess())}"></dt><dd></dd>
        <button class="ghost-btn btn-sm" data-auth="device-rename-save" data-id="${d.id}">${aT("Save")}</button>
        <button class="ghost-btn btn-sm" data-auth="device-rename-cancel">${aT("Cancel")}</button></div>`;
    }
    if (computeRemoving === d.id) {
      return `<div class="kv"><dt>${escHtml(name)}</dt><dd>${aT("Remove it? Its points leave your account, and it computes for nobody until it is claimed again.")}</dd>
        <button class="btn-danger btn-sm" data-auth="device-remove-confirm" data-id="${d.id}">${aT("Remove")}</button>
        <button class="ghost-btn btn-sm" data-auth="device-remove-cancel">${aT("Cancel")}</button></div>`;
    }
    return `<div class="kv"><dt>${escHtml(name)}${here}</dt><dd>${status}<br><span class="set-note">${pts}</span></dd>
      <button class="ghost-btn btn-sm" data-auth="device-rename" data-id="${d.id}">${aT("Rename")}</button>
      <button class="ghost-btn btn-sm" data-auth="device-remove" data-id="${d.id}">${aT("Remove")}</button></div>`;
  }).join("");
  const total = `${computePts(s.points)} · ${escHtml(tr("{n} in the last 30 days").replace("{n}", Number(s.recent || 0).toLocaleString(accountLocale())))}`;
  return `<div class="block"><div class="bh"><h2>${aT("Your devices")}</h2></div><div class="bb">${rows
    ? `<dl class="kvs">${rows}</dl><p class="set-note" style="margin:8px 0 0">${aT("All together")}: ${total}</p>`
    : `<p class="set-note" style="margin:0">${aT("No device yet: leave WFSim open on a computer while you are signed in.")}</p>`}</div></div>`;
}

/// WHAT THIS BROWSER DID, newest first, with the points each will add once
/// another computer's answer agrees.
function computeRecentHtml() {
  const log = computeLog();
  const rows = log.map((t) => `<div class="kv"><dt>${computeTaskHtml(t)}</dt>
      <dd>${escHtml(computeAgo(t.at))} · ${escHtml(computeTook(t.ms || 0))}</dd>
      <span>≈ ${escHtml((Number(t.work || 0) / 1e9).toFixed(1))}</span></div>`).join("");
  return `<div class="block"><div class="bh"><h2>${aT("Recent tasks on this browser")}</h2></div><div class="bb">${rows
    ? `<dl class="kvs">${rows}</dl><p class="set-note" style="margin:8px 0 0">${aT("A task's points count once another computer's answer agrees with it. This list stays in this browser.")}</p>`
    : `<p class="set-note" style="margin:0">${aT("Nothing yet.")}</p>`}</div></div>`;
}

function computePage() {
  return `<div class="settings"><div class="set-main"><h1 class="page">${aT("Compute")}</h1>
    <p class="set-note">${aT("What this browser computes is free for everyone, never sold, and never runs a paid feature. It runs only while a WFSim page is open on a computer, steps aside the moment you run something yourself, never runs on a phone, and one click turns it off.")}
      <a href="/contributors">${aT("Contributors")}</a></p>
    ${computeHereHtml()}${computeDevicesHtml()}${computeRecentHtml()}</div></div>`;
}

/// DRAWN: this browser's points asked, the account's devices asked once per
/// account however the reader arrived — signing in on this page included — and
/// again every half minute while the page stays open, and a device claimed
/// before it had a name given its guess. Cheap when called again, which every
/// redraw does.
let computeTimer = null;
let computeAskedFor = null;
function computeOpened() {
  loadDevicePoints();
  const who = accountState.account && accountState.account.id;
  if (who && computeAskedFor !== who) { computeAskedFor = who; computeRefresh(); }
  if (!computeTimer) computeTimer = setInterval(computeRefresh, 30000);
}
async function computeRefresh() {
  if (authKindOf(location.pathname) !== "compute") { clearInterval(computeTimer); computeTimer = null; computeAskedFor = null; return; }
  if (!accountState.account) return;
  await loadDevices();
  const own = computeOwnId();
  const mine = devicesState && devicesState.devices.find((d) => d.id === own && !d.label);
  if (mine) {
    await accountCall("POST", "/api/account/devices/label", { id: own, label: computeDeviceGuess() });
    await loadDevices();
  }
  computeRedraw();
}

/// THE PAGE'S BUTTONS, through the account pages' one click handler.
async function computeAct(el, what) {
  const id = el.dataset.id;
  if (what === "compute-flip") setBoardVerify(!boardVerifyOn());
  else if (what === "compute-reload") return reloadForRelease();
  else if (what === "device-rename") computeEditing = id;
  else if (what === "device-rename-cancel" || what === "device-remove-cancel") { computeEditing = null; computeRemoving = null; }
  else if (what === "device-remove") computeRemoving = id;
  else if (what === "device-rename-save") {
    const v = ($("device-label") || {}).value || "";
    const r = await accountCall("POST", "/api/account/devices/label", { id, label: v });
    if (!(r && r.ok)) { presetToast(tr("That name cannot be used.")); return; }
    computeEditing = null;
    await loadDevices();
  } else if (what === "device-remove-confirm") {
    const r = await accountCall("POST", "/api/account/devices/remove", { id });
    if (r && r.ok) { computeRemoving = null; await loadDevices(); }
  }
  renderAuthPage("compute");
}
