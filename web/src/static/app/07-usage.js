// ---- USAGE ------------------------------------------------------------------
//
// WHAT READERS DID, one point per thing, to `POST /api/e` (worker/index.js
// §USAGE). Everything is computed on the device, so this is the only way the
// site learns whether a visit produced a result. docs/ANALYTICS.md.

/// THE LIVE SITE, and the desktop shell that serves the same files. A dev
/// server or a check (127.0.0.1) is neither, so no test ever reaches a live
/// store — the short-link store and this one both ask here.
const LIVE_ORIGIN = "https://wfsim.app";
const LIVE_HOSTS = ["wfsim.app", "wfsim.localhost"];

/// A random id per browser, and nothing else about the reader. Clearable like
/// every other `wfsim-*` key; a browser that cannot store one gets one per page.
const USAGE_CID = "wfsim-cid";
let usageCid = null;
function usageVisitor() {
  if (usageCid) return usageCid;
  try { usageCid = localStorage.getItem(USAGE_CID); } catch (_) { /* private mode */ }
  if (!/^[0-9a-f]{32}$/.test(usageCid || "")) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    usageCid = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem(USAGE_CID, usageCid); } catch (_) { /* per page, then */ }
  }
  return usageCid;
}

/// THE READER'S OWN SWITCH, on /support beside what is counted. Browser storage,
/// so a browser that cannot keep it is counted — and says so by showing the id.
const USAGE_OFF = "wfsim-usage-off";
const usageOff = () => { try { return localStorage.getItem(USAGE_OFF) === "1"; } catch (_) { return false; } };

/// /support's "what is counted": this browser's id, and the switch.
function renderUsageNote() {
  const id = $("usage-id"), btn = $("usage-off");
  if (!id || !btn) return;
  id.textContent = usageVisitor().slice(0, 8);
  btn.textContent = tr(usageOff() ? "count this browser again" : "stop counting this browser");
  btn.onclick = () => {
    try { localStorage.setItem(USAGE_OFF, usageOff() ? "0" : "1"); } catch (_) { /* nothing to keep it in */ }
    renderUsageNote();
  };
}

/// ONCE PER (event, subject) PER PAGE LOAD. A point says a reader got this far
/// with this thing, not how many times: forty edits to one build are one build.
const usageSent = new Set();

/// Fire and forget. Never awaited, never throws, never delays a render — a
/// failed point is a point missing, and nothing the reader can see.
/// A text/plain body is a SIMPLE request: the desktop shell posts cross-origin
/// without a preflight.
function track(event, subject = "", n) {
  try {
    if (!LIVE_HOSTS.includes(location.hostname)) return;
    // A reader who has asked not to be tracked is not.
    if (navigator.globalPrivacyControl || navigator.doNotTrack === "1" || usageOff()) return;
    const key = `${event}\n${subject}`;
    if (usageSent.has(key)) return;
    usageSent.add(key);
    const seg = location.pathname.split("/")[1] || "";
    const point = {
      v: 1, e: event, cid: usageVisitor(), subject: subject || "",
      route: !seg ? "home" : /^[a-z0-9_-]{1,32}$/.test(seg) ? seg : "other",
      lang: typeof LANG === "string" ? LANG : "en",
      shell: window.__WFSIM_DESKTOP__ ? "desktop" : "web",
      release: RELEASE_ID,
      ...(typeof n === "number" ? { n } : {}),
    };
    const at = location.origin === LIVE_ORIGIN ? "" : LIVE_ORIGIN;
    fetch(`${at}/api/e`, { method: "POST", body: JSON.stringify(point), keepalive: true })
      .catch(() => {});
  } catch (_) { /* never the page's problem */ }
}
