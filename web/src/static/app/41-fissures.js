// ---- UTILITY › VOID FISSURES ------------------------------------------------
//
// Every Void Fissure open in the game now — docs/UI.md §"Utility". The bell on
// a row makes a reminder for fissures like it (27-utility.js).

/// THE THREE LISTS THE GAME KEEPS APART: the star chart, its Steel Path, and
/// Railjack's Void Storms. One is shown at a time, as the game shows them.
const FISSURE_LISTS = [["normal", "Normal"], ["steel_path", "Steel Path"], ["railjack", "Railjack"]];
/// The world state's own order, Lith first (`scripts/world_names.py`).
const FISSURE_TIERS = ["VoidT1", "VoidT2", "VoidT3", "VoidT4", "VoidT5", "VoidT6"];
/// A NEW REMINDER HOLDS these of the row it was made from; the reader adds the
/// node or drops any of them before saving.
const FISSURE_REMINDER_DEFAULT = ["list", "tier", "mission"];

let fissureList = "normal";
let fissureTier = "all";
/// The row whose reminder is being made, and the attributes picked for it.
let fissureEditing = null;
let fissurePick = new Set();

const fissureListName = (v) => tr((FISSURE_LISTS.find(([k]) => k === v) || [v, v])[1]);
UTILITY_KINDS.fissure = {
  tab: "fissures",
  render: renderFissures,
  attributes: [["list"], ["tier"], ["mission"], ["node"]],
  nameOf: (k, names, v) => k === "list" ? fissureListName(v) : worldName((names || {})[k], v),
  build: fissureBuild,
  describe: (f) => [
    f.attributes && f.attributes.list !== "normal" ? fissureListName(f.attributes.list) : "",
    worldName(f.names.tier), worldName(f.names.mission),
  ].filter(Boolean).join(" ") + ` · ${worldName(f.names.node)}${f.names.system ? ` (${worldName(f.names.system)})` : ""}`,
};

const BELL_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;

function renderFissures() {
  const filters = $("fissure-filters"), list = $("fissure-list");
  if (!filters || !list) return;
  const wait = worldWaitHtml();
  if (wait) { filters.innerHTML = ""; list.innerHTML = wait; return; }
  const now = Date.now();
  const open = worldOf("fissure");
  const ofList = open.filter((f) => f.attributes.list === fissureList);
  const tiers = FISSURE_TIERS.filter((t) => ofList.some((f) => f.attributes.tier === t));
  if (fissureTier !== "all" && !tiers.includes(fissureTier)) fissureTier = "all";
  const tierName = (t) => worldName((ofList.find((f) => f.attributes.tier === t) || { names: {} }).names.tier, t);
  filters.innerHTML = `<div class="slotf-row">${FISSURE_LISTS.map(([k, label]) =>
      filterChip(tr(label), fissureList === k, `data-flist="${k}"`, open.filter((f) => f.attributes.list === k).length)).join("")}</div>
    <div class="slotf-row">${filterChip(tr("All"), fissureTier === "all", `data-ftier="all"`)}${
      tiers.map((t) => filterChip(tierName(t), fissureTier === t, `data-ftier="${t}"`,
        ofList.filter((f) => f.attributes.tier === t).length)).join("")}</div>`;
  filters.querySelectorAll("[data-flist]").forEach((el) => {
    el.onclick = () => { fissureList = el.dataset.flist; fissureEditing = null; renderFissures(); };
  });
  filters.querySelectorAll("[data-ftier]").forEach((el) => {
    el.onclick = () => { fissureTier = el.dataset.ftier; renderFissures(); };
  });
  const order = (t) => { const i = FISSURE_TIERS.indexOf(t); return i < 0 ? FISSURE_TIERS.length : i; };
  const rows = ofList.filter((f) => fissureTier === "all" || f.attributes.tier === fissureTier)
    .sort((a, b) => order(a.attributes.tier) - order(b.attributes.tier) || a.ends_at_ms - b.ends_at_ms);
  const rs = reminders();
  list.innerHTML = rows.length ? `<div class="bench-rows">${rows.map((f) => {
    const on = rs.some((r) => reminderMatches(r, f));
    return `
      <div class="brow frow">
        <span class="ftier">${escHtml(worldName(f.names.tier, f.attributes.tier))}</span>
        <span class="bname">${escHtml(worldName(f.names.mission, f.attributes.mission))}
          <span class="fnode">${escHtml(worldName(f.names.node, f.attributes.node))}${
            f.names.system ? ` · ${escHtml(worldName(f.names.system))}` : ""}</span></span>
        <span class="bscore" data-ends="${f.ends_at_ms}">${utilityLeft(f.ends_at_ms - now)}</span>
        <button type="button" class="fbell${on ? " on" : ""}${fissureEditing === f.id ? " open" : ""}" data-fbell="${escHtml(f.id)}"
          title="${escHtml(tr(on ? "A reminder matches this fissure" : "Remind me of fissures like this"))}" aria-label="${
          escHtml(tr("Remind me of fissures like this"))}">${BELL_SVG}</button>
      </div>${fissureEditing === f.id ? fissureEditorHtml(f) : ""}`;
  }).join("")}</div>`
    : `<div class="sim-empty">${escHtml(tr("No fissure matches these filters."))}</div>`;
  list.insertAdjacentHTML("beforeend", `<p class="bench-note"><a href="/utility/reminders">${
    escHtml(tr("Waiting for one that is not open? Make a reminder for it"))}</a></p>`);
  list.querySelectorAll("[data-fbell]").forEach((el) => {
    el.onclick = () => {
      const f = rows.find((x) => x.id === el.dataset.fbell);
      if (fissureEditing === f.id) { fissureEditing = null; renderFissures(); return; }
      fissureEditing = f.id;
      fissurePick = new Set(FISSURE_REMINDER_DEFAULT.filter((k) => f.attributes[k] != null));
      renderFissures();
    };
  });
  const ed = list.querySelector(".frem");
  if (!ed) return;
  const f = rows.find((x) => x.id === fissureEditing);
  ed.querySelectorAll("[data-fpick]").forEach((el) => {
    el.onclick = () => {
      const k = el.dataset.fpick;
      if (fissurePick.has(k)) fissurePick.delete(k); else fissurePick.add(k);
      renderFissures();
    };
  });
  ed.querySelector("[data-fsave]").onclick = () => {
    if (!fissurePick.size) return;
    reminderAdd("fissure", Object.fromEntries([...fissurePick].map((k) => [k, f.attributes[k]])), f.names);
    fissureEditing = null;
    renderUtility();
    presetToast(tr("Reminder saved"));
  };
  ed.querySelector("[data-fcancel]").onclick = () => { fissureEditing = null; renderFissures(); };
}

/// THE REMINDER BEING MADE, under its row: what it will hold, each a chip the
/// reader turns off or on. Every chip off is no reminder, so Save waits.
function fissureEditorHtml(f) {
  const kind = UTILITY_KINDS.fissure;
  const chips = kind.attributes.filter(([k]) => f.attributes[k] != null).map(([k]) =>
    filterChip(kind.nameOf(k, f.names, f.attributes[k]), fissurePick.has(k), `data-fpick="${k}"`)).join("");
  return `<div class="frem">
      <span class="slotf-lab">${escHtml(tr("Remind me when a fissure opens with"))}</span>
      <div class="slotf-row">${chips}</div>
      <div class="frem-act">
        <button type="button" class="ghost-btn small" data-fsave${fissurePick.size ? "" : " disabled"}>${escHtml(tr("Save reminder"))}</button>
        <button type="button" class="ghost-btn small" data-fcancel>${escHtml(tr("Cancel"))}</button>
      </div>
    </div>`;
}

/// A REMINDER MADE FROM NOTHING, for a fissure that is not open now: its list,
/// era and mission, each Any until picked, from every era and mission type DE
/// names (`/api/world/names`). A Void Storm has no mission to match on.
let fissureNew = { list: null, tier: null, mission: null };
function fissureBuild(box) {
  if (!worldNames) {
    box.innerHTML = worldNamesFailed
      ? `<div class="sim-empty">${escHtml(tr("The world state could not be reached."))} <button type="button" class="ghost-btn small" data-names-retry>${escHtml(tr("Retry"))}</button></div>`
      : `<div class="sim-empty">${escHtml(tr("Loading…"))}</div>`;
    const again = box.querySelector("[data-names-retry]");
    if (again) again.onclick = () => { worldNamesFailed = false; renderUtility(); };
    else worldNamesLoad().then(renderUtility);
    return;
  }
  if (fissureNew.list === "railjack") fissureNew.mission = null;
  const chip = (k, v, label) => filterChip(label, fissureNew[k] === v, `data-fnew="${k}" data-v="${v === null ? "" : v}"`);
  const missions = Object.entries(worldNames.missions)
    .map(([id, n]) => ({ value: id, label: worldName(n, id) }))
    .sort((a, b) => a.label.localeCompare(b.label, LANG));
  const any = Object.values(fissureNew).some((v) => v !== null);
  box.innerHTML = `<div class="frem frem-new">
      <div class="slotf-row"><span class="slotf-lab">${escHtml(tr("List"))}</span>${chip("list", null, tr("Any"))}${
        FISSURE_LISTS.map(([k, label]) => chip("list", k, tr(label))).join("")}</div>
      <div class="slotf-row"><span class="slotf-lab">${escHtml(tr("Relic era"))}</span>${chip("tier", null, tr("Any"))}${
        FISSURE_TIERS.map((t) => chip("tier", t, worldName(worldNames.tiers[t], t))).join("")}</div>
      ${fissureNew.list === "railjack" ? "" : `<div class="slotf-row"><span class="slotf-lab">${escHtml(tr("Mission"))}</span>${
        ddButton("fissure-new-mission", { value: fissureNew.mission ?? "", search: true,
          items: [{ value: "", label: tr("Any") }, ...missions],
          onPick: (v) => { fissureNew.mission = v || null; renderUtility(); } })}</div>`}
      <div class="frem-act">
        <button type="button" class="ghost-btn small" data-fnew-save${any ? "" : " disabled"}>${escHtml(tr("Save reminder"))}</button>
      </div>
    </div>`;
  box.querySelectorAll("[data-fnew]").forEach((el) => {
    el.onclick = () => { fissureNew[el.dataset.fnew] = el.dataset.v || null; renderUtility(); };
  });
  box.querySelector("[data-fnew-save]").onclick = () => {
    const attributes = Object.fromEntries(Object.entries(fissureNew).filter(([, v]) => v !== null));
    if (!Object.keys(attributes).length) return;
    reminderAdd("fissure", attributes, { tier: worldNames.tiers[attributes.tier] || null,
      mission: worldNames.missions[attributes.mission] || null });
    fissureNew = { list: null, tier: null, mission: null };
    renderUtility();
    presetToast(tr("Reminder saved"));
  };
}
