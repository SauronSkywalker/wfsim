// THE MCP SERVER — the headless queries (`headless.js`, the page's own table,
// generated) over the Model Context Protocol, at https://mcp.wfsim.app/mcp.
//
// A WORKER OF ITS OWN, not a path on the site's: it bundles the engine, and a
// site worker that carried it would start every page load that much colder.
// It holds no state between requests (Streamable HTTP without sessions), and it
// offers queries only — a caller with no page has no reader to act for
// (docs/AGENT.md §"Headless queries").
import { wasm_bindgen, module, ENGINE_DIGEST } from "./engine.js";
import { HEADLESS_ABOUT, HEADLESS_QUERIES, headlessCheckArgs, headlessNo, headlessSchema, headlessToolName } from "./headless.js";

const SITE = "https://wfsim.app";
const PROTOCOLS = ["2025-06-18", "2025-03-26"];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
};

// THE ENGINE STARTS ON THE FIRST CALL THAT NEEDS IT, not at load: a worker's
// global scope has a startup budget, and `tools/list` needs no engine at all.
let engine = null;
function api(path, body) {
  if (!engine) {
    wasm_bindgen.initSync({ module });
    engine = wasm_bindgen;
  }
  return JSON.parse(engine.api(path, JSON.stringify(body ?? {})));
}

let meta = null;
let names = null;
/// The worker as a headless host: the engine's own meta and names, the board
/// as the site publishes it right now, English, and no screen.
const host = (env) => ({
  meta: () => (meta ??= api("/api/meta")),
  names: () => (names ??= Object.values(api("/api/i18n"))),
  async board(id) {
    const url = `${SITE}/board/${encodeURIComponent(id)}.json`;
    const r = await (env.SITE ? env.SITE.fetch(url) : fetch(url));
    return r.ok ? r.json() : null;
  },
  api: async (path, body) => api(path, body),
  tr: (s) => s,
  origin: SITE,
  screen_weapon: () => null,
  screen_build: () => null,
});

const TOOLS = HEADLESS_QUERIES.map((q) => ({ q, name: headlessToolName(q.id) }));

async function call(env, name, args) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return headlessNo("unknown_tool", { alternatives: TOOLS.map((x) => x.name) });
  const bad = headlessCheckArgs(t.q, args || {});
  if (bad) return bad;
  try {
    const out = await t.q.run(args || {}, host(env));
    return out && out.ok === false ? out : { ok: true, ...out };
  } catch (e) {
    return headlessNo("query_failed", { because: String((e && e.message) || e) });
  }
}

async function answer(env, msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const asked = params && params.protocolVersion;
      return {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "wfsim", title: "WFSim", version: ENGINE_DIGEST },
        instructions: HEADLESS_ABOUT,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ q, name }) => ({
        name, title: q.id, description: q.what, inputSchema: headlessSchema(q.args),
        annotations: { readOnlyHint: true, openWorldHint: false },
      })) };
    case "tools/call": {
      const out = await call(env, params && params.name, params && params.arguments);
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: out.ok === false };
    }
    default:
      return { error: { code: -32601, message: `no method ${method}` } };
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path !== "/mcp") {
      return path === "/" ? Response.redirect(`${SITE}/llms.txt`, 302) : new Response("not found", { status: 404 });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    // NO STREAM TO OPEN: every answer is one JSON response, so the GET a client
    // uses to listen for server messages is refused, as the transport allows.
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", ...CORS } });
    let msg;
    try { msg = await request.json(); } catch (_) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "not JSON" } }, 400);
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || !msg.method) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "one JSON-RPC 2.0 request" } }, 400);
    }
    // A NOTIFICATION HAS NO ID AND GETS NO ANSWER.
    if (msg.id === undefined) return new Response(null, { status: 202, headers: CORS });
    const out = await answer(env, msg);
    return json(out.error ? { jsonrpc: "2.0", id: msg.id, error: out.error } : { jsonrpc: "2.0", id: msg.id, result: out });
  },
};
