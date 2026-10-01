/// SAVED ITEMS AS A FILE (docs/UI.md §"Saved items as a file"): everything this
/// browser saved goes out as one file and comes back in, signed out, without
/// overwriting anything here.
///
/// What it holds: the export carries every collection and no board row, sync
/// choice or measured result; reading it into an empty browser restores it as
/// it was; reading it again changes nothing; an item changed here since is kept
/// and the file's version is added beside it, and a riven added as a copy has
/// the builds that name it repointed at the copy; a file that is not an export
/// is refused out loud; both controls are in the topbar's overflow.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000, base: process.env.WFSIM_BASE });
const { evaluate, check } = app;

const r = await evaluate(`(async () => {
  const L = 'wfsim-presets-builder-builds', RV = 'wfsim-customs-rivens', EN = 'wfsim-customs-enemies';
  const st = (mod) => buildState('torid', { evoSel: {}, arcane: ['none'], arcaneRank: [null],
    slots: [{ mod, rank: mod ? 8 : null }], mode: null, valence: null, assembly: null, wielder: null });
  const read = (k) => JSON.parse(localStorage.getItem(k) || '[]');
  const note = () => (document.getElementById('page-note') || {}).textContent || '';
  const clearNote = () => { const n = document.getElementById('page-note'); if (n) n.remove(); };
  // THE FILE THE EXPORT HANDS THE BROWSER, caught at the blob.
  let blob = null, fileName = null;
  const realUrl = URL.createObjectURL, realClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
  HTMLAnchorElement.prototype.click = function () { if (this.download) fileName = this.download; else realClick.call(this); };
  const out = {};

  localStorage.clear();
  localStorage.setItem(RV, JSON.stringify([{ id: 'rv1', name: 'riven one', scope: rivenScope('torid'), savedAt: 1, state: blankRiven(), cloud_sync: false }]));
  localStorage.setItem(L, JSON.stringify([
    { id: 'b1', scope: 'torid', name: 'mine', savedAt: 2, state: st('riven:rv1'), lastResult: { r: 1 } },
    { id: 'board', builtin: 'x', name: 'a board row', state: st('serration') }]));
  localStorage.setItem(EN, JSON.stringify([{ id: 'e1', name: 'target', savedAt: 3, state: blankEnemy() }]));
  savesExport();
  const text = blob ? await blob.text() : '';
  const file = text ? JSON.parse(text) : {};
  out.file = [file.format, file.version, /^wfsim-saves-\\d{4}-\\d\\d-\\d\\d\\.json$/.test(fileName || ''),
    Object.keys(file.lists || {}).sort().join(), (file.lists?.['builder-builds'] || []).map((p) => p.id).join(),
    'lastResult' in ((file.lists?.['builder-builds'] || [])[0] || {}), 'cloud_sync' in ((file.lists?.rivens || [])[0] || {})];

  // AN EMPTY BROWSER takes the file as it was.
  localStorage.clear();
  clearNote();
  savesImport(text);
  out.restored = [read(L).map((p) => p.id + ':' + p.state.slots[0].mod).join(), read(RV).map((p) => p.id).join(), read(EN).map((p) => p.id).join(), note().length > 0];
  // AGAIN: nothing changes.
  const before = JSON.stringify([read(L), read(RV), read(EN)]);
  savesImport(text);
  out.again = JSON.stringify([read(L), read(RV), read(EN)]) === before;

  // CHANGED HERE SINCE: kept, and the file's copy added beside it, its builds repointed.
  const rv = read(RV); rv[0].state = { ...rv[0].state, rank: 3 }; localStorage.setItem(RV, JSON.stringify(rv));
  const bl = read(L); bl[0].name = 'renamed here'; localStorage.setItem(L, JSON.stringify(bl));
  savesImport(text);
  const rivens = read(RV), builds = read(L);
  const copyRv = rivens.find((p) => p.id !== 'rv1');
  const copyB = builds.find((p) => p.id !== 'b1');
  out.copies = [rivens.length, builds.length, (rivens.find((p) => p.id === 'rv1') || {}).state?.rank,
    (builds.find((p) => p.id === 'b1') || {}).name, !!copyRv && copyRv.name !== 'riven one' && copyRv.name.startsWith('riven one'),
    !!copyB && !!copyRv && copyB.state.slots[0].mod === 'riven:' + copyRv.id];

  // NOT AN EXPORT: refused, out loud, and nothing written.
  clearNote();
  const was = JSON.stringify(read(L));
  savesImport('{"hello":1}');
  out.refused = [note().length > 0, JSON.stringify(read(L)) === was];

  // THE CONTROLS, in the topbar's overflow.
  out.menu = [!!document.querySelector('#tbmore-panel [data-saves="export"]'), !!document.querySelector('#tbmore-panel [data-saves="import"]')];
  URL.createObjectURL = realUrl; HTMLAnchorElement.prototype.click = realClick;
  return out;
})()`);

const ok = (x) => JSON.stringify(x);
check("the export is one file of every collection, without a board row, a measured result or a sync choice",
  ok(r.file) === ok(["wfsim-saves", 1, true, "builder-builds,enemies,rivens", "b1", false, false]), ok(r.file));
check("an empty browser takes the file as it was, and says what it did",
  ok(r.restored) === ok(["b1:riven:rv1", "rv1", "e1", true]), ok(r.restored));
check("reading it again changes nothing", r.again === true);
check("an item changed here is kept, the file's added beside it, and the copied riven's build points at the copy",
  ok(r.copies) === ok([2, 2, 3, "renamed here", true, true]), ok(r.copies));
check("a file that is not an export is refused, out loud, and nothing is written", ok(r.refused) === ok([true, true]), ok(r.refused));
check("export and import are in the topbar's overflow", ok(r.menu) === ok([true, true]), ok(r.menu));

await app.finish("saved items go out as one file and come back in");
