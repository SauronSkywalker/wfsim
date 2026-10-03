// ---- support: the donation channels -------------------------------------
// A channel is drawn only when it HAS a working link. An option that does not
// work yet is worse than one that is not offered, so an entry with an empty
// `url` renders nothing — and filling that url in is the whole of adding one.
//
// SUPPORT LIVES WHERE THE VIDEOS ARE: Bilibili for the Chinese side, YouTube
// for the rest. The site itself sells only the service, so a donation never
// meets an account. The ones that match the display language come first.
//
// ORDERED, NEVER FILTERED, which is the rule the topbar's community links
// follow and for the same reason: a reader who can use the other one still has
// to be able to find it. `locale: null` means "works anywhere" and sorts
// between the two, and the per-locale ORDER is all that lives here.
const chRank = (c) => (c.locale === LANG ? 0 : c.locale ? 2 : 1);
const SUPPORT_CHANNELS = [
  {
    id: "bilibili",
    name: "Bilibili",
    // THE ONE CHANNEL A MAINLAND READER CAN ACTUALLY PAY THROUGH, which is the
    // whole reason `locale` exists.
    //
    // THE AUTHOR'S SPACE PAGE, not a payment url. Bilibili's charge button
    // lives there and the flow never leaves an app the reader is already signed
    // into; a deep link into that flow is a url only Bilibili may build.
    url: "https://space.bilibili.com/1965302",
    locale: "zh",
    what: "One-off or monthly, in CNY, from inside Bilibili — no card, and no new account.",
  },
  {
    id: "youtube",
    name: "YouTube",
    // EMPTY UNTIL FAN FUNDING OPENS on the channel (memberships and Super
    // Thanks need YouTube's Partner Program), which is the rule above: filling
    // this url in is the whole of adding the channel.
    url: "",
    locale: "en",
    what: "A channel membership or Super Thanks, from inside YouTube.",
  },
];

/// HOW MUCH OF THIS THE READER HAS ACTUALLY USED — on their own machine, and
/// nowhere else.
///
/// The strongest thing this page can say is not what the project is, it is what
/// it has already done FOR the person reading, and that is a number the app can
/// count rather than claim. It is two integers in one key: engagements are what
/// the machine actually paid for (a run at the rulers' 1000 is a thousand of
/// them), and simulations are what the reader remembers doing.
///
/// IT NEVER LEAVES THE BROWSER, and the page says so where it prints it —
/// which is the same promise the board makes about a submission, made in the
/// one place a reader might reasonably suspect otherwise.
///
/// TWO INTEGERS, which is the whole of its storage budget: a measurement costs
/// its summary and never its replay, and a counter that grew per run would be
/// the same mistake one size down.
const SUPPORT_USE = "wfsim-use";
function supportUse() {
  try {
    const v = JSON.parse(localStorage.getItem(SUPPORT_USE) || "{}");
    return { sims: v.sims | 0, engagements: v.engagements | 0 };
  } catch (_) { return { sims: 0, engagements: 0 }; }
}
function noteSimRun(engagements) {
  const v = supportUse();
  v.sims += 1;
  v.engagements += Math.max(1, engagements | 0);
  try { localStorage.setItem(SUPPORT_USE, JSON.stringify(v)); } catch (_) { /* private mode */ }
}

/// WHO HAS CHIPPED IN, BY NAME — the only thing that ever leaves the ledger.
///
/// A FILE, NOT AN ENDPOINT. `scripts/publish_thanks.py` reads the ledger, works
/// out the order and writes `site/thanks.json`, which is committed the way
/// `site/board/` is. Nothing at the edge is bound to the ledger, so no request
/// to this site can ask what anybody gave.
///
/// ORDERED, NEVER NUMBERED, and no rank, no band, no size. The order combines
/// what somebody gave with how long ago they first gave it; printing a position
/// beside a name would turn a thank-you into a leaderboard, which is the one
/// thing the page above it promises it is not.
///
/// SILENT WHEN IT IS EMPTY, the rule every count on `/support` follows: a
/// heading over nothing is worse than no heading.
let thanksDoc = null;
const thanksWaiting = [];
function thanksAsk(then) {
  if (thanksDoc !== null && thanksDoc !== "asking") { then(); return; }
  thanksWaiting.push(then);
  if (thanksDoc === "asking") return;
  thanksDoc = "asking";
  const land = (v) => { thanksDoc = v; thanksWaiting.splice(0).forEach((f) => f()); };
  fetch("/thanks.json")
    .then((r) => (r.ok ? r.json() : null))
    // AN UNPUBLISHED LIST ARRIVES AS THE APP'S OWN HTML, with a 200: the SPA
    // fallback answers every unmatched path with index.html. `.json()` is what
    // tells a missing file from an empty one, so the catch IS the not-found.
    .then((j) => land(j && Array.isArray(j.supporters) ? j : "failed"))
    .catch(() => land("failed"));
}
function thanksNames() {
  return (thanksDoc && typeof thanksDoc === "object" && thanksDoc.supporters) || [];
}

/// HOW MANY NAMES `/support` SHOWS BEFORE IT DEFERS TO `/thanks`. The block
/// sits under the channels rather than over them: it is there to say that
/// people do this, not to be read instead of the thing above it.
const THANKS_PEEK = 24;
/// WHERE THEY GAVE, as a heading over the names that gave there — the channels
/// the page offers first, then any the ledger still remembers. A reader sees
/// that these people backed WFSim on the video platforms, which is what keeps
/// a donation apart from a membership; someone who gave in two places is
/// thanked in both.
const THANKS_FROM = { bilibili: "On Bilibili", youtube: "On YouTube", kofi: "On Ko-fi", patreon: "On Patreon", afdian: "On Afdian" };
function thanksGroups(shown) {
  const order = [...SUPPORT_CHANNELS.map((c) => c.id), ...Object.keys(THANKS_FROM)];
  const groups = new Map();
  for (const s of shown) {
    for (const via of (Array.isArray(s.via) && s.via.length ? s.via : [""])) {
      if (!groups.has(via)) groups.set(via, []);
      groups.get(via).push(s);
    }
  }
  const rank = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}
function drawThanks(block, list, limit) {
  const all = thanksNames();
  block.hidden = all.length === 0;
  if (!all.length) return;
  const shown = limit ? all.slice(0, limit) : all;
  // THE NAME AND NOTHING ELSE. `since` stays in the published file — it is
  // what the ordering is derived from and worth keeping as a record — but a
  // month printed beside a name IS a number beside a name, which is the one
  // thing /thanks tells the reader it does not do. Where they gave is the
  // group's heading, never a word beside a name.
  list.innerHTML = thanksGroups(shown).map(([via, people]) => `<li class="thx-from">`
    + (via ? `<div class="thx-src">${escHtml(tr(THANKS_FROM[via] || via))}</div>` : "")
    + `<ul class="thx-group">${people.map((s) => `<li class="thx-one">`
      + `<span class="thx-name">${escHtml(s.name)}</span></li>`).join("")}</ul></li>`).join("");
  const more = block.querySelector(".thx-more");
  if (more) more.hidden = all.length <= shown.length;
}
function renderThanksPage() {
  const block = $("thanks-block");
  const list = $("thanks-list");
  if (!block || !list) return;
  const draw = () => {
    drawThanks(block, list, 0);
    const none = $("thanks-none");
    if (none) none.hidden = thanksNames().length > 0;
  };
  thanksAsk(draw);
  draw();
}

/// THE FACTS STRIP — what this repository holds, counted rather than claimed.
///
/// Two sources and the split is deliberate: anything the page can count for
/// itself is counted here and is right on the dev server too, and only what
/// lives outside the shipped data — tests, checks, measurements, commits —
/// comes from `PROJECT_FACTS`, which the site build writes. A figure that is
/// missing is DROPPED rather than drawn as a zero.
/// EVERYTHING THE ROSTER HOLDS, summed rather than listed — so a category
/// added to `META` counts itself and this function is not edited again. That
/// is the whole reason it is a sum: the roster grows sideways (frames today,
/// companions and Necramechs next) and a hand-written list of categories is a
/// figure that silently stops being true.
function rosterSize() {
  const mods = new Set();
  for (const pool of Object.values(META.mod_pools || {})) {
    for (const m of pool || []) mods.add(m.id);
  }
  // A weapon's evolutions arrive as TIERS, and what is modelled is the perks
  // inside them.
  let evolutions = 0;
  for (const w of META.weapons || []) {
    for (const tier of w.evolutions || []) evolutions += (tier.options || []).length;
  }
  const n = (k) => (META[k] || []).length;
  return n("weapons") + n("frames") + mods.size + evolutions
    + n("arcanes") + n("abilities") + n("auras") + n("shards") + n("enemies");
}

/// WHAT THE BOARD HAS BEEN ASKED, and what it answered.
///
/// SUBMISSIONS ARE ONE POOL AND SCORES ARE PER RULER, which is why these two
/// fields are summed differently: every ruler reports the SAME submission
/// count because they all read the same pool, so adding them would state the
/// uploads three times. `listed` is that ruler's own answers and does add up.
function boardCount(field) {
  const all = Object.values((BOARD_META && BOARD_META.boards) || {});
  if (!all.length) return 0;
  // BOTH BRANCHES READ `field`, which is also what keeps the one spelling of
  // `.submissions` in this file on the binding `check_release_identity` guards:
  // that field must be read from the FETCHED stamp, never the copy compiled
  // into the wasm, or the board dates itself by the build.
  return field === "submissions"
    ? Math.max(...all.map((b) => b[field] | 0))
    : all.reduce((t, b) => t + (b[field] | 0), 0);
}

function projectFacts() {
  // IDENTIFIED, because the home hero states these too. Picking by label would
  // break the moment a label is reworded, and a hero silently short of a
  // number is the failure.
  //
  // THREE ORDERS OF MAGNITUDE, ON PURPOSE: thousands, thousands, tens of
  // thousands read as three different facts, where two figures of the same
  // size read as one fact printed twice. They are also the three modules in
  // the order a reader meets them — what is modelled, what was built with it,
  // what came back out.
  const rows = [
    ["roster", rosterSize(), "items modelled"],
    ["builds", boardCount("submissions"), "builds players have uploaded"],
    ["evaluations", boardCount("listed"), "evaluations computed"],
  ];
  return rows.filter(([, n]) => n > 0).map(([id, n, what]) => ({ id, n, what }));
}

/// THE HERO'S NUMBERS — the same three the support page states, and all of
/// them. A figure whose source has not landed is DROPPED, so a dev server with
/// no board draws the roster alone rather than a zero or a placeholder.
const HERO_FACTS = ["roster", "builds", "evaluations"];

function renderHomeFacts() {
  const el = $("home-facts");
  if (!el) return;
  const rows = projectFacts().filter((f) => HERO_FACTS.includes(f.id));
  el.hidden = !rows.length;
  el.innerHTML = rows.map((f) => `<span class="hf"><b>${
    escHtml(f.n.toLocaleString())}</b> ${escHtml(tr(f.what))}</span>`).join("");
}

/// WHAT THIS CLIENT IS RUNNING, in the three identifiers of
/// docs/DISTRIBUTION.md §Identity: the release, the board, the shell.
///
/// EVERY LINE IS OMITTED WHEN IT WOULD BE A GUESS. The dev server has no
/// release and no board stamp, a browser has no shell version, and a line
/// saying `dev` beside two real digests is worse than three lines that are all
/// true — a reader quoting it would be quoting nothing.
///
/// THE THREE ARE THREE FACTS, not one restated. The release is what every
/// client of this version runs, the board moves on its own hourly schedule, and
/// the shell is the binary — the only one of them an update cannot move.
function identityLines() {
  const el = $("support-identity");
  if (!el) return;
  const lines = [];
  if (RELEASE_ID !== "dev") {
    lines.push(trF("release {r} · commit {c}", { r: RELEASE_ID, c: BUILD_SHA }));
  }
  if (BOARD_META && BOARD_META.digest) {
    lines.push(trF("board {d} · scored {t} · {n} rows", {
      d: BOARD_META.digest.slice(0, 12),
      t: BOARD_META.scored_at
        ? new Date(BOARD_META.scored_at * 1000).toLocaleString()
        : "—",
      n: (BOARD_META.rows || 0).toLocaleString(),
    }));
  }
  const draw = () => {
    el.hidden = !lines.length;
    el.innerHTML = lines.map(escHtml).join("<br>");
  };
  draw();
  // THE BINARY, NEVER THE RELEASE IT UNPACKED. `app_version` answers the
  // second, which the release line above already carries; this line is the one
  // number that dates the executable, on the page a bug report is read off.
  //
  // A SHELL THAT CANNOT SAY IS A LINE THAT IS NOT DRAWN: one older than this
  // global leaves it undefined, and that absence is itself the answer.
  if (!window.__WFSIM_DESKTOP__ || !window.__WFSIM_SHELL__) return;
  lines.push(trF("shell {v}", { v: window.__WFSIM_SHELL__ }));
  draw();
}

/// THE MEMBERSHIP, while one is on sale to this reader — and Patron only once
/// the catalog sells it. Before that the page offers the video platforms alone.
function renderSupportMember() {
  const box = $("support-member");
  if (!box) return;
  const draw = () => {
    box.hidden = !billingState.configured;
    const patron = $("support-patron");
    if (patron) patron.hidden = !(((billingState.names || {}).offers || {}).patron);
  };
  draw();
  if (typeof loadBilling === "function") loadBilling().then(draw, () => {});
}

function renderSupport() {
  renderUsageNote();
  renderSupportMember();
  const facts = $("support-facts");
  if (facts) {
    facts.innerHTML = projectFacts().map((f) => `
      <div class="sup-fact"><b>${escHtml(f.n.toLocaleString())}</b><span>${escHtml(tr(f.what))}</span></div>`).join("");
  }
  // WHEN IT STARTED AND HOW MUCH HAS HAPPENED SINCE. One line rather than two
  // more tiles: it is context for the strip above, not a sixth figure.
  const built = $("support-built");
  if (built) {
    const f = PROJECT_FACTS || {};
    const say = f.commits && f.first_commit_day;
    built.hidden = !say;
    if (say) {
      built.textContent = tr("Built in the open since {day} — {n} commits, every one of them public.")
        .replace("{day}", f.first_commit_day).replace("{n}", f.commits.toLocaleString());
    }
  }
  identityLines();
  const used = $("support-usage");
  if (used) {
    const u = supportUse();
    used.hidden = !u.sims;
    if (u.sims) {
      used.textContent = tr("You have run {n} simulations on this machine — {e} engagements. That number is in this browser and has never been sent anywhere.")
        .replace("{n}", u.sims.toLocaleString()).replace("{e}", u.engagements.toLocaleString());
    }
  }
  const box = $("support-channels");
  if (box) {
    box.innerHTML = SUPPORT_CHANNELS.filter((c) => c.url)
      .sort((a, b) => chRank(a) - chRank(b)).map((c) => `
      <a class="sup-card" href="${escHtml(c.url)}" target="_blank" rel="noopener">
        <div class="sup-name">${escHtml(c.name)}</div>
        <div class="sup-what">${escHtml(tr(c.what))}</div>
        <span class="run-btn">${escHtml(tr("Open"))} ↗</span>
      </a>`).join("");
  }
  const thanksBlock = $("support-thanks");
  const thanksList = $("support-thanks-list");
  if (thanksBlock && thanksList) {
    const draw = () => drawThanks(thanksBlock, thanksList, THANKS_PEEK);
    thanksAsk(draw);
    draw();
  }
}

