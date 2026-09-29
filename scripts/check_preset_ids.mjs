/// EVERY STORED ENTRY HAS AN ID OF ITS OWN, AND KEEPS IT.
///
/// A sync matches entries by `id`, because every device has a "preset 1". So a
/// list stored before ids existed is minted once at boot and keeps those ids on
/// the next load; a duplicated id is split; "+ new" and ⧉ mint fresh ones; an
/// edit, a rename and an undo keep them. A riven is NOT minted by that pass: its
/// id is what a build's slot names, and the fold that mints it also repoints
/// the slot — minting it first leaves the slot pointing at the old name.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000 });
const { evaluate, check } = app;

const weapon = "torid";
await evaluate(`(() => {
  localStorage.clear();
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const st = (mod) => buildState(${JSON.stringify(weapon)}, { evoSel: {}, arcane: ['none'], arcaneRank: [null],
    slots: [{ mod, rank: mod ? 0 : null }], mode: null, valence: null, assembly: null, wielder: null });
  put('wfsim-presets-${weapon}-builder-builds', [
    { name: 'preset 1', savedAt: 1, state: st('serration') },
    { name: 'preset 2', savedAt: 2, state: st('riven:riven 1') },
    { id: 'same', name: 'twin a', savedAt: 3, state: st('hornet_strike') },
    { id: 'same', name: 'twin b', savedAt: 4, state: st('split_chamber') },
  ]);
  put('wfsim-presets-simulator-scenarios', [{ name: 'preset 1', savedAt: 1, state: {} }]);
  put('wfsim-customs-${weapon}-rivens', [{ name: 'riven 1', savedAt: 1, state: {} }]);
})()`);
await app.load("/");

const ids = `(() => {
  const all = (k) => JSON.parse(localStorage.getItem(k) || '[]');
  const b = all('wfsim-presets-${weapon}-builder-builds');
  return {
    builds: b.map((p) => p.id || null),
    scenarios: all('wfsim-presets-simulator-scenarios').map((p) => p.id || null),
    rivens: all('wfsim-customs-rivens').map((p) => p.id || null),
    slot: (((b[1] || {}).state || {}).slots || [])[0]?.mod || null,
  };
})()`;
const first = await evaluate(ids);
const unique = (l) => l.every(Boolean) && new Set(l).size === l.length;
check("a list stored without ids is minted at boot", unique(first.builds) && unique(first.scenarios),
  JSON.stringify(first));
check("...and a duplicated id is split", first.builds[2] === "same" && first.builds[3] !== "same",
  JSON.stringify(first.builds));
check("a riven is minted by the fold, which repoints the build that names it",
  first.rivens.length === 1 && !!first.rivens[0] && first.slot === `riven:${first.rivens[0]}`,
  JSON.stringify({ rivens: first.rivens, slot: first.slot }));

await app.load("/");
const second = await evaluate(ids);
check("the ids survive the next load", JSON.stringify(second) === JSON.stringify(first),
  JSON.stringify({ first, second }));

const r = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const list = () => loadPresetList('builder-builds');
  history.pushState({}, '', '/weapons/Torid'); route(); await sleep(3000);
  const bar = () => document.querySelector('#preset-bar-builder-builds');
  bar().querySelector('.pchip.add').click(); await sleep(800);
  // Past the undo coalescing window, so the Ctrl+Z below undoes the edit alone.
  bar().querySelector('.pchip.sel .pop.dup').click(); await sleep(UNDO_COALESCE_MS + 600);
  const made = list().map((p) => p.id);
  const at = list().findIndex((p) => p.name === activePreset);
  const before = list()[at].id;
  slots[0].mod = 'serration'; slots[0].rank = 10;
  markPresetDirty(); renderMods(); flushPresetSaves(); await sleep(800);
  const edited = list()[at].id;
  undoPreset(); await sleep(800);
  const back = list().find((p) => p.id === before);
  const undone = back && ((back.state.slots || [])[0] || {}).mod !== 'serration' ? back.id : null;
  return { made, before, edited, undone };
})()`);
check("\"+ new\" and duplicate mint ids of their own",
  r.made.length === 6 && r.made.every(Boolean) && new Set(r.made).size === 6, JSON.stringify(r.made));
check("an edit and its undo keep the entry's id", !!r.before && r.before === r.edited && r.edited === r.undone,
  JSON.stringify(r));

await app.finish("every stored entry has an id of its own, and keeps it");
