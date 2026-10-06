// ---- The long image: a weapon's answer laid out to be sent as one picture ----
//
// docs/AGENT.md §"The QQ bot". `/weapons/<Name>/card?kind=pz|zk&ruler=&n=`,
// a zk narrowed by `&has=<stat ids>&malus=<id|any|none>`, draws the bots' reply image from the page's own components — the simulator's
// build card and the board's published numbers — so a chat image and the site
// are one design. Every mode of the ruler is one ranking (`pooledRanking`). Phone width, the light theme, nothing else on the page;
// `body[data-card-ready]` is set once every number in it has arrived, which is
// when a screenshot may be taken. The footer's code opens the page it is about.

const CARD_MAX = 10;

/// What the address asks for, clamped to what a card shows.
function cardParams() {
  const p = new URLSearchParams(location.search);
  const n = Math.max(1, Math.min(CARD_MAX, Math.round(Number(p.get("n"))) || 3));
  return { kind: p.get("kind") === "zk" ? "zk" : "pz", ruler: p.get("ruler") || "", n,
    riven: { bonuses: (p.get("has") || "").split(",").filter(Boolean), malus: p.get("malus") || null } };
}

const cardShown = (r) => String(r.shown != null ? r.shown : (r.score || 0).toFixed(4));
const cardBox = (head, body) => `<section class="lc-box"><div class="lc-head">${head}</div>${body}</section>`;

/// `ask` is `cardParams()` read BEFORE the weapon opened: opening one restores
/// its saved build, which rewrites the address and takes the query with it.
async function renderCardPage(w, ask) {
  const box = $("card-page");
  if (!box || !w) return;
  document.body.removeAttribute("data-card-ready");
  const { kind, ruler: want, n, riven: rivenAsk } = ask;
  const rows = BOARD[w.id] || [];
  const benches = META.benchmarks || [];
  const bench = benches.find((b) => b.id === want) || benches.find((b) => b.primary) || benches[0];
  const ruler = bench ? bench.id : "";
  const metric = metricLabel(metricOf(((bench || {}).scenario || {}).metric));
  const pct = (x) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
  // THE CARDS ARE DRAWN ONLY WHEN THEY GO STRAIGHT ONTO THE PAGE: a riven's
  // values arrive into the elements already there, so nothing may sit between.
  let title = "", link = "", body = () => "";
  if (kind === "pz") {
    const ranked = pooledRanking(rankBoard(rows.filter((r) => r.benchmark === ruler && !r.riven), [ruler], w.modes));
    const shown = distinctTop(ranked, n, () => "", (x) => cardShown(x.row));
    const mode = (shown[0] || {}).mode;
    title = trF("{w} · top {n} builds", { w: w.name, n: shown.length });
    link = `${LIVE_ORIGIN}${weaponPath(w.id)}?bench=${encodeURIComponent(ruler)}&mode=${encodeURIComponent(mode || "base")}&riven=0`;
    body = () => shown.map((x) => cardBox(`<b class="lc-rank">#${x.rank}</b><b class="lc-score">${escHtml(cardShown(x.row))}</b><span class="sb-empty">${escHtml(metric)}</span>`,
      cardOfState(boardRowState(w, x.row), w))).join("");
  } else {
    const g = pooledRivens(META, w, rows, ruler);
    title = trF("{w} · Riven Analyst", { w: w.name });
    link = `${LIVE_ORIGIN}${weaponPath(w.id)}/riven-analyst`;
    body = () => !g.rivens.length ? "" : (g.top ? cardBox(`<span class="sb-h">${escHtml(tr("The board's best riven-free build"))}</span><b class="lc-score">${escHtml(cardShown(g.top.row))}</b>`,
      cardOfState(boardRowState(w, g.top.row), w)) : "")
      + distinctTop(g.rivens.filter((x) => rivenMatches(x.row.riven, rivenAsk)).map((x, i) => ({ ...x, rank: i + 1 })), n, () => "",
        (x) => cardShown(x.row)).map((x) => cardBox(`<b class="lc-rank">#${x.rank}</b><b class="lc-score">${escHtml(cardShown(x.row))}</b>${
        x.gain == null ? "" : `<b class="lc-gain">${pct(x.gain)}</b>`}`, cardOfState(boardRowState(w, x.row), w))).join("");
  }
  const updated = measuredText(boardMeasuredAt(rows.filter((r) => r.benchmark === ruler)));
  const qr = await api("/api/qr", { text: link });
  const cards = body();
  // THE SITE'S OWN WORDMARK, as the topbar draws it: the brand is WFSim, and
  // Nona speaks in the line the bot sends with the image, not on it.
  box.innerHTML = `<header class="lc-top"><span class="brand">WF<span>Sim</span></span><span class="sb-empty">wfsim.app</span></header>
    <h1 class="lc-title">${escHtml(title)}</h1>
    <div class="sb-empty lc-sub">${escHtml([bench ? tr(bench.name) : "", updated ? trF("updated {t}", { t: updated }) : ""]
      .filter(Boolean).join(" · "))}</div>
    ${cards || `<p class="sim-empty">${escHtml(tr("Nothing measured for this weapon yet."))}</p>`}
    <footer class="lc-foot"><div class="lc-qr">${qr && qr.svg ? qr.svg.replace(/^<\?xml[^>]*>/, "") : ""}</div>
      <div><b class="lc-slogan">${escHtml(tr("The real Simulacrum Prime."))}</b><div class="sb-empty">wfsim.app</div></div></footer>`;
  // READY WHEN NOTHING IS STILL ARRIVING: every riven's values, every picture —
  // fetched NOW, since a lazy picture below the fold of a screenshot never is.
  while (rivenCardPending.size) await Promise.allSettled([...rivenCardPending]);
  box.querySelectorAll("img").forEach((im) => { im.loading = "eager"; });
  await Promise.all([...box.querySelectorAll("img")].map((im) => (im.complete ? null
    : new Promise((ok) => { im.onload = ok; im.onerror = ok; }))));
  document.body.dataset.cardReady = "1";
}
