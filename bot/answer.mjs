// SPDX-License-Identifier: AGPL-3.0-or-later
// A CHAT MESSAGE IN, A REPLY OUT — docs/AGENT.md §"The QQ bot". Commands are
// `zk` (rivens) and `pz` (builds), a trailing number is how many to show. Every
// number comes from the headless table; this only reads the words and lays the
// answer out, in the language overlay's words (`ui` keyed by English) and in
// Nona's voice (docs/NONA.md §"Her voice"): the line calm, the kaomoji her.

const MAX_SHOWN = 10;
const SITE = "https://wfsim.app";
const squash = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
/// A WEAPON'S NAME as people type it: no spaces, hyphens or dots, any width —
/// "mk-1盗贼" and "MK1 盗贼" are both MK1-盗贼.
const nameFold = (s) => squash(s).replace(/[-_.·・'’]/g, "");

export function makeAnswer({ run, meta, zh, headless }) {
  const t = (s, p = {}) => Object.entries(p).reduce((x, [k, v]) => x.split(`{${k}}`).join(String(v)),
    (zh.ui && zh.ui[s]) || s);
  const weaponName = (w) => (zh.weapons && zh.weapons[w.id]) || w.name;
  const modName = (id) => { const c = String(id).split("@")[0]; return (zh.mods && zh.mods[c]) || c; };
  const arcaneName = (id) => (zh.arcanes && zh.arcanes[id]) || id;
  const evoName = (id) => (zh.evolutions && zh.evolutions[id]) || id;
  // EVERY NAME A WEAPON GOES BY, longest first, so "Boar Prime" wins over "Boar".
  const weaponNames = (meta.weapons || []).flatMap((w) => [w.id, w.name, w.name_en, zh.weapons && zh.weapons[w.id]]
    .filter(Boolean).map((n) => ({ w, n: nameFold(n) }))).sort((a, b) => b.n.length - a.n.length);
  const rulerShort = (b) => t(b.name).split(" · ")[0];
  const statNames = (cls) => headless.rivenStatNames((meta.riven_stats || {})[cls] || [], [zh]);
  const statZh = (cls, id) => {
    const s = ((meta.riven_stats || {})[cls] || []).find((x) => x.id === id);
    if (!s) return id;
    const n = statNames(cls).find((x) => x.stat.id === id);
    return (n && n.names[1]) || headless.rivenStatNameEn(s);
  };

  /// `zk 托里德 5` → { cmd: "zk", rest: "托里德 5" }.
  function parse(text) {
    let s = String(text || "").replace(/<@!?[^>]*>/g, " ").trim();
    const m = s.match(/^(zk|pz|帮助|help|\?|？)\s*/i);
    const cmd = m ? m[1].toLowerCase() : "";
    if (m) s = s.slice(m[0].length);
    return { cmd: cmd === "zk" || cmd === "pz" ? cmd : cmd ? "help" : "", rest: s.trim() };
  }
  /// THE COUNT, read AFTER the weapon: "夜语者77" is a weapon and "77" in it is not
  /// a count. Whatever number ends what is left, spaced or not, held to 1–10.
  function countOf(left) {
    const num = left.match(/(\d+)$/);
    if (!num) return { n: null, left };
    return { n: Math.max(1, Math.min(MAX_SHOWN, Number(num[1]))), left: left.slice(0, num.index) };
  }
  /// The weapon the words start with, and what is left after it.
  function weaponOf(rest) {
    const q = nameFold(rest);
    const hit = weaponNames.find((x) => x.n && q.startsWith(x.n));
    if (!hit) return null;
    // WHAT FOLLOWS THE NAME keeps its signs ("-变焦" is a malus): walk the words
    // until as much of them as the name has been consumed.
    let i = 0;
    while (i < rest.length && nameFold(rest.slice(0, i)).length < hit.n.length) i += 1;
    return { w: hit.w, left: squash(rest.slice(i)) };
  }

  /// THE RULER NAMED in what is left, by its name in either language, and the
  /// words around it; `ruler` is null when none is named.
  const benches = meta.benchmarks || [];
  function rulerIn(left) {
    const names = benches.flatMap((b) => [squash(rulerShort(b)), squash(b.name.split(" · ")[0])].map((n) => ({ b, n })))
      .filter((x) => x.n).sort((a, z) => z.n.length - a.n.length);
    const hit = names.find((x) => left.includes(x.n));
    return hit ? { ruler: hit.b, left: left.replace(hit.n, "") } : { ruler: null, left };
  }
  const defaultRuler = () => benches.find((b) => b.primary) || benches[0];
  const rulerList = () => benches.map(rulerShort).join("、");

  const help = () => [
    t("I am Nona, WFSim's assistant. Send zk or pz… not that I was waiting for you. (⁄ ⁄•⁄ω⁄•⁄ ⁄)"),
    t("zk weapon [ruler] [stats] [count]: the rivens the board has measured for this weapon, against its best build without one."),
    t("pz weapon [ruler] [riven] [count]: the best builds the board has measured for this weapon; add riven for builds that carry one."),
    t("For example: {a}, or {b}", { a: "zk 托里德 双暴 负任意 5", b: "pz 托里德 爆破使 紫卡 3" }),
  ].join("\n");
  const NO_WEAPON = "Which weapon? Put its name after the command, like {e}. (・_・;)";
  const NOT_FOUND = "No weapon by that name. Check it again — Chinese or English both work. (＞﹏＜)";
  const NOT_MEASURED = "Nobody has measured this one yet. Measure a build on wfsim.app… then I will remember it. (´；ω；`)";

  async function pz(rest) {
    if (!rest) return t(NO_WEAPON, { e: "pz 托里德 3" });
    const hit = weaponOf(rest);
    if (!hit) return t(NOT_FOUND);
    const { n, left: afterCount } = countOf(hit.left);
    // "紫卡" anywhere after the weapon asks for riven builds; what is left names the ruler.
    const rivenWords = ((zh.riven_query_words || {}).with_riven || []).map(squash).sort((a, b) => b.length - a.length);
    const said = rivenWords.find((x) => x && afterCount.includes(x));
    const named = rulerIn(said ? afterCount.replace(said, "") : afterCount);
    // A WORD THAT IS NOT A RULER IS SAID, never quietly read as the default one.
    if (named.left) return t("I could not read “{word}”… The rulers are {list}; add riven for builds with one. (・_・;)", { word: named.left, list: rulerList() });
    const ruler = named.ruler || defaultRuler();
    const r = await run("builder.board.read", { weapon: hit.w.id, riven: said ? "with" : "without", limit: n || 3, distinct: true, pooled: true });
    if (r.ok === false) return t(NOT_MEASURED);
    const rows = r.rows.filter((x) => x.ruler_id === ruler.id);
    if (!rows.length) return t(NOT_MEASURED);
    const shown = rows.length;
    const card = `${SITE}${headless.headlessWeaponPath(meta.weapons || [], hit.w.id)}/card?kind=pz&ruler=${encodeURIComponent(ruler.id)}&n=${shown}${said ? "&rv=1" : ""}`;
    const text = [`${weaponName(hit.w)} · ${rulerShort(ruler)}`]
      .concat(rows.map((x) => `#${x.rank} ${x.score}  ${(x.build ? x.build.mods.map(modName) : x.mods).join("、")}${
        x.build && x.build.arcane.length ? ` | ${t("Arcane")}: ${x.build.arcane.map(arcaneName).join("、")}` : ""}${
        x.build && x.build.evolutions.length ? ` | ${t("Evolutions")}: ${x.build.evolutions.map(evoName).join("、")}` : ""}`))
      .join("\n");
    return { line: t(said ? "The top {n} riven builds of {w} under {ruler}. (￣ー￣)ゞ" : "The top {n} builds of {w} under {ruler}. (￣ー￣)ゞ",
      { w: weaponName(hit.w), ruler: rulerShort(ruler), n: shown }), card, text };
  }

  async function zk(rest) {
    if (!rest) return t(NO_WEAPON, { e: "zk 托里德 双暴" });
    const hit = weaponOf(rest);
    if (!hit) return t(NOT_FOUND);
    const { n, left: afterCount } = countOf(hit.left);
    const cls = hit.w.riven_class;
    const named = rulerIn(afterCount);
    const ask = headless.rivenQuery((meta.riven_stats || {})[cls] || [], [zh], named.left);
    if (ask.unread.length) return t("I could not read “{word}”… Write a stat as the card does, or as short as 双暴, 暴伤 or 负任意. (・_・;)", { word: ask.unread[0] });
    const r = await run("builder.rivens.read", { weapon: hit.w.id, bonuses: ask.bonuses, malus: ask.malus, pooled: true,
      ...(named.ruler ? { ruler: named.ruler.id } : {}) });
    if (r.ok === false || !r.groups.length) return t(NOT_MEASURED);
    const g = r.groups.find((x) => x.rivens.length);
    if (!g) return t("No riven on the board has these stats yet. (￣^￣)");
    const top = headless.distinctTop(g.rivens, n || 3, () => "", (x) => x.score);
    const shown = top.length;
    const card = `${SITE}${headless.headlessWeaponPath(meta.weapons || [], hit.w.id)}/card?kind=zk&ruler=${encodeURIComponent(g.ruler_id)}&n=${shown}`
      + (ask.bonuses.length ? `&has=${ask.bonuses.map(encodeURIComponent).join(",")}` : "")
      + (ask.malus ? `&malus=${encodeURIComponent(ask.malus)}` : "");
    const line = (x) => `#${x.rank} ${x.stat_ids.bonuses.map((id) => "+" + statZh(cls, id)).join(" ")}${
      x.stat_ids.malus ? " −" + statZh(cls, x.stat_ids.malus) : ""}  ${x.score}${x.gain == null ? "" : `（${x.gain >= 0 ? "+" : "−"}${Math.abs(x.gain * 100).toFixed(1)}%）`}`;
    const text = [`${weaponName(hit.w)} · ${t(g.ruler).split(" · ")[0]}`,
      `${t("The board's best riven-free build")}: ${g.riven_free ? g.riven_free.score : "—"}`]
      .concat(top.map(line)).join("\n");
    return { line: t("These are {w}'s rivens under {ruler}, against the best build without one. I ran every one. (*/ω＼*)",
      { w: weaponName(hit.w), ruler: t(g.ruler).split(" · ")[0] }), card, text };
  }

  /// `{ text }`, or `{ line, card, text }` — the long image at `card` with
  /// `line` under it, and `text` the answer in words if the image cannot be made.
  return async function answer(text) {
    const p = parse(text);
    const r = p.cmd === "zk" ? await zk(p.rest) : p.cmd === "pz" ? await pz(p.rest) : help();
    return typeof r === "string" ? { text: r } : r;
  };
}
