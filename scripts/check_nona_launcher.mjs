/// NONA'S LAUNCHER MOVES (nona/ui/launcher.js), driven by real mouse and touch
/// input over CDP: a drag takes it off what it covers and settles it on the
/// nearer side edge without opening Nona; a press that barely moves still
/// opens her; where it was left survives a reload and stays on screen when the
/// window shrinks; a release off the button does not eat the next click; and a
/// finger drags it on a phone.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000, base: process.env.WFSIM_BASE });
const { evaluate, check, send, sleep } = app;

const rect = () => evaluate(`(() => { const r = document.getElementById('nona-fab').getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight,
    open: !document.getElementById('nona').hidden }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
const drag = async (from, to, steps = 8) => {
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await mouse("mouseReleased", to.x, to.y);
  await sleep(150);
};
const centre = (r) => ({ x: r.l + r.w / 2, y: r.t + r.h / 2 });

await evaluate(`localStorage.removeItem('wfsim-nona-launcher')`);
const home = await rect();
const homeRight = home.vw - home.r;

// A DRAG to the left half, two-fifths down: it settles on the left edge and Nona stays shut.
await drag(centre(home), { x: home.vw * 0.3, y: home.vh * 0.4 });
const left = await rect();
check("a drag settles it on the nearer side edge", left.l >= 10 && left.l <= 30, JSON.stringify(left));
check("...at the height it was left", Math.abs((left.t + left.h / 2) - left.vh * 0.4) < 30, JSON.stringify(left));
check("...and a drag does not open Nona", left.open === false);

// A PRESS THAT BARELY MOVES is a click.
const c = centre(left);
await mouse("mousePressed", c.x, c.y);
await mouse("mouseMoved", c.x + 2, c.y + 1);
await mouse("mouseReleased", c.x + 2, c.y + 1);
await sleep(300);
const clicked = await rect();
check("a press that barely moves still opens Nona", clicked.open === true);
await evaluate(`document.getElementById('nona-close').click()`);
await sleep(150);

// RELEASED OFF THE BUTTON, the next real click is not eaten.
const r2 = await rect();
await drag(centre(r2), { x: r2.vw * 0.8, y: r2.vh * 0.5 });
const right = await rect();
check("dragged to the right half, it settles on the right edge", Math.abs((right.vw - right.r) - homeRight) < 4, JSON.stringify(right));
await evaluate(`document.getElementById('nona-fab').click()`);
await sleep(300);
check("...and the next click after a drag opens Nona", (await rect()).open === true);
await evaluate(`document.getElementById('nona-close').click()`);
await sleep(150);

// IT SURVIVES A RELOAD, and a smaller window keeps it on screen.
await drag(centre(await rect()), { x: 60, y: 200 });
const before = await rect();
await send("Page.reload", {});
await sleep(9000);
const after = await rect();
check("where it was left survives a reload",
  Math.abs(after.l - before.l) < 4 && Math.abs(after.t - before.t) < 4, JSON.stringify({ before, after }));
await send("Emulation.setDeviceMetricsOverride", { width: 700, height: 360, deviceScaleFactor: 1, mobile: false });
await sleep(400);
const small = await rect();
check("a smaller window keeps it on screen, below the topbar",
  small.t >= 60 && small.b <= small.vh && small.l >= 0 && small.r <= small.vw, JSON.stringify(small));

// A FINGER drags it on a phone.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await sleep(600);
const p0 = await rect();
const s = centre(p0), e = { x: p0.vw - 60, y: p0.vh * 0.7 };
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: s.x, y: s.y }] });
for (let i = 1; i <= 8; i++) {
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: s.x + ((e.x - s.x) * i) / 8, y: s.y + ((e.y - s.y) * i) / 8 }] });
}
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(300);
const p1 = await rect();
check("a finger drags it on a phone, to the right edge, without opening Nona",
  p1.vw - p1.r < 30 && Math.abs((p1.t + p1.h / 2) - p1.vh * 0.7) < 40 && p1.open === false, JSON.stringify({ p0, p1 }));

await evaluate(`localStorage.removeItem('wfsim-nona-launcher')`);
await app.finish("nona's launcher moves where the reader puts it, and still opens her");
