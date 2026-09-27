// THE SHARE CARD, rasterised. `share_card.js` writes the SVG; resvg (vendor/,
// MPL-2.0) turns it into the PNG a chat unfurls, with Inter (vendor/, OFL) as
// the only font — a worker has no system fonts. Split from the SVG so the
// layout is testable in node, which cannot import a .wasm as a module.
import { initWasm, Resvg } from "./vendor/resvg/index.mjs";
import resvgWasm from "./vendor/resvg/index_bg.wasm";
import interRegular from "./vendor/fonts/Inter-Regular.ttf";
import interBold from "./vendor/fonts/Inter-Bold.ttf";

let ready = null;
const fonts = [new Uint8Array(interRegular), new Uint8Array(interBold)];

export async function sharePng(svg) {
  if (!ready) ready = initWasm(resvgWasm);
  await ready;
  return new Resvg(svg, {
    font: { fontBuffers: fonts, defaultFontFamily: "Inter", loadSystemFonts: false },
  }).render().asPng();
}
