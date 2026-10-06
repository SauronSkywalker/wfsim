// SPDX-License-Identifier: AGPL-3.0-or-later
// THE LONG IMAGE, TAKEN — docs/AGENT.md §"The QQ bot". One headless Chrome
// stays up; each render opens the site's card page (45-card-page.js) in
// Chinese, waits for `data-card-ready`, and screenshots that element alone.
// `--no-sandbox`: Ubuntu 26.04 denies the namespaces Chrome's sandbox needs,
// and this browser only ever opens wfsim.app.
import { spawn } from "node:child_process";

const CHROME = process.env.CHROME || "chrome-headless-shell";
const PORT = 9333;
const READY_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chrome = null;
async function browser() {
  if (chrome && chrome.exitCode === null) return;
  chrome = spawn(CHROME, ["--no-sandbox", "--lang=zh-CN", `--remote-debugging-port=${PORT}`,
    "--hide-scrollbars", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return; } catch (_) {}
    await sleep(200);
  }
  throw new Error("chrome did not come up");
}

/// One page over the DevTools protocol: `send(method, params)` and close.
async function page() {
  await browser();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((ok) => { const id = ++seq; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const close = async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); };
  return { send, close };
}

/// The card at `url` as a PNG buffer in the page's language `lang`, or an Error.
export async function renderCard(url, lang = "zh") {
  return (await renderCardWith(url, { lang })).png;
}

/// …and what the page says about it: `{ png, verdict }`, the verdict an
/// appraisal's answer writes to `body[data-verdict]` once its replay has run.
/// `wait` is how long a card may take — a replay is a whole official fight.
export async function renderCardWith(url, { lang = "zh", wait = READY_MS } = {}) {
  const p = await page();
  try {
    await p.send("Emulation.setDeviceMetricsOverride", { width: 760, height: 1200, deviceScaleFactor: 1.5, mobile: false });
    // THE READERS' CLOCK, not the server's: a card's "updated" time is printed
    // in the time zone of the chat it is sent to.
    await p.send("Emulation.setTimezoneOverride", { timezoneId: lang === "zh" ? "Asia/Shanghai" : "UTC" });
    // THE LANGUAGE BEFORE THE PAGE'S FIRST SCRIPT, which reads it once at load;
    // an injected script only runs on a page whose Page domain is enabled.
    await p.send("Page.enable");
    await p.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("wfsim-lang", ${JSON.stringify(lang)}); } catch (_) {}` });
    await p.send("Page.navigate", { url });
    const ask = async (expr) => ((await p.send("Runtime.evaluate", { expression: expr, returnByValue: true })).result || {}).result?.value;
    const until = Date.now() + wait;
    while (!(await ask(`document.body && document.body.dataset.cardReady === "1"`))) {
      if (Date.now() > until) throw new Error(`card not ready: ${url}`);
      await sleep(250);
    }
    const r = await ask(`(() => { const b = document.getElementById("card-page").getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, w: b.width, h: b.height }; })()`);
    const shot = await p.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
    const verdict = await ask(`document.body.dataset.verdict || ""`);
    return { png: Buffer.from(shot.result.data, "base64"), verdict: verdict ? JSON.parse(verdict) : null };
  } finally {
    await p.close();
  }
}
