// THE MCP SERVER'S DOOR: who is calling, and how often (docs/AGENT.md §"The MCP
// server"). `mcp/index.js` itself, with its engine stubbed — nothing here runs a
// query — the site's worker stubbed at `SITE`, and each limiter a counter.
// What it holds: the server describes itself as a protected resource, a tool
// call without a key spends the address's allowance and with one the key's, the
// handshake and the list spend nothing, a key that is not one is refused rather
// than read as none, and a key is looked up once and not on every call.
// No network, no browser.
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === "./engine.js" && ctx.parentURL && ctx.parentURL.endsWith("/mcp/index.js")) {
    return { url: "data:text/javascript," + encodeURIComponent(
      "export const wasm_bindgen = { initSync() {}, api() { return '{}'; } };" +
      "export const module = null; export const ENGINE_DIGEST = 'test';"), shortCircuit: true };
  }
  return next(spec, ctx);
}`));

const { default: mcp } = await import("../mcp/index.js");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failed++;
};

const limiter = (limit) => {
  const used = new Map();
  return { used, limit: async ({ key }) => { used.set(key, (used.get(key) || 0) + 1); return { success: used.get(key) <= limit }; } };
};
let lookups = 0;
const env = {
  ADDRESS_LIMIT: limiter(2),
  KEY_LIMIT: limiter(3),
  SITE: { fetch: async (req) => {
    lookups++;
    const ok = req.headers.get("authorization") === "Bearer wfa_good";
    return new Response(JSON.stringify(ok ? { ok: true, agent: { id: "ag1", name: "A" } } : { ok: false, reason: "bad_key" }),
      { status: ok ? 200 : 401 });
  } },
};
let n = 0;
const rpc = (method, { key, ip = "1.1.1.1" } = {}) => mcp.fetch(new Request("https://mcp.wfsim.app/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params: method === "tools/call" ? { name: "no_such_tool", arguments: {} } : {} }),
}), env);

const prm = await (await mcp.fetch(new Request("https://mcp.wfsim.app/.well-known/oauth-protected-resource"), env)).json();
check("the server describes itself as a protected resource the site issues keys for",
  prm.resource === "https://mcp.wfsim.app/mcp" && prm.authorization_servers[0] === "https://wfsim.app"
    && prm.bearer_methods_supported.includes("header"), JSON.stringify(prm));

const codes = [];
for (let i = 0; i < 3; i++) codes.push((await rpc("tools/call")).status);
check("without a key, tool calls spend the address's allowance", JSON.stringify(codes) === "[200,200,429]", JSON.stringify(codes));
const over = await rpc("tools/call");
check("...and the refusal says when to come back", over.status === 429 && over.headers.get("retry-after") === "60");
check("the handshake and the list spend nothing", (await rpc("initialize")).status === 200 && (await rpc("tools/list")).status === 200);
check("another address has its own allowance", (await rpc("tools/call", { ip: "2.2.2.2" })).status === 200);

const withKey = [];
for (let i = 0; i < 4; i++) withKey.push((await rpc("tools/call", { key: "wfa_good" })).status);
check("with a key, calls spend the key's allowance, not the address's", JSON.stringify(withKey) === "[200,200,200,429]",
  JSON.stringify(withKey));
check("...and the key is looked up once, not on every call", lookups === 1, lookups);

const bad = await rpc("tools/list", { key: "wfa_revoked" });
check("a key that is not one is refused, pointing at the metadata",
  bad.status === 401 && /resource_metadata=/.test(bad.headers.get("www-authenticate") || ""), bad.status);

console.log(failed ? `\n${failed} failed` : "\nthe MCP server knows who calls, and how often");
process.exit(failed ? 1 : 0);
