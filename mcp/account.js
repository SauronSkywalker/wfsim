// THE MCP SERVER'S OWN TOOLS — a person's saved builds (docs/AGENT.md §"The MCP
// server"). A module of its own, with no engine in it, so the site build can
// state these tools on the server card from the definitions the server runs.
import { headlessCheckArgs, headlessNo, headlessSeat, headlessStateAxes, headlessWeapon, headlessWeaponPath } from "./headless.js";

const SITE = "https://wfsim.app";

// ---- the person's own builds ----------------------------------------------------------
//
// NOT IN THE HEADLESS TABLE: a page holds its builds in its own storage, so only
// a caller with no page needs these, and only with a key its person claimed
// (worker/agents.js). They read and write the person's synced builds through
// the site's `/api/cloud/sync`, as the page does, and translate with the same
// `headlessSeat`/`headlessStateAxes` the page does.
/// The page's one build list — and, from a page before it, one per weapon.
const BUILD_LIST = /^wfsim-presets-(.+-)?builder-builds$/;
const BUILDS_LIST = "wfsim-presets-builder-builds";
/// A preset name's length on the page's own rename field.
const BUILD_NAME_MAX = 24;
const buildLink = (meta, weapon, id) => `${SITE}${headlessWeaponPath(meta.weapons || [], weapon)}?build=${encodeURIComponent(id)}`;

async function cloudSync({ env, auth }, body) {
  const r = await env.SITE.fetch(new Request(`${SITE}/api/cloud/sync`, {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));
  const j = await r.json().catch(() => ({ ok: false, reason: `http_${r.status}` }));
  if (j.ok) return j;
  const reason = j.reason === "not_signed_in" ? "key_not_claimed" : j.reason === "not_included" ? "not_a_member" : j.reason || "sync_failed";
  return headlessNo(reason, { see: `${SITE}/auth.md` });
}

/// Every build the account has saved, newest write of each.
async function savedBuilds(ctx) {
  const out = new Map();
  let r = await cloudSync(ctx, { since: 0 });
  for (;;) {
    if (r.ok === false) return r;
    for (const e of r.entries) out.set(e.id, e);
    if (!r.next) break;
    r = await cloudSync(ctx, { after: r.next });
  }
  return [...out.values()].filter((e) => e.body && e.body.state && BUILD_LIST.test(e.list));
}

const NEEDS = "Needs a key the person claimed: https://wfsim.app/auth.md";
export const ACCOUNT_TOOLS = [
  {
    name: "account_builds_list",
    title: "account.builds.list",
    what: `List the builds saved in the person's WFSim account, each with its \`build\` (what builder_stats_read takes) and the link that opens it. ${NEEDS}`,
    readOnly: true,
    args: { weapon: { kind: "string", what: "only this weapon id" } },
    async run({ weapon }, ctx) {
      const rows = await savedBuilds(ctx);
      if (rows.ok === false) return rows;
      const meta = ctx.host.meta();
      const mine = rows.filter((e) => !weapon || e.body.state.weapon === weapon);
      return {
        found: mine.length,
        rows: mine.map((e) => ({
          id: e.id, name: e.body.name, weapon: e.body.state.weapon, saved_at: new Date(e.updated_at).toISOString(),
          build: headlessSeat(meta, e.body.state), link: buildLink(meta, e.body.state.weapon, e.id),
        })),
      };
    },
  },
  {
    name: "account_builds_save",
    title: "account.builds.save",
    what: `Save a build to the person's WFSim account, where every browser they sign in on shows it. A new build unless \`id\` names one to replace. ${NEEDS}`,
    readOnly: false,
    args: {
      build: { kind: "object", required: true, what: "the build: {weapon, mods: [mod ids], arcane: [arcane ids], evolutions: [ids], mode} — a board row's `build` is one" },
      name: { kind: "string", what: `what the person sees it called, at most ${BUILD_NAME_MAX} characters` },
      exilus: { kind: "string", what: "which of `mods` sits in the exilus slot" },
      id: { kind: "string", what: "a saved build's id, to replace it" },
    },
    async run({ build, name, exilus, id }, ctx) {
      const h = ctx.host;
      const w = headlessWeapon(h, build.weapon);
      if (w.ok === false) return w;
      // A BUILD THE ENGINE CANNOT READ IS NOT SAVED: the person would open a
      // build that fails on their page.
      const panel = ctx.api("/api/panel", build);
      if (!panel || panel.ok === false) return headlessNo("bad_build", { because: panel ? panel.error : "no answer" });
      let prior = null;
      if (id) {
        const rows = await savedBuilds(ctx);
        if (rows.ok === false) return rows;
        prior = rows.find((e) => e.id === id);
        if (!prior) return headlessNo("unknown_build", { alternatives: rows.map((e) => e.id).slice(0, 12) });
      }
      const entry = id || crypto.randomUUID();
      const { lastResult, ...kept } = (prior && prior.body) || {};
      const body = { ...kept, id: entry, scope: w.id, savedAt: Date.now(),
        name: String(name || kept.name || "agent build").slice(0, BUILD_NAME_MAX),
        state: { weapon: w.id, ...headlessStateAxes(h.meta(), build, w.id, exilus) } };
      const r = await cloudSync(ctx, { changes: [{ id: entry, list: BUILDS_LIST, body, updated_at: Date.now() }], pull: false });
      if (r.ok === false) return r;
      return { id: entry, name: body.name, weapon: w.id, replaced: !!prior, link: buildLink(h.meta(), w.id, entry) };
    },
  },
];

/// One of these tools, called with `ctx` = `{ env, auth, host, api }` — the
/// worker's service bindings, the caller's Authorization header, and the
/// headless host and engine the queries use.
export async function callAccount(ctx, t, args) {
  if (!ctx.auth) return headlessNo("needs_key", { see: `${SITE}/auth.md` });
  const bad = headlessCheckArgs(t, args || {});
  if (bad) return bad;
  try {
    return { ok: true, ...(await t.run(args || {}, ctx)) };
  } catch (e) {
    return headlessNo("query_failed", { because: String((e && e.message) || e) });
  }
}
