// THE HEADLESS TABLE AS JSON, for the site build: what the MCP server offers
// and how WFSim introduces itself, read from the table the server runs
// (`mcp/headless.js`, generated from the page's part) and from nowhere else.
//
//   node scripts/dump_headless.mjs   # {about, tools: [{name, id, description, inputSchema}]}
import { HEADLESS_ABOUT, HEADLESS_QUERIES, headlessSchema, headlessToolName } from "../mcp/headless.js";

process.stdout.write(JSON.stringify({
  about: HEADLESS_ABOUT,
  tools: HEADLESS_QUERIES.map((q) => ({
    name: headlessToolName(q.id), id: q.id, description: q.what, inputSchema: headlessSchema(q.args),
  })),
}));
