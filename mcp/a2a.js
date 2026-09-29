// THE A2A AGENT — the headless queries over the Agent2Agent protocol, at
// https://mcp.wfsim.app/a2a (docs/AGENT.md §"The A2A agent").
//
// A SKILL IS A QUERY, and nothing else: the card lists the headless table and
// the endpoint runs it, so a skill the card names is one a caller can run. It
// answers `SendMessage` with a message at once — no task outlives the call —
// and has no model behind it: a data part names the skill and its arguments,
// and plain text is read as a weapon to find. A module with no engine in it,
// so the site build writes the card from the same function the server serves.
import { HEADLESS_ABOUT, HEADLESS_QUERIES, headlessCheckArgs, headlessNo, headlessSchema, headlessToolName } from "./headless.js";

export const A2A_URL = "https://mcp.wfsim.app/a2a";
const SITE = "https://wfsim.app";
const FIND = "builder.weapons.find";

/// THE AGENT CARD (A2A §8), from the table the endpoint runs.
export function agentCard(version) {
  return {
    name: "WFSim",
    description: HEADLESS_ABOUT,
    version,
    provider: { organization: "WFSim", url: SITE },
    documentationUrl: `${SITE}/llms.txt`,
    iconUrl: `${SITE}/logo.svg`,
    supportedInterfaces: [{ url: A2A_URL, protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    // A KEY IS OPTIONAL: it raises the allowance, as on the MCP server.
    securitySchemes: { wfsim_key: { httpAuthSecurityScheme: { scheme: "Bearer",
      description: `Optional. An agent key raises the allowance; ${SITE}/auth.md issues one.` } } },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: HEADLESS_QUERIES.map((q) => ({
      id: q.id,
      name: headlessToolName(q.id),
      description: `${q.what} Send a data part {"skill": "${q.id}", "args": {...}}; args: ${JSON.stringify(headlessSchema(q.args).properties)}.`,
      tags: ["warframe", ...q.id.split(".").slice(0, 2)],
      examples: q.id === FIND ? ["Soma Prime", `{"skill": "${FIND}", "args": {"query": "soma"}}`] : [],
      inputModes: q.id === FIND ? ["application/json", "text/plain"] : ["application/json"],
      outputModes: ["application/json"],
    })),
  };
}

// ---- the JSON-RPC endpoint ---------------------------------------------------------------

/// WHAT A MESSAGE ASKS FOR: the skill and its arguments from a data part, or
/// plain text as a weapon to find. Both 1.0's parts (`{data}`, `{text}`) and
/// 0.3's (`{kind, data}`, `{kind, text}`) are read.
function asked(message) {
  const parts = (message && message.parts) || [];
  const data = parts.find((p) => p && p.data && typeof p.data === "object" && !Array.isArray(p.data));
  if (data) return { skill: data.data.skill, args: data.data.args || {} };
  const text = parts.filter((p) => p && typeof p.text === "string").map((p) => p.text).join(" ").trim();
  return text ? { skill: FIND, args: { query: text }, fromText: true } : null;
}

/// A reply, in the shape the version that asked reads: 1.0's `{message}` with
/// `ROLE_AGENT`, or 0.3's bare message with `kind`.
function reply(v03, message, text, data) {
  const id = crypto.randomUUID();
  const context = (message && message.contextId) || crypto.randomUUID();
  if (v03) {
    return { kind: "message", messageId: id, contextId: context, role: "agent",
      parts: [{ kind: "text", text }, { kind: "data", data }] };
  }
  return { message: { messageId: id, contextId: context, role: "ROLE_AGENT",
    parts: [{ text }, { data, mediaType: "application/json" }] } };
}

const SEND = new Set(["SendMessage", "message/send"]);
const NO_TASKS = new Set(["GetTask", "CancelTask", "SubscribeToTask", "tasks/get", "tasks/cancel", "tasks/resubscribe"]);
const UNSUPPORTED = new Set(["SendStreamingMessage", "message/stream", "ListTasks", "GetExtendedAgentCard",
  "CreateTaskPushNotificationConfig", "GetTaskPushNotificationConfig", "ListTaskPushNotificationConfigs",
  "DeleteTaskPushNotificationConfig", "tasks/pushNotificationConfig/set", "tasks/pushNotificationConfig/get",
  "agent/getAuthenticatedExtendedCard"]);

/// One JSON-RPC request: `{ result }` or `{ error }`. `run(q, args)` runs a
/// headless query with the worker's host.
export async function a2aAnswer(msg, run) {
  const { method, params } = msg;
  if (SEND.has(method)) {
    const message = params && params.message;
    const want = asked(message);
    if (!want) return { error: { code: -32602, message: "the message needs a data part {skill, args} or text" } };
    const q = HEADLESS_QUERIES.find((x) => x.id === want.skill || headlessToolName(x.id) === want.skill);
    const v03 = method === "message/send";
    if (!q) {
      const out = headlessNo("unknown_skill", { skills: HEADLESS_QUERIES.map((x) => x.id) });
      return { result: reply(v03, message, `No skill "${want.skill}". The card lists them: ${SITE}/.well-known/agent-card.json`, out) };
    }
    const bad = headlessCheckArgs(q, want.args);
    let out;
    try {
      out = bad || await run(q, want.args);
    } catch (e) {
      out = headlessNo("query_failed", { because: String((e && e.message) || e) });
    }
    const ok = !(out && out.ok === false);
    const text = !ok ? `${q.id} refused: ${out.reason}.`
      : want.fromText ? `Weapons matching "${want.args.query}". For any other skill send a data part {"skill", "args"}.`
      : `${q.id} answered.`;
    return { result: reply(v03, message, text, ok ? { ok: true, ...out } : out) };
  }
  if (NO_TASKS.has(method)) return { error: { code: -32001, message: "no such task: every answer is a message, and no task is kept" } };
  if (UNSUPPORTED.has(method)) return { error: { code: -32004, message: `${method} is not supported` } };
  return { error: { code: -32601, message: `no method ${method}` } };
}
