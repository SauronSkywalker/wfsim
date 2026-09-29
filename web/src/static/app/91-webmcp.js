// ---- WEBMCP ----------------------------------------------------------------
//
// The door's table, handed to the browser's own agent through WebMCP
// (`document.modelContext.registerTool`, `navigator.modelContext` on older
// Chrome) — docs/AGENT.md §"WebMCP". The same tools `window.wfsim.tools()`
// lists and Nona calls, run through the same `agentDo`, so an agent in the
// browser can do nothing a reader's own controls cannot.
//
// TWICE: as the script loads, which is when a browser looks, and again once
// the page has booted. An argument's list of choices comes from `META`, which
// the first time has not arrived, so that set goes without them and is taken
// back by its signal when the full one replaces it. A call made before the
// boot waits for it.
(function registerWebMcp() {
  const mc = (typeof document !== "undefined" && document.modelContext)
    || (typeof navigator !== "undefined" && navigator.modelContext);
  if (!mc) return;
  const ready = () => (window.__wfsimReady ? Promise.resolve()
    : new Promise((r) => window.addEventListener("wfsim:ready", r, { once: true })));
  const schemaOf = (a, booted) => headlessSchema(booted ? a.args
    : Object.fromEntries(Object.entries(a.args || {}).map(([k, s]) => [k, { ...s, enum: undefined }])));
  let controller = null;
  const register = (booted) => {
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    for (const a of AGENT_ACTIONS.filter((x) => !x.hand)) {
      const tool = {
        name: headlessToolName(a.id),
        description: a.what,
        inputSchema: schemaOf(a, booted),
        annotations: { readOnlyHint: !!a.query },
        async execute(args) {
          await ready();
          const out = await agentDo(a.id, args || {});
          return { content: [{ type: "text", text: JSON.stringify(out) }], isError: out.ok === false };
        },
      };
      try {
        Promise.resolve(mc.registerTool(tool, { signal })).catch(() => {});
      } catch (_) { /* a browser whose API differs keeps the page as it was */ }
    }
  };
  if (typeof mc.registerTool !== "function") return;
  register(false);
  ready().then(() => register(true));
})();
