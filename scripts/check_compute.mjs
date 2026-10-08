// THE COMPUTE PAGE (`/compute`, web/src/static/app/73-compute.js) — docs/BOARD.md
// §"Contribution". This browser's tasks are drawn from what it kept and by each
// task's KIND: a board order as its weapon, ruler and mode, linked to that
// board, never its mods; a kind the page does not know still draws. A task in
// progress shows how far it is. Signed in, every device of the account is
// listed by its name, this browser marked, with what each is doing or last
// did; one claimed before it had a name is given its guess; a device is renamed
// and removed inline, with no native dialog. The account is answered by
// interception.
//   node scripts/check_compute.mjs        (WFSIM_BASE=<origin> for a dev server)
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 13000, base: process.env.WFSIM_BASE });
const { evaluate, check } = app;
await app.setLang("en", 20000);

const r = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const realFetch = window.fetch;
  const own = "ownown" + "0".repeat(18);
  localStorage.setItem("wfsim-verifier", own);
  localStorage.setItem("wfsim-compute-log", JSON.stringify([
    { kind: "board", weapon: "torid", ruler: "standard_single_target", mode: "base", mods: ["secret"], at: Date.now() - 120000, ms: 12000, work: 3400000000 },
    { kind: "appraise", at: Date.now() - 7200000, ms: 90000, work: 1e9 },
  ]));
  let account = null;
  let devices = [
    { id: "ownown", label: null, claimed_at: "2026-10-08", points: 12, recent: 12, last_at: null,
      now: { kind: "board", weapon: "furis", ruler: "standard_single_target", mode: "base" } },
    { id: "abcdef", label: "Study PC", claimed_at: "2026-10-08", points: 30, recent: 5, last_at: new Date(Date.now() - 600000).toISOString(), now: null },
  ];
  const posted = [];
  window.fetch = async (url, o = {}) => {
    const path = String(url);
    const reply = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    if (path === "/api/account") return reply({ ok: true, providers: ["email"], account });
    if (path === "/api/account/devices") return reply({ ok: true, named: false, decided: true, points: 42, recent: 17, devices });
    if (path === "/api/account/devices/label" || path === "/api/account/devices/remove") {
      const b = JSON.parse(o.body);
      posted.push([path.split("/").pop(), b]);
      if (path.endsWith("label")) devices = devices.map((d) => (d.id === b.id ? { ...d, label: b.label } : d));
      else devices = devices.filter((d) => d.id !== b.id);
      return reply({ ok: true });
    }
    if (path === "/api/board/points") return reply({ ok: true, points: 12, recent: 12, claimed: !!account });
    if (path === "/api/cloud/sync") return reply({ ok: true, full: false, entries: [], next: null, cursor: 0 });
    return realFetch(url, o);
  };
  const page = () => document.getElementById("auth-page");
  const rowsOf = (title) => {
    const block = [...page().querySelectorAll(".block")].find((b) => (b.querySelector(".bh h2") || {}).textContent === title);
    return block ? [...block.querySelectorAll(".kv")] : [];
  };
  const out = {};
  history.pushState({}, "", "/compute"); route(); await loadAccount(); await sleep(500);
  const recent = rowsOf("Recent tasks on this browser");
  out.recent = recent.map((k) => k.textContent.replace(/\\s+/g, " ").trim());
  out.link = (recent[0] && recent[0].querySelector("a") || {}).getAttribute ? recent[0].querySelector("a").getAttribute("href") : null;
  out.secret = page().textContent.includes("secret");
  out.signIn = !!page().querySelector('a[href^="/login"]');
  computeStart({ kind: "board", weapon: "torid", ruler: "standard_single_target", mode: "base" });
  computeProgress(50, 100);
  computeRedraw();
  const bar = [...page().querySelectorAll(".kv")].find((k) => k.querySelector("dt").textContent === "Now");
  out.now = bar ? bar.querySelector("dd div div").style.width : null;
  computeEnd(null);

  account = { id: "acc1", created_at: "", identities: [{ provider: "email", label: "a@x" }] };
  history.pushState({}, "", "/"); route(); await sleep(100);
  history.pushState({}, "", "/compute"); route(); await loadAccount(); await sleep(800);
  const mine = rowsOf("Your devices");
  out.devices = mine.map((k) => k.querySelector("dt").textContent.replace(/\\s+/g, " ").trim());
  out.status = mine.map((k) => (k.querySelector("dd") || { textContent: "" }).textContent.replace(/\\s+/g, " ").trim());
  out.guessed = posted.find(([what, b]) => what === "label" && b.id === "ownown");
  page().querySelector('[data-auth="device-rename"][data-id="abcdef"]').click(); await sleep(200);
  const input = document.getElementById("device-label");
  out.editing = !!input;
  input.value = "Garage Mac";
  page().querySelector('[data-auth="device-rename-save"]').click(); await sleep(400);
  out.renamed = rowsOf("Your devices").map((k) => k.querySelector("dt").textContent.replace(/\\s+/g, " ").trim());
  page().querySelector('[data-auth="device-remove"][data-id="abcdef"]').click(); await sleep(200);
  out.asks = page().textContent.includes("Remove it?");
  page().querySelector('[data-auth="device-remove-confirm"]').click(); await sleep(400);
  out.after = rowsOf("Your devices").length;
  out.posted = posted;
  window.fetch = realFetch;
  localStorage.removeItem("wfsim-compute-log");
  return out;
})()`, 40000);

check("this browser's tasks are drawn by kind, a board order as its weapon and ruler",
  r.recent[0] && r.recent[0].startsWith("Leaderboard order · Torid · ") && /≈ 3\.4$/.test(r.recent[0]), JSON.stringify(r.recent));
check("...linked to that weapon's board, and never its mods", r.link === "/weapons/Torid?bench=standard_single_target" && !r.secret,
  `${r.link} ${r.secret}`);
check("...and a kind the page does not know still draws", r.recent[1] && r.recent[1].startsWith("Task"), JSON.stringify(r.recent));
check("signed out, it says how to count the work under a name", r.signIn);
check("a task in progress shows how far it is", r.now === "50%", r.now);
check("signed in, every device is listed by its name, this browser marked",
  / · .* \(this browser\)$/.test(r.devices[0]) && r.devices[1] === "Study PC" && r.devices.length === 2, JSON.stringify(r.devices));
check("...with what each is doing, or when it last answered",
  /^Computing: Leaderboard order · Furis/.test(r.status[0]) && /^Last answered 10 min ago/.test(r.status[1]), JSON.stringify(r.status));
check("this browser, claimed before it had a name, is given its guess", !!r.guessed && /·/.test(r.guessed[1].label),
  JSON.stringify(r.guessed));
check("a device is renamed inline", r.editing && r.renamed.includes("Garage Mac"), JSON.stringify(r.renamed));
check("...and removed after an inline question", r.asks && r.after === 1
  && r.posted.some(([what, b]) => what === "remove" && b.id === "abcdef"), JSON.stringify(r.posted));

await app.finish("the compute page shows what each device does, by kind, and nothing private");
