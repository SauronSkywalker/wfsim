// ---- Riven Analyst: what each riven the board has measured is worth -----
//
// docs/BOARD.md §"The Riven Analyst". GLOBAL: every riven row this weapon's
// board publishes against the #1 riven-free row of its ruler and mode. Every
// number is a published score, grouped by `rivenGroups`, the function the
// headless query `builder.rivens.read` answers with.

/// The ruler the reader picked, by id. Null = the first one with a riven row.
let raRuler = null;
/// The riven row the reader has open, by its board key.
let raPick = null;

const raStat = (id) => {
  const s = rivenStat(id);
  return s ? rivenStatName(s) : id;
};
const raCards = (row) => (row.mods || []).filter((m) => m && m !== BOARD_RIVEN_SLOT)
  .map((m) => `<span class="wb-card">${escHtml((modById(m) || {}).name || m)}</span>`).join("");
const raShown = (r) => String(r.shown != null ? r.shown : (r.score || 0).toFixed(4));

function renderRivenAnalyst() {
  const box = $("riven-analyst");
  const w = weaponInfo($("weapon").value);
  if (!box || !w || !META) return;
  const groups = rivenGroups(META, w, BOARD[w.id] || []);
  if (!groups.length) {
    box.innerHTML = `<p class="wb-empty">${escHtml(tr("No riven build of this weapon has been measured yet."))}</p>`;
    return;
  }
  const rulers = [...new Set(groups.map((g) => g.ruler_id))];
  const ruler = rulers.includes(raRuler) ? raRuler : rulers[0];
  const bench = (META.benchmarks || []).find((b) => b.id === ruler) || { name: ruler };
  const segs = rulers.map((id) => {
    const b = (META.benchmarks || []).find((x) => x.id === id) || { name: id };
    return `<span class="seg${id === ruler ? " on" : ""}" data-ruler="${escHtml(id)}">${escHtml(tr(b.name).split(" · ")[0])}</span>`;
  }).join("");
  const mine = groups.filter((g) => g.ruler_id === ruler);
  const all = mine.flatMap((g) => g.rivens);
  const pick = all.find((x) => x.key === raPick) || all[0];
  const tables = mine.map((g) => {
    const head = `<p class="wb-ceiling">${escHtml(modeLabel(w, g.mode))} · ${escHtml(tr("The board's best riven-free build"))}: <b>${
      g.top ? escHtml(raShown(g.top.row)) : "—"}</b></p>`;
    const rows = g.rivens.map((x) => {
      const rv = x.row.riven;
      const stats = rv.bonuses.map((id) => "+" + raStat(id)).concat(rv.malus ? ["−" + raStat(rv.malus)] : []).join(" · ");
      return `<tr class="wb-row${x === pick ? " sel" : ""}" data-ra="${escHtml(x.key)}">`
        + `<td>${escHtml(stats)}</td><td class="wb-score">${escHtml(raShown(x.row))}</td>`
        + `<td class="wb-score">${x.gain == null ? "—" : escHtml(gainPct(x.gain))}</td></tr>`;
    }).join("");
    return head + `<table class="wb-tab"><thead><tr><th>${escHtml(tr("Riven"))}</th><th>${escHtml(tr("Score"))}</th>`
      + `<th>${escHtml(tr("vs the best riven-free build"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  box.innerHTML = `<div class="ra-top"><span class="rv-lbl">${escHtml(tr("Ruler"))}</span><span class="oseg">${segs}</span></div>`
    + `<p class="wb-terms">${escHtml(tr(bench.name))}</p>` + tables
    + (pick ? `<div class="wb-detail"><div class="wb-cards">${raCards(pick.row)}</div></div>` : "");
  box.querySelectorAll("[data-ruler]").forEach((el) => el.addEventListener("click", () => {
    raRuler = el.dataset.ruler;
    renderRivenAnalyst();
  }));
  box.querySelectorAll("[data-ra]").forEach((el) => el.addEventListener("click", () => {
    raPick = el.dataset.ra;
    renderRivenAnalyst();
  }));
}
