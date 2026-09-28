// ---- HEADLESS QUERIES -------------------------------------------------------
//
// THE ONE TABLE of what can be asked of WFSim with no page under it —
// docs/AGENT.md §"Headless queries". The door reads its queries from here, and
// so will every surface with no page: a query implemented anywhere else is a
// second answer that drifts from this one as WFSim changes.
//
// NO DOM AND NO PAGE GLOBAL below this line. What a query needs arrives on
// `host`, which the page (`HEADLESS_PAGE_HOST`) and a headless caller each
// provide; a build or a weapon a caller does not pass is the one on screen,
// and a host with no screen answers `screen_build`/`screen_weapon` with null.

/// The mod id a RIVEN takes in a board record — the bare word, because the
/// endpoint's ids are `[a-z0-9_]` and a riven's local name is one player's
/// label for their own item.
const BOARD_RIVEN_SLOT = "riven";

/// A match that ignores spaces — DE's Chinese names carry them and nobody types
/// them (`03-i18n.js` §squash states the same rule for the page's own lists).
const headlessTight = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
function headlessHit(names, q) {
  const want = headlessTight(q);
  return !want || names.some((n) => headlessTight(n).includes(want));
}

/// What a caller may have meant: the candidates sharing the longest opening
/// with `q`, at least three characters of it.
function headlessNear(q, xs, words) {
  const want = headlessTight(q);
  const head = (v) => { let i = 0; while (i < v.length && v[i] === want[i]) i++; return i; };
  return xs.map((x) => [x, Math.max(...words(x).map((w) => head(headlessTight(w))))])
    .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([x]) => x);
}

/// Every mod and arcane by id, for naming a board row's cards — from `meta`
/// itself, because a row names cards outside whatever pool is open.
let headlessNamesMemo = null;
function headlessNameOf(meta) {
  if (!headlessNamesMemo || headlessNamesMemo.meta !== meta) {
    const by = new Map();
    for (const pool of Object.values(meta.mod_pools || {})) for (const m of pool || []) by.set(m.id, m.name);
    for (const a of meta.arcanes || []) by.set(a.id, a.name);
    headlessNamesMemo = { meta, by };
  }
  return (id) => headlessNamesMemo.by.get(id) || id;
}

/// A refusal, in the door's shape (`agentNo`), for a caller that has no door.
function headlessNo(reason, detail = {}) {
  return { ok: false, reason, ...detail };
}

/// THE BOARD IN ITS READING ORDER, each row with its rank inside its group.
///
/// Rulers in their declared order (the primary first), then modes and kinds by
/// their best row, strongest first — each is a control on the build bar and a
/// control's order is its own answer — then best first inside a group. A group
/// is one ruler, one mode, riven or not: those compete with each other for
/// nothing. `benchIds` is `META.benchmarks` in order; `modes` the weapon's own.
function rankBoard(rows, benchIds, modes) {
  const order = (id) => {
    const i = benchIds.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const modeOrder = (m) => {
    const i = (modes || []).indexOf(m || "base");
    return i < 0 ? 99 : i;
  };
  const riven = (r) => !!(r && r.riven);
  const modeKey = (r) => `${r.benchmark}#${r.mode || "base"}`;
  const kindKey = (r) => `${modeKey(r)}#${riven(r) ? "r" : "p"}`;
  const best = {};
  for (const r of rows) {
    best[modeKey(r)] = Math.max(best[modeKey(r)] ?? -1, r.score || 0);
    best[kindKey(r)] = Math.max(best[kindKey(r)] ?? -1, r.score || 0);
  }
  const sorted = rows.slice().sort((a, b) =>
    order(a.benchmark) - order(b.benchmark)
    || (best[modeKey(b)] || 0) - (best[modeKey(a)] || 0)
    || modeOrder(a.mode) - modeOrder(b.mode)
    || (best[kindKey(b)] || 0) - (best[kindKey(a)] || 0)
    || (riven(a) ? 1 : 0) - (riven(b) ? 1 : 0)
    || (b.score || 0) - (a.score || 0));
  const seen = {};
  return sorted.map((row) => {
    const k = kindKey(row);
    seen[k] = (seen[k] || 0) + 1;
    return { row, mode: row.mode || "base", riven: riven(row), rank: seen[k], key: `${k}#${seen[k]}` };
  });
}

/// A weapon by id, or the refusal naming the ones a caller may have meant.
function headlessWeapon(host, id) {
  const all = host.meta().weapons || [];
  const w = all.find((x) => x.id === (id || host.screen_weapon()));
  if (w) return w;
  if (!id) return headlessNo("missing_argument", { argument: "weapon", wants: "weapon id" });
  return headlessNo("unknown_weapon", { alternatives: headlessNear(id, all, (x) => [x.id, x.name, x.name_en])
    .slice(0, 8).map((x) => x.id) });
}

/// An unmodelled reason in the reader's words — the contract `trGap` states.
function headlessGap(g, say) {
  if (typeof g === "string") return say(g);
  if (g && g.template) {
    const t = say(g.template);
    if (t !== g.template) {
      return Object.entries(g.params || {}).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t);
    }
  }
  return say((g && g.text) || "");
}

/// ONE STAT ROW as the panel draws it — the page's own wording, sources named.
/// A row is the server's answer, never recomputed here.
function headlessStat(x) {
  return {
    label: x.label, base: x.base, final: x.final,
    ...(x.note ? { note: x.note } : {}), ...(x.rule ? { rule: x.rule } : {}),
    ...(x.sources && x.sources.length
      ? { sources: x.sources.map((y) => `${y.mod} ${y.value}${y.note ? ` (${y.note})` : ""}`) } : {}),
  };
}

const HEADLESS_WEAPON_ARG = { kind: "string", what: "weapon id; on the page, the one open when omitted" };

const HEADLESS_QUERIES = [
  {
    id: "builder.weapons.find",
    what: "Find weapons by name, in any language WFSim speaks.",
    anchor: "#weapon",
    args: {
      query: { kind: "string", required: true, what: "name words, in any language WFSim speaks" },
      limit: { kind: "number", min: 1, max: 40, what: "rows to return, default 12" },
    },
    run({ query, limit = 12 }, host) {
      const locales = host.names();
      const hits = (host.meta().weapons || []).filter((w) =>
        headlessHit([w.id, w.name, w.name_en].concat(locales.map((l) => (l.weapons || {})[w.id])), query));
      return {
        found: hits.length,
        rows: hits.slice(0, limit).map((w) => ({ id: w.id, name: w.name, class: w.class,
          url: host.origin + host.weapon_path(w.id) })),
        ...(hits.length > limit ? { more: hits.length - limit } : {}),
      };
    },
  },
  {
    id: "builder.board.read",
    what: "Read a weapon's leaderboard: the measured best builds per ruler (the benchmark fight), mode, and with or without a riven, ranked. Each row carries the link that opens it.",
    page: "A row's key opens it with shell.preset.open (bar \"build\").",
    anchor: "#build-finder",
    args: {
      weapon: HEADLESS_WEAPON_ARG,
      riven: { kind: "string", what: "\"without\" (default), \"with\" or \"any\"", enum: () => ["without", "with", "any"] },
      mode: { kind: "string", what: "only this mode id" },
      limit: { kind: "number", min: 1, max: 20, what: "rows per group, default 3" },
    },
    async run({ weapon, riven = "without", mode: m, limit = 3 }, host) {
      const w = headlessWeapon(host, weapon);
      if (w.ok === false) return w;
      const rows = await host.board(w.id);
      if (!rows) return headlessNo("board_not_loaded", { because: "this weapon has no board rows yet" });
      const benches = host.meta().benchmarks || [];
      const name = headlessNameOf(host.meta());
      const evos = (w.evolutions || []).flatMap((t) => t.options || []);
      const evo = (id) => (evos.find((x) => x.id === id) || { name: id }).name;
      const picked = rankBoard(rows, benches.map((b) => b.id), w.modes)
        .filter((x) => (riven === "any" || x.riven === (riven === "with")) && (!m || x.mode === m) && x.rank <= limit);
      return {
        weapon: w.id,
        rows: picked.map(({ row: r, mode, riven: rv, rank, key }) => {
          const bench = benches.find((b) => b.id === r.benchmark);
          return {
            key, rank, ruler: bench ? host.tr(bench.name) : r.benchmark, ruler_id: r.benchmark,
            mode, riven: rv, score: String(r.shown != null ? r.shown : (r.score || 0).toFixed(4)),
            mods: (r.mods || []).filter((x) => x && x !== BOARD_RIVEN_SLOT).map(name),
            ...(r.exilus && r.exilus !== "none" ? { exilus: name(r.exilus) } : {}),
            ...((r.arcanes || []).some((x) => x && x !== "none")
              ? { arcanes: r.arcanes.filter((x) => x && x !== "none").map(name) } : {}),
            ...((r.evolutions || []).some(Boolean) ? { evolutions: r.evolutions.filter(Boolean).map(evo) } : {}),
            ...(r.riven ? { riven_stats: r.riven } : {}),
            link: `${host.origin}${host.weapon_path(w.id)}?bench=${encodeURIComponent(r.benchmark)}`
              + `&mode=${encodeURIComponent(mode)}&riven=${rv ? 1 : 0}`,
          };
        }),
      };
    },
  },
  {
    id: "builder.stats.read",
    what: "Read the stats panel for a build: every stat per form and part, base and final, with the mod each change came from, and what the weapon's model does not cover.",
    anchor: "#stats-rows",
    args: {
      build: { kind: "object", what: "the build, as a board row or a share carries it; on the page, the one on screen when omitted" },
    },
    async run({ build }, host) {
      const b = build || host.screen_build();
      if (!b) return headlessNo("missing_argument", { argument: "build", wants: "object" });
      const w = headlessWeapon(host, b.weapon);
      if (w.ok === false) return w;
      const r = await host.api("/api/panel", b);
      if (!r || r.ok === false) return headlessNo("panel_failed", { because: r ? r.error : "no answer" });
      const gaps = ((w.unmodeled_parts && w.unmodeled_parts.length) ? w.unmodeled_parts : (w.unmodeled || []))
        .map((g) => headlessGap(g, host.tr));
      if (w.passive_unmodeled) gaps.unshift(host.tr("this weapon's passive is not modelled yet"));
      return {
        policy: r.policy,
        not_modelled: gaps,
        forms: (r.forms || []).map((f) => ({
          label: f.label, meta: f.meta,
          stats: (f.stats || []).map(headlessStat),
          elements: (f.elements || []).map(headlessStat),
          indirect: (f.indirect || []).map(headlessStat),
          parts: (f.parts || []).map((pt) => ({
            label: pt.label, meta: pt.meta, damage_total: pt.damage_total, damage: pt.damage,
            stats: (pt.stats || []).map(headlessStat),
          })),
        })),
        conditionals: r.conditionals, buffs: r.buffs,
      };
    },
  },
];
