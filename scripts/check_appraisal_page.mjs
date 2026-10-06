// RIVEN APPRAISAL'S PAGE (81-appraisal.js), against a stand-in for its door:
// the link opens the weapon's optimizer under the appraisal's ruler with the
// riven pinned in its one start, the search starts with no click, and when it
// finishes the winner goes back as a BUILD — no score — with the name typed,
// while the finalists go to the board without asking.
//   node scripts/check_appraisal_page.mjs      (minutes: it runs a real search)
import { openApp, sleep } from "./cdp.mjs";

const JOB = { ok: true, code: "TEST7", weapon: "torid", ruler: "standard_single_target", at: 0, done: false,
  riven: { bonuses: [{ id: "critical_damage", roll: 1.1 }, { id: "multishot", roll: 1.05 }], malus: { id: "zoom", roll: 0.9 }, rank: 8 } };
// THE STAND-IN, installed before the app's first script: the appraisal's door
// answers from JOB, and what the page sends to it and to the board is kept.
const STUB = `(() => {
  const job = ${JSON.stringify(JOB)};
  window.__sent = { results: [], board: [] };
  const real = window.fetch.bind(window);
  window.fetch = async (url, init = {}) => {
    const u = String(url);
    const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (/\\/api\\/appraise\\/TEST7\\/result$/i.test(u)) { window.__sent.results.push(JSON.parse(init.body)); return ok({ ok: true, first: true }); }
    if (/\\/api\\/appraise\\/TEST7\\?result=1$/i.test(u)) return ok({ ...job, result: { id: 1, build: JSON.parse(localStorage.getItem("__build") || "{}"), thanks: "Kai" } });
    if (/\\/api\\/appraise\\/TEST7$/i.test(u)) return ok(job);
    if (/\\/api\\/board\\/submit$/.test(u)) { window.__sent.board.push(JSON.parse(init.body)); return ok({ ok: true }); }
    return real(url, init);
  };
  try { localStorage.setItem("wfsim-board-consent", "no"); } catch (_) {}
})();`;

const app = await openApp({ boot: 13000, base: process.env.WFSIM_BASE });
const { evaluate, check, finish } = app;
await app.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });

// THE PICTURE THE BOT SENDS FIRST: the asker's card, its code, and the way in.
await app.load("/weapons/Torid/card?kind=appraise&code=TEST7", 6000);
for (let i = 0; i < 40 && !(await evaluate(`document.body.dataset.cardReady === "1"`)); i++) await sleep(500);
const chips = await evaluate(`[...document.querySelectorAll("#card-page [data-riven-card] .sb-chip")].map((c) => c.textContent)`);
check("the appraisal's picture draws the asker's card with its numbers and rolls", chips.length === 3
  && chips.every((t) => /\d/.test(t) && /×\d\.\d\d/.test(t)) && chips.some((t) => /×1\.05/.test(t)), JSON.stringify(chips));
check("…its code, and a QR code to the appraisal", (await evaluate(`document.querySelector("#card-page").textContent`)).includes("TEST7")
  && await evaluate(`!!document.querySelector("#card-page .lc-qr svg")`));
// WHAT THE READER ALREADY HAS: their presets, rivens and search checkpoint,
// which an appraisal opened in this browser must leave exactly as they were.
const OWN = `JSON.stringify(Object.keys(localStorage).filter((k) => /presets|riven|ckpt/i.test(k)).sort()
  .map((k) => [k, localStorage.getItem(k)]))`;
const before = await evaluate(OWN);
await app.load("/appraise/TEST7", 9000);

check("the link lands on its weapon's optimizer", (await evaluate("location.pathname")).toLowerCase() === "/weapons/torid/optimizer",
  await evaluate("location.pathname"));
check("…under the appraisal's ruler", await evaluate(`(scenarioNamed(activeScenario) || {}).builtin === "standard_single_target"`));
const starts = JSON.parse(await evaluate(`JSON.stringify(opt.starts.map((s) => ({ slots: startPayload(s).slots.filter(Boolean), fixed: s.fixed })))`));
const preset = JSON.parse(await evaluate("JSON.stringify(META.appraisal_search)"));
check("…with the preset's four starts: the riven, pinned, beside each element's 60/60 card", starts.length === 4
  && starts.every((s, i) => s.slots.length === 2 && String(s.slots[0]).startsWith("riven:") && s.fixed.includes("mods:0")
    && preset.starts[i].includes(s.slots[1]))
  && JSON.stringify(starts.map((s) => s.slots[1])) === JSON.stringify(["thermite_rounds", "rime_rounds", "high_voltage", "malignant_force"]), JSON.stringify(starts));
check("…answering with one build, ten fights a candidate", await evaluate("optRun.finalists === 1 && optRun.candidate_runs === 10"));
const start = { slots: starts[0].slots };
const card = JSON.parse(await evaluate(`JSON.stringify((loadPresetList(RIVENS).find((p) => "riven:" + p.id === ${JSON.stringify(start.slots[0])}) || {}).state || {})`));
check("…and that riven is the asker's card, rolls and all", (card.bonuses || []).map((b) => `${b.id}@${b.roll}`).join(",") === "critical_damage@1.1,multishot@1.05"
  && card.malus && card.malus.id === "zoom" && card.malus.roll === 0.9, JSON.stringify(card));
check("the search started without a click", await evaluate("optJobId != null || !!optLast"));
check("a banner says what the page is doing", /riven appraisal|裂罅评估/i.test(await evaluate(`($("appraisal-banner") || {}).textContent || ""`)));
await evaluate(`(() => { const i = $("appraisal-name"); i.value = "Kai"; i.dispatchEvent(new Event("input")); })()`);

let sent = null;
for (let i = 0; i < 240 && !sent; i++) {
  await sleep(5000);
  const s = JSON.parse(await evaluate("JSON.stringify(window.__sent)"));
  if (s.results.length) sent = s;
}
check("when the search finishes, its winner goes back", !!sent, "no build came back in 20 minutes");
if (sent) {
  const r = sent.results[0];
  check("…as a build with the riven in it", r.build && r.build.weapon === "torid" && r.build.mods.includes("riven")
    && JSON.stringify(r.build.riven_pos) === JSON.stringify(["critical_damage", "multishot"]) && r.build.riven_neg === "zoom", JSON.stringify(r.build));
  check("…carrying no score", !/score|shown|kpm/i.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 200));
  check("…and the name that was typed", r.thanks === "Kai", r.thanks);
  await sleep(4000);
  const board = JSON.parse(await evaluate("JSON.stringify(window.__sent.board)"));
  check("the finalists go to the board even with the board switched off here", board.length > 0, String(board.length));
  check("the banner thanks the reader", /thank|谢谢/i.test(await evaluate(`($("appraisal-banner") || {}).textContent || ""`)));
  await app.load("/weapons/Torid/optimizer", 6000);
  check("the reader's own presets, rivens and checkpoint are as they were", (await evaluate(OWN)) === before);

  // THE ANSWER'S PICTURE: that build replayed with the asker's rolls, judged,
  // scored and set against the board — what the bot reads and sends.
  await evaluate(`localStorage.setItem("__build", ${JSON.stringify(JSON.stringify(r.build))})`);
  await app.load("/weapons/Torid/card?kind=appraise&code=TEST7&result=1", 6000);
  for (let i = 0; i < 240 && !(await evaluate(`document.body.dataset.cardReady === "1"`)); i++) await sleep(500);
  const v = JSON.parse(await evaluate(`document.body.dataset.verdict || "null"`) || "null");
  check("the answer's picture replays the build and says it is legal", v && v.ok === true, JSON.stringify(v));
  check("…with a score in the ruler's metric and its gain over the board's riven-free leader",
    v && v.score > 0 && typeof v.gain === "number" && v.top != null, JSON.stringify(v));
  check("…and where the card stands among the board's rivens", v && v.of > 0 && v.rank >= 1 && v.rank <= v.of + 1, JSON.stringify(v));
  check("…thanking who searched it", (await evaluate(`document.querySelector("#card-page").textContent`)).includes("Kai"));
}
await finish("an appraisal link searches at once and hands back a build");
