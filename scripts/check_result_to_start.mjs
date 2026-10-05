// A RESULT HANDS THE OPTIMIZER THE BUILD IT MEASURED, NOT THE ONE ON SCREEN.
//
// "Send this build to the optimizer" adds a start, and the start is the copy
// taken when that run was SENT: a build edited after its run, while the run
// is still the one shown, must not become the start. This runs a short fight,
// changes a card, sends the result and asserts the new start holds the
// measured cards and not the edited ones; that the optimizer opened; and that
// sending it again — through the door this time — adds no second copy.
//
//   node scripts/check_result_to_start.mjs
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000 });
const r = await app.evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  localStorage.clear();
  history.pushState({}, '', '/weapons/Verglas_Prime/simulator'); route(); await sleep(3000);
  const out = {};
  ['serration','split_chamber','vital_sense'].forEach((m, i) => equipMod(i, m, null));
  renderMods(); await sleep(900); flushPresetSaves();
  const cards = () => snapshotState().slots.map(s => s.mod).filter(Boolean);
  out.measured = cards();
  setSimRuns(5);
  document.getElementById('run-sim').click();
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    if (!document.getElementById('run-sim').disabled && document.getElementById('exit-optimize')) break;
  }
  out.buttonReady = !!document.getElementById('exit-optimize') && !document.getElementById('exit-optimize').disabled;

  // THE EDIT AFTER THE RUN: the result on screen is still the measured one.
  equipMod(1, 'point_strike', null); renderMods(); await sleep(900); flushPresetSaves();
  out.edited = cards();

  const before = opt.starts.length;
  document.getElementById('exit-optimize').click();
  for (let i = 0; i < 50 && !location.pathname.endsWith('/optimizer'); i++) await sleep(100);
  await sleep(800);
  out.opened = location.pathname.endsWith('/optimizer');
  const last = opt.starts[opt.starts.length - 1];
  out.added = opt.starts.length - before;
  out.start = last ? last.build.slots.map(s => s.mod).filter(Boolean) : [];

  // AGAIN, through the door: the same build is not added twice.
  history.pushState({}, '', '/weapons/Verglas_Prime/simulator'); route(); await sleep(1500);
  const n = opt.starts.length;
  out.door = await window.wfsim.do('simulator.result.send', {});
  out.twice = opt.starts.length - n;
  return out;
})()`);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
app.check("a short run leaves the button ready", r.buttonReady === true);
app.check("the build was edited after the run", !same(r.measured, r.edited), `${r.measured} -> ${r.edited}`);
app.check("sending the result opens the optimizer", r.opened === true);
app.check("...and adds one start", r.added === 1, `${r.added}`);
app.check("...holding the MEASURED build", same(r.start, r.measured), `start ${r.start}, measured ${r.measured}`);
app.check("...not the build as it stands now", !same(r.start, r.edited), `${r.start}`);
app.check("sending it again through the door adds no second copy",
  r.twice === 0 && r.door && r.door.ok !== false, JSON.stringify(r.door));

await app.finish("a result hands the optimizer the build it measured");
