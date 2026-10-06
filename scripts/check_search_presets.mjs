// THE BUILT-IN SEARCHES (80-optimizer-preset.js, data/search/presets.yaml): a
// reader who owns no search has the first built-in — four starts, each the open
// weapon's 60/60 card of one element — read-only like an official ruler: its
// controls are inert, nothing it shows is stored, ⧉ makes an editable copy, and
// deleting that copy brings the built-in back.
//   node scripts/check_search_presets.mjs
import { openApp, sleep } from "./cdp.mjs";

const app = await openApp({ boot: 13000, base: process.env.WFSIM_BASE });
const { evaluate, check, finish } = app;
const cards = () => evaluate(`JSON.stringify(opt.starts.map((s) => startPayload(s).slots.filter(Boolean)))`).then(JSON.parse);

await app.load("/weapons/Torid/optimizer", 7000);
check("owning no search, a reader has the four-element built-in", await evaluate(`activeOptPreset === "search:four_elements"`),
  await evaluate("activeOptPreset"));
check("…four starts, each this weapon's 60/60 card of one element",
  JSON.stringify(await cards()) === JSON.stringify([["thermite_rounds"], ["rime_rounds"], ["high_voltage"], ["malignant_force"]]),
  JSON.stringify(await cards()));
check("…answering the run terms it states", await evaluate("optRun.finalists === 10 && optRun.candidate_runs === 10"));
check("…read-only on screen: its note shows and its controls are inert", await evaluate(`!$("opt-builtin").hidden
  && $("opt-finalists").disabled && [...$("opt-starts").querySelectorAll("button")].every((b) => b.disabled)`));
check("…and the run button is not among them", await evaluate(`!$("run-opt").disabled`));
// AN EDIT THAT REACHES IT ANYWAY — the door, say — is not written anywhere.
await evaluate(`setOptSizes({ finalists: 3 })`);
await sleep(1200);
check("nothing it shows is stored", await evaluate("loadOptPresets().length === 0"), await evaluate("JSON.stringify(loadOptPresets())"));

await evaluate(`$("opt-builtin-copy").click()`);
await sleep(800);
check("⧉ makes a search of the reader's own, editable", await evaluate(`loadOptPresets().length === 1 && !builtinSearchActive()
  && $("opt-builtin").hidden && !$("opt-finalists").disabled`));
check("…holding the same four starts", JSON.stringify(await cards()) === JSON.stringify([["thermite_rounds"], ["rime_rounds"], ["high_voltage"], ["malignant_force"]]));

await evaluate(`(() => { const del = $("preset-bar-optimizer").querySelector(".pop.del"); del.click(); if (loadOptPresets().length) del.click(); })()`);
await sleep(800);
check("deleting it brings the built-in back", await evaluate(`loadOptPresets().length === 0 && activeOptPreset === "search:four_elements"`),
  await evaluate("activeOptPreset + ' / ' + loadOptPresets().length"));

await app.load("/weapons/Hek/optimizer", 7000);
check("a shotgun's built-in starts are the shotgun's 60/60 cards",
  JSON.stringify(await cards()) === JSON.stringify([["scattering_inferno"], ["frigid_blast"], ["shell_shock"], ["toxic_barrage"]]),
  JSON.stringify(await cards()));
await finish("the built-in searches are read-only and come back");
