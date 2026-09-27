// THE SHARE CARD — a short link's preview image, as SVG. Pure: the model in,
// the markup out; `share_png.js` rasterises it. Same language as the weapon
// cards `build_site_app.py` draws (`og_card`): the app's dark palette, a gold
// rule, the wordmark, and TEXT — no DE art, so the card says what it states.

const W = 1200, H = 630, X = 72;
const BG = "#0e1014", TEXT = "#f2f4f8", MUTED = "#a6adbb", GOLD = "#e8c37a";
const CHIP = "#1a1d24", CHIP_LINE = "#2a2f3a", RIVEN = "#a58bd6";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/// A line cut to what fits: glyphs are counted, not measured — Inter's average
/// advance is ~0.55 em, so `max` is that width in characters.
const fit = (s, max) => (String(s).length > max ? String(s).slice(0, max - 1) + "…" : String(s));
const text = (x, y, size, fill, s, weight = 400, anchor = "start") =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

/// The card for one shared build. `model`: { weapon, mods: [name], rivenSlots,
/// riven, arcanes: [name], evolutions: [name], claim: { headline, line } | null }.
export function shareCardSvg(model) {
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">`,
    `<rect width="${W}" height="${H}" fill="${BG}"/>`,
    `<rect width="${W}" height="6" fill="${GOLD}"/>`,
    `<text x="${X}" y="92" font-size="34" font-weight="700"><tspan fill="${TEXT}">WF</tspan><tspan fill="${GOLD}">Sim</tspan></text>`,
    text(W - X, 92, 24, MUTED, "shared build", 400, "end"),
    text(X, 176, 64, TEXT, fit(model.weapon, 30), 700),
  ];
  let y = 214;
  if (model.claim) {
    out.push(text(X, y + 52, 54, GOLD, model.claim.headline, 700));
    out.push(text(X, y + 86, 22, MUTED, fit(model.claim.line, 84)));
    y += 108;
  } else {
    y += 18;
  }
  // THE MODS AS CHIPS, four to a row, in slot order; a riven is a chip of its own colour.
  const chips = [...model.mods.map((m) => [m, TEXT]), ...Array(model.rivenSlots || 0).fill(["Riven", RIVEN])];
  const cw = (W - 2 * X - 3 * 16) / 4, ch = 40;
  chips.slice(0, 12).forEach(([name, fill], i) => {
    const cx = X + (i % 4) * (cw + 16), cy = y + Math.floor(i / 4) * (ch + 10);
    out.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="8" fill="${CHIP}" stroke="${CHIP_LINE}"/>`);
    out.push(text(cx + 14, cy + 27, 19, fill, fit(name, 23)));
  });
  y += Math.ceil(Math.min(chips.length, 12) / 4) * (ch + 10) + 28;
  // …THEN WHAT IS NOT A SLOT, as many lines as fit above the footer.
  const lines = [
    model.riven ? ["Riven", model.riven] : null,
    model.arcanes.length ? ["Arcane", model.arcanes.join(" · ")] : null,
    model.evolutions.length ? ["Evolutions", model.evolutions.join(" · ")] : null,
  ].filter(Boolean);
  for (const [label, value] of lines) {
    if (y > 566) break;
    out.push(`<text x="${X}" y="${y}" font-size="21"><tspan fill="${MUTED}">${esc(label)}  </tspan><tspan fill="${TEXT}">${esc(fit(value, 84))}</tspan></text>`);
    y += 31;
  }
  out.push(text(X, 596, 22, MUTED, "wfsim.app · builder · simulator · optimizer"));
  out.push("</svg>");
  return out.join("\n");
}
