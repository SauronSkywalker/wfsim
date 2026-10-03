// ---- EXTENSION DOCUMENTS ------------------------------------------------------
//
// docs/UI.md §Extensions. A static page outside the app may hold `data-ext`
// slots, which this fills before the page leaves: the extension behind the
// `CLOUD` door answers each slot with markup, and a slot it does not answer
// is removed. Filled here rather than by a script because these pages have to
// read with no script at all.

export const EXT_DOCUMENTS = new Set(["/privacy", "/terms", "/refunds"]);

export async function extDocument(request, env, path) {
  const doc = await env.ASSETS.fetch(request);
  if (!(doc.headers.get("content-type") || "").includes("text/html")) return doc;
  let fill = {};
  if (env.CLOUD) {
    try {
      const r = await env.CLOUD.fetch(new Request(`https://cloud.internal/internal/documents?path=${encodeURIComponent(path)}`));
      if (r.ok) fill = await r.json();
    } catch (_) { fill = {}; }
  }
  return new HTMLRewriter().on("[data-ext]", {
    element(el) {
      const html = fill[el.getAttribute("data-ext")];
      if (typeof html === "string" && html) el.replace(html, { html: true });
      else el.remove();
    },
  }).transform(doc);
}
