/// EVERY STORED ENTRY HAS AN ID OF ITS OWN, KEEPS IT, AND IS POINTED AT BY IT.
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
  const at = list().findIndex((p) => p.id === activePreset);
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

// ---- EVERYTHING POINTS BY ID ---------------------------------------------------------
// What an older page stored by NAME — the open entry, a fight's custom target,
// a Forma group — is read as the id of the entry it named, and from then on a
// name is a label two entries may share.
await evaluate(`(() => {
  localStorage.clear();
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const st = (mod) => buildState('torid', { evoSel: {}, arcane: ['none'], arcaneRank: [null],
    slots: [{ mod, rank: mod ? 0 : null }], mode: null, valence: null, assembly: null, wielder: null });
  put('wfsim-presets-torid-builder-builds', [
    { id: 'b1', name: 'alpha', savedAt: 1, state: st('serration') },
    { id: 'b2', name: 'beta', savedAt: 2, state: st('split_chamber') },
  ]);
  localStorage.setItem('wfsim-preset-active-torid-builder-builds', 'beta');
  put('wfsim-forma-group-torid', ['alpha', 'beta']);
  put('wfsim-customs-enemies', [{ id: 'e1', name: 'boss', savedAt: 1, state: {} }]);
  localStorage.setItem('wfsim-custom-open-enemies', 'boss');
  put('wfsim-presets-simulator-scenarios', [{ id: 's1', name: 'my fight', savedAt: 1, state: { enemy: 'custom:boss', level: 100 } }]);
})()`);
await app.load("/weapons/Torid");
const m = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const get = (k) => JSON.parse(localStorage.getItem(k) || 'null');
  const out = {
    pointer: localStorage.getItem('wfsim-preset-active-torid-builder-builds'), open: activePreset,
    onScreen: (slots[0] || {}).mod, group: get('wfsim-forma-group-torid'),
    fightTarget: get('wfsim-presets-simulator-scenarios')[0].state.enemy,
    targetIds: customEnemySpecs().map((e) => e.id),
    enemyOpen: activeEnemyName(),
  };
  // A NAME ANOTHER ENTRY HAS: taken, and both still open as themselves.
  const cfg = buildBarCfg();
  pickPreset(cfg, 'b1'); await sleep(400);
  const ps = loadPresetList('builder-builds');
  ps.find((p) => p.id === 'b1').name = 'beta';
  storePresetList('builder-builds', ps); renderPresetBar(); await sleep(300);
  pickPreset(cfg, 'b2'); await sleep(400);
  out.twinB2 = (slots[0] || {}).mod;
  pickPreset(cfg, 'b1'); await sleep(400);
  out.twinB1 = (slots[0] || {}).mod;
  out.chips = [...document.querySelectorAll('#preset-bar-builder-builds .pchip:not(.add):not(.share)')].map((c) => c.dataset.name);
  // A RENAMED TARGET MOVES NOTHING: the fight still names it.
  const en = get('wfsim-customs-enemies');
  en[0].name = 'renamed boss';
  storePresetList('enemies', en);
  out.afterRename = customEnemySpecs().map((e) => e.id);
  return out;
})()`);
check("a pointer stored by name is read as the id of the entry it named, and that entry opens",
  m.pointer === "b2" && m.open === "b2" && m.onScreen === "split_chamber", JSON.stringify(m));
check("...and the custom target open by name is open by id", m.enemyOpen === "e1", m.enemyOpen);
check("a Forma group stored by name lists ids", JSON.stringify(m.group) === JSON.stringify(["b1", "b2"]), JSON.stringify(m.group));
check("a fight's custom target is named by id", m.fightTarget === "custom:e1" && m.targetIds[0] === "custom:e1",
  JSON.stringify([m.fightTarget, m.targetIds]));
check("two builds may share a name, and each opens as itself",
  m.twinB1 === "serration" && m.twinB2 === "split_chamber" && JSON.stringify(m.chips) === JSON.stringify(["b1", "b2"]),
  JSON.stringify([m.twinB1, m.twinB2, m.chips]));
check("renaming a custom target moves nothing a fight names", JSON.stringify(m.afterRename) === JSON.stringify(["custom:e1"]),
  JSON.stringify(m.afterRename));

await app.finish("every stored entry has an id of its own, keeps it, and is pointed at by it");
