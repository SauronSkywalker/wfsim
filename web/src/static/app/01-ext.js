// ---- EXTENSIONS ----------------------------------------------------------------
//
// docs/UI.md §Extensions. What a deployment mounts beyond the calculator: one
// script served behind `/api/cloud/`, which registers pages, strings and hooks
// here and draws with the page's own helpers. With nothing behind that door — a
// dev server, a fork, the desktop shell — nothing mounts and the calculator is
// whole, so no line of this page may assume an extension is there.

const EXT = {
  /// kind -> { path, view, title, nav, open, settings, available(), load(),
  /// render(account), shown(main) }: a page drawn in `#auth-page`.
  pages: {},
  /// lang -> { English source: that language's string }, read by `tr`.
  strings: {},
  /// name -> function, called through `extHook`.
  hooks: {},
};

/// A HOOK THAT THROWS IS A HOOK THAT IS NOT THERE: an extension's failure never
/// reaches the calculator.
async function extHook(name, ...args) {
  const f = EXT.hooks[name];
  if (!f) return undefined;
  try { return await f(...args); } catch (_) { return undefined; }
}
/// …and one whose answer is needed while drawing, which may not wait.
function extHookNow(name, ...args) {
  const f = EXT.hooks[name];
  if (!f) return undefined;
  try { return f(...args); } catch (_) { return undefined; }
}
const extKindOf = (path) => Object.keys(EXT.pages).find((k) => EXT.pages[k].path === path) || null;

/// Once settled, a route starts synchronously as it always has.
let extSettled = false;
/// MOUNTED ONCE, BEFORE THE FIRST ROUTE: `route` waits on this, so an
/// extension's address opens its page rather than the home grid. It is in
/// flight while the engine boots, so the wait is the slower of the two.
const extReady = (async () => {
  try {
    const r = await fetch("/api/cloud/page.js", { credentials: "same-origin" });
    if (!r.ok || !/javascript/.test(r.headers.get("content-type") || "")) return;
    const s = document.createElement("script");
    s.textContent = await r.text();
    document.head.appendChild(s);
  } catch (_) { /* nothing mounted */ }
})().finally(() => { extSettled = true; });
