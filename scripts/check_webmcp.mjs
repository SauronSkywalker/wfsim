/// WEBMCP: THE BROWSER'S AGENT GETS THE DOOR'S TABLE (docs/AGENT.md §"WebMCP").
///
/// A stand-in `document.modelContext` is installed before the page's scripts
/// run, the way a browser with WebMCP has one. What it holds: the tools are
/// registered while the page is still booting — which is when a browser looks
/// — without breaking the boot; once it has booted the live set is every tool
/// the door lists, under the MCP spelling, with the choices only `META` knows,
/// and the first set is taken back by its signal; and a tool runs through the
/// door and answers with what the door answers.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000 });
const { evaluate, check, send } = app;
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__mcTools = [];
  document.modelContext = { registerTool(t, o) {
    window.__mcTools.push({ t, early: !window.__wfsimReady, signal: o && o.signal });
    return Promise.resolve();
  } };` });
await app.load("/");

const r = await evaluate(`(async () => {
  const all = window.__mcTools;
  const live = all.filter((x) => x.signal && !x.signal.aborted);
  const door = window.wfsim.tools();
  const find = live.find((x) => x.t.name === 'builder_weapons_find');
  const ran = find ? await find.t.execute({ query: 'soma' }) : null;
  return {
    early: all.filter((x) => x.early).length, n: live.length, door: door.length,
    names: live.map((x) => x.t.name), want: door.map((t) => t.name.replace(/\\./g, '_')),
    shaped: live.every((x) => x.t.description && x.t.inputSchema && x.t.inputSchema.type === 'object' && typeof x.t.execute === 'function'),
    firstTaken: all.filter((x) => x.early).every((x) => x.signal && x.signal.aborted),
    choices: live.some((x) => Object.values(x.t.inputSchema.properties || {}).some((p) => Array.isArray(p.enum) && p.enum.length)),
    ran: ran && JSON.parse(ran.content[0].text),
  };
})()`);

check("the tools are registered while the page is still booting", r.early > 0, r.early);
check("once booted, the live set is every tool the door lists", r.n > 0 && r.n === r.door
  && JSON.stringify(r.names) === JSON.stringify(r.want), `${r.n} of ${r.door}`);
check("...each with a description, a schema and an execute", r.shaped === true);
check("...with the choices only the booted page knows, the first set taken back",
  r.choices === true && r.firstTaken === true, JSON.stringify([r.choices, r.firstTaken]));
check("a tool runs through the door and answers as the door does",
  r.ran && r.ran.ok === true && r.ran.rows.some((x) => x.id === "soma"), JSON.stringify(r.ran).slice(0, 200));

await app.finish("the browser's agent gets the door's table");
