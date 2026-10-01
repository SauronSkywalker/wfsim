/// A SIGNED SHORT LINK NAMES WHO SHARED IT, AND ONLY ON THE BUILD IT SIGNED
/// (docs/UI.md §"A signed share"). The short-link store and the paid half are
/// answered by CDP request interception, so the page boots on a real signed
/// address exactly as a reader's would: the address is cleaned, the build
/// lands, and the line over the build bar says who shared it, as the paid half
/// answers — a member's tier and month, a lapsed one's name alone, and nothing
/// for a signature lifted onto another build or for a link with none.
import { openApp } from "./cdp.mjs";

const app = await openApp({ boot: 12000, lang: "en", base: process.env.WFSIM_BASE });
const { evaluate, check, send, on, sleep } = app;

await app.load("/weapons/Torid", 12000);
const code = await evaluate(`(async () => { slots[0].mod = "serration"; slots[0].rank = 10; return await shareCode(); })()`);

const SIGS = {
  Sig12345: { ok: true, share: "AAAAAAAAAA", weapon: "Torid", at: "2026-10-01", name: "Ada", username: "ada", tier: "member", since: "2026-09" },
  Patron01: { ok: true, share: "AAAAAAAAAA", weapon: "Torid", at: "2026-10-01", name: "Bea", username: "bea", tier: "patron", since: "2025-12" },
  Lapsed12: { ok: true, share: "AAAAAAAAAA", weapon: "Torid", at: "2026-10-01", name: "Cyd", username: "cyd", tier: null, since: null },
  Lifted99: { ok: true, share: "BBBBBBBBBB", weapon: "Torid", at: "2026-10-01", name: "Mallory", username: "mal", tier: "member", since: "2026-01" },
};
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/s/*" }, { urlPattern: "*/api/cloud/share/*" }] });
on("Fetch.requestPaused", async (p) => {
  const url = new URL(p.request.url);
  let body = { ok: false, reason: "not_found" }, status = 404;
  const s = /^\/api\/s\/([0-9A-Za-z]{10})$/.exec(url.pathname);
  const g = /^\/api\/cloud\/share\/([0-9A-Za-z]{8})$/.exec(url.pathname);
  if (s && s[1] === "AAAAAAAAAA") { body = { ok: true, c: code }; status = 200; }
  if (g && SIGS[g[1]]) { body = SIGS[g[1]]; status = 200; }
  await send("Fetch.fulfillRequest", {
    requestId: p.requestId, responseCode: status,
    // THE STORE IS THE LIVE ORIGIN, so a page served from here asks it across
    // origins, as the real one answers: open to any.
    responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: "*" }],
    body: Buffer.from(JSON.stringify(body)).toString("base64"),
  });
});

const land = async (path) => {
  await send("Page.navigate", { url: app.BASE + path });
  await sleep(9000);
  return evaluate(`(() => { const el = document.getElementById("share-by");
    return { path: location.pathname, shown: !!el && !el.hidden, text: el ? el.textContent.replace(/\\s+/g, " ").trim() : "",
      cls: el ? el.className : "", preset: (buildNamed(activePreset) || {}).name || "", mod: (slots[0] || {}).mod || null }; })()`);
};

const m = await land("/weapons/Torid/s/AAAAAAAAAA/Sig12345");
check("a signed link opens on the weapon's own address, the build landed", m.path === "/weapons/Torid" && m.mod === "serration", JSON.stringify(m));
check("...and over the build bar it says who shared it, their tier and the month it began, checked",
  m.shown && /Shared by Ada/.test(m.text) && /WFSim Member since 2026-09/.test(m.text) && /checked with wfsim\.app/.test(m.text), JSON.stringify(m));

const t = await evaluate(`(() => { const other = loadPresetList(BUILDS).find((p) => presetId(p) !== activePreset);
  if (other) pickPreset(buildBarCfg(), presetId(other)); else newPreset(buildBarCfg());
  return !document.getElementById("share-by").hidden; })()`);
check("another build opened, the line goes: it is about the build it came with", t === false);

const p = await land("/weapons/Torid/s/AAAAAAAAAA/Patron01");
check("a Patron's link says so, in the Patron's colour", p.shown && /WFSim Patron since 2025-12/.test(p.text) && /patron/.test(p.cls), JSON.stringify(p));

const l = await land("/weapons/Torid/s/AAAAAAAAAA/Lapsed12");
check("a lapsed membership's link keeps the name and shows no mark", l.shown && /Shared by Cyd/.test(l.text) && !/WFSim (Member|Patron)/.test(l.text), JSON.stringify(l));

const x = await land("/weapons/Torid/s/AAAAAAAAAA/Lifted99");
check("a signature lifted onto another build names nobody, and the build still lands", !x.shown && x.mod === "serration", JSON.stringify(x));

const u = await land("/weapons/Torid/s/AAAAAAAAAA");
check("a link with no signature lands the build with no line", !u.shown && u.mod === "serration" && u.path === "/weapons/Torid", JSON.stringify(u));

const z = await land("/weapons/Torid/s/AAAAAAAAAA/zzzzzzzz");
check("a signature nobody minted names nobody", !z.shown && z.mod === "serration", JSON.stringify(z));

// SIGNING, as the page asks it: the answer's path, on the live origin.
const signed = await evaluate(`(async () => {
  const real = window.fetch;
  window.fetch = async (url, o) => String(url) === "/api/cloud/share/sign"
    ? new Response(JSON.stringify({ ok: true, sig: "Sig12345", path: "/weapons/Torid/s/AAAAAAAAAA/Sig12345" }), { headers: { "content-type": "application/json" } })
    : real(url, o);
  const ok = await signShare("AAAAAAAAAA", "Torid");
  window.fetch = async () => new Response(JSON.stringify({ ok: false, reason: "not_included" }), { status: 403 });
  const refused = await signShare("AAAAAAAAAA", "Torid");
  window.fetch = real;
  return { ok, refused, origin: SHARE_ORIGIN };
})()`);
check("a signed link is the live origin and the path the paid half answered",
  signed.ok === `${signed.origin}/weapons/Torid/s/AAAAAAAAAA/Sig12345`, JSON.stringify(signed));
check("...and a refusal falls back to the plain link", signed.refused === null, JSON.stringify(signed));
check("off the live site nobody is offered a signature: the session that signs lives there",
  (await evaluate("shareCanSign()")) === false);

await app.finish("a shared build names who shared it, as wfsim.app answers, and only on that build");
