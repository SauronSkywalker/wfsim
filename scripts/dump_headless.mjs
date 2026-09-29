// THE MCP SERVER'S TOOLS AS JSON, for the site build: what the server offers
// and how WFSim introduces itself, read from the definitions the server runs —
// the headless table (`mcp/headless.js`, generated from the page's part) and
// the server's own account tools (`mcp/account.js`) — and from nowhere else.
//
// …and the A2A agent card, from the function the server serves it with
// (`mcp/a2a.js`), versioned by the engine `mcp/engine.js` bundles.
//
//   node scripts/dump_headless.mjs   # {about, tools: [{name, id, description, inputSchema}], agent_card}
import { HEADLESS_ABOUT, HEADLESS_QUERIES, headlessSchema, headlessToolName } from "../mcp/headless.js";
import { ACCOUNT_TOOLS } from "../mcp/account.js";
import { agentCard } from "../mcp/a2a.js";
import { readFileSync } from "node:fs";

const engine = readFileSync(new URL("../mcp/engine.js", import.meta.url), "utf8");
const digest = (/ENGINE_DIGEST = "(\w+)"/.exec(engine) || [])[1];
if (!digest) throw new Error("mcp/engine.js names no ENGINE_DIGEST");

process.stdout.write(JSON.stringify({
  about: HEADLESS_ABOUT,
  tools: HEADLESS_QUERIES.map((q) => ({
    name: headlessToolName(q.id), id: q.id, description: q.what, inputSchema: headlessSchema(q.args),
  })).concat(ACCOUNT_TOOLS.map((t) => ({
    name: t.name, id: t.title, description: t.what, inputSchema: headlessSchema(t.args),
  }))),
  agent_card: agentCard(digest),
}));
