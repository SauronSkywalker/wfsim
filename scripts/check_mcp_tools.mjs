// THE MCP SERVER'S QUERIES RUN WITH NO PAGE. `mcp/headless.js` is the page's
// headless part, copied; this runs every query in it against the engine
// `mcp/engine.js` bundles, with a host like the worker's — the published board
// read off `site/board/`, English, no screen. A query that reaches for a page
// global, or answers only with a build on screen, fails here and not in front
// of an agent. No browser; seconds.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { HEADLESS_QUERIES, headlessCheckArgs, headlessSchema, headlessToolName } =
  await import(pathToFileURL(resolve(ROOT, "mcp/headless.js")));

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failed++;
};

// THE ENGINE AS THE WORKER LOADS IT: the page's glue, and the wasm the site
// serves, by the path `engine.js` imports it from.
const src = readFileSync(resolve(ROOT, "mcp/engine.js"), "utf8");
const wasmPath = resolve(ROOT, "mcp", src.match(/^import module from "([^"]+)";$/m)[1]);
check("the engine the worker bundles is a file the site serves", existsSync(wasmPath), wasmPath);
const glue = src.split("\n").filter((l) => !/^(import|export) /.test(l)).join("\n");
const engine = new Function(`${glue}\nreturn wasm_bindgen;`)();
engine.initSync({ module: new WebAssembly.Module(readFileSync(wasmPath)) });
const api = (path, body) => JSON.parse(engine.api(path, JSON.stringify(body ?? {})));

const meta = api("/api/meta");
const names = Object.values(api("/api/i18n"));
const host = {
  meta: () => meta,
  names: () => names,
  async board(id) {
    const f = resolve(ROOT, "site/board", `${id}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  },
  api: async (path, body) => api(path, body),
  tr: (s) => s,
  origin: "https://wfsim.app",
  screen_weapon: () => null,
  screen_build: () => null,
};
const run = async (id, args) => {
  const q = HEADLESS_QUERIES.find((x) => x.id === id);
  return headlessCheckArgs(q, args) || q.run(args, host);
};

for (const q of HEADLESS_QUERIES) {
  check(`${q.id}: a tool name MCP accepts`, /^[a-zA-Z0-9_-]{1,64}$/.test(headlessToolName(q.id)));
  check(`${q.id}: its schema is an object`, headlessSchema(q.args).type === "object");
}

const found = await run("builder.weapons.find", { query: "月神" });
check("a weapon is found by its Chinese name", found.rows && found.rows.some((r) => r.id === "soma"), JSON.stringify(found));
check("...with the address its page lives at", found.rows && found.rows.every((r) => r.url.startsWith("https://wfsim.app/weapons/")),
  JSON.stringify(found.rows));

const board = await run("builder.board.read", { weapon: "soma_prime", limit: 1 });
const top = (board.rows || []).find((r) => r.build);
check("a board reads with no weapon on screen", !!top, JSON.stringify(board).slice(0, 300));
check("...each row with the link that opens it", (board.rows || []).every((r) => /\?bench=.+&mode=.+&riven=[01]$/.test(r.link)),
  JSON.stringify((board.rows || []).map((r) => r.link)));
check("...and its cards by name, not id", top && top.mods.every((m) => !/^[a-z0-9_]+$/.test(m)), top && top.mods);

const stats = top && await run("builder.stats.read", { build: top.build });
check("a row's build reads the stats panel", !!stats && Array.isArray(stats.forms) && stats.forms.length > 0,
  JSON.stringify(stats).slice(0, 300));

const nobody = await run("builder.stats.read", {});
check("with no screen, a missing build is refused, not guessed", nobody.ok === false && nobody.reason === "missing_argument",
  JSON.stringify(nobody));
const typo = await run("builder.board.read", { weapon: "somaa" });
check("a mistyped weapon is refused with what was meant", typo.ok === false && typo.alternatives.includes("soma"),
  JSON.stringify(typo));

console.log(failed ? `\n${failed} failed` : "\nthe MCP server's queries run with no page");
process.exit(failed ? 1 : 0);
