// SPDX-License-Identifier: AGPL-3.0-or-later
// A CHAT MESSAGE IN, A REPLY OUT — docs/AGENT.md §"The QQ bot". Commands are
// `zk` (rivens) and `pz` (builds), a trailing number is how many to show. Every
// number comes from the headless table; this only reads the words and lays the
// answer out, in the language overlay's words (`ui` keyed by English).

const MAX_SHOWN = 10;
const SITE = "https://wfsim.app";
const squash = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

export function makeAnswer({ run, meta, zh, headless }) {
  const t = (s, p = {}) => Object.entries(p).reduce((x, [k, v]) => x.split(`{${k}}`).join(String(v)),
    (zh.ui && zh.ui[s]) || s);
  const weaponName = (w) => (zh.weapons && zh.weapons[w.id]) || w.name;
  const modName = (id) => { const c = String(id).split("@")[0]; return (zh.mods && zh.mods[c]) || c; };
  const arcaneName = (id) => (zh.arcanes && zh.arcanes[id]) || id;
  const evoName = (id) => (zh.evolutions && zh.evolutions[id]) || id;
  // EVERY NAME A WEAPON GOES BY, longest first, so "Boar Prime" wins over "Boar".
  const weaponNames = (meta.weapons || []).flatMap((w) => [w.id, w.name, w.name_en, zh.weapons && zh.weapons[w.id]]
    .filter(Boolean).map((n) => ({ w, n: squash(n) }))).sort((a, b) => b.n.length - a.n.length);
  const rulerShort = (b) => t(b.name).split(" · ")[0];
  const statNames = (cls) => headless.rivenStatNames((meta.riven_stats || {})[cls] || [], [zh]);
  const statZh = (cls, id) => {
    const s = ((meta.riven_stats || {})[cls] || []).find((x) => x.id === id);
    if (!s) return id;
    const n = statNames(cls).find((x) => x.stat.id === id);
    return (n && n.names[1]) || headless.rivenStatNameEn(s);
  };

  /// `zk 托里德 5` → { cmd: "zk", rest: "托里德", n: 5 }.
  function parse(text) {
    let s = String(text || "").replace(/<@!?[^>]*>/g, " ").trim();
    const m = s.match(/^(zk|pz|帮助|help|\?|？)\s*/i);
    const cmd = m ? m[1].toLowerCase() : "";
    if (m) s = s.slice(m[0].length);
    const num = s.match(/(?:^|\s)(\d{1,2})\s*$/);
    const n = num ? Math.max(1, Math.min(MAX_SHOWN, Number(num[1]))) : null;
    if (num) s = s.slice(0, num.index);
    return { cmd: cmd === "zk" || cmd === "pz" ? cmd : cmd ? "help" : "", rest: s.trim(), n };
  }
  /// The weapon the words start with, and what is left after it.
  function weaponOf(rest) {
    const q = squash(rest);
    const hit = weaponNames.find((x) => x.n && q.startsWith(x.n));
    return hit ? { w: hit.w, left: q.slice(hit.n.length) } : null;
  }

  const help = () => [
    t("WFSim Nona — commands"),
    `zk ${t("weapon")} [N]  ${t("the rivens the board has measured for it, against its best riven-free build")}`,
    `pz ${t("weapon")} [${t("ruler")}] [N]  ${t("its best measured builds")}`,
    `${t("e.g.")} zk 托里德 5 · pz 托里德 爆破使 3`,
  ].join("\n");

  async function pz(rest, n) {
    const hit = weaponOf(rest);
    if (!hit) return t("No weapon by that name.");
    const benches = meta.benchmarks || [];
    const ruler = benches.find((b) => hit.left && (squash(rulerShort(b)) === hit.left || squash(b.name.split(" · ")[0]) === hit.left))
      || benches.find((b) => b.primary) || benches[0];
    const r = await run("builder.board.read", { weapon: hit.w.id, riven: "without", limit: n || 1 });
    if (r.ok === false) return t("Nothing measured for this weapon yet.");
    const rows = r.rows.filter((x) => x.ruler_id === ruler.id);
    if (!rows.length) return t("Nothing measured for this weapon under this ruler yet.");
    const mode = rows[0].mode;
    const shown = rows.filter((x) => x.mode === mode).length;
    const card = `${SITE}${headless.headlessWeaponPath(meta.weapons || [], hit.w.id)}/card?kind=pz&ruler=${encodeURIComponent(ruler.id)}&mode=${encodeURIComponent(mode)}&n=${shown}`;
    const text = [`${weaponName(hit.w)} · ${rulerShort(ruler)}`]
      .concat(rows.filter((x) => x.mode === mode).map((x) => `#${x.rank} ${x.score}  ${(x.build ? x.build.mods : []).map(modName).join("、")}${
        x.build && x.build.arcane.length ? ` | ${t("Arcane")}: ${x.build.arcane.map(arcaneName).join("、")}` : ""}${
        x.build && x.build.evolutions.length ? ` | ${t("Evolutions")}: ${x.build.evolutions.map(evoName).join("、")}` : ""}`))
      .join("\n");
    return { line: `${weaponName(hit.w)} · ${rulerShort(ruler)}`, card, text };
  }

  async function zk(rest, n) {
    const hit = weaponOf(rest);
    if (!hit) return t("No weapon by that name.");
    const r = await run("builder.rivens.read", { weapon: hit.w.id });
    if (r.ok === false || !r.groups.length) return t("No riven of this weapon has been measured yet.");
    const g = r.groups[0];
    const cls = hit.w.riven_class;
    const shown = Math.min(n || 3, g.rivens.length);
    const card = `${SITE}${headless.headlessWeaponPath(meta.weapons || [], hit.w.id)}/card?kind=zk&ruler=${encodeURIComponent(g.ruler_id)}&mode=${encodeURIComponent(g.mode)}&n=${shown}`;
    const line = (x, i) => `${i + 1}. ${x.stat_ids.bonuses.map((id) => "+" + statZh(cls, id)).join(" ")}${
      x.stat_ids.malus ? " −" + statZh(cls, x.stat_ids.malus) : ""}  ${x.score}${x.gain == null ? "" : `（${x.gain >= 0 ? "+" : "−"}${Math.abs(x.gain * 100).toFixed(1)}%）`}`;
    const text = [`${weaponName(hit.w)} · ${t(g.ruler).split(" · ")[0]}`,
      `${t("The board's best riven-free build")}: ${g.riven_free ? g.riven_free.score : "—"}`]
      .concat(g.rivens.slice(0, shown).map(line)).join("\n");
    return { line: `${weaponName(hit.w)} · ${t(g.ruler).split(" · ")[0]} · ${t("Riven Analyst")}`, card, text };
  }

  /// `{ text }`, or `{ line, card, text }` — the long image at `card` with
  /// `line` under it, and `text` the answer in words if the image cannot be made.
  return async function answer(text) {
    const p = parse(text);
    const r = p.cmd === "zk" ? await zk(p.rest, p.n) : p.cmd === "pz" ? await pz(p.rest, p.n) : help();
    return typeof r === "string" ? { text: r } : r;
  };
}
