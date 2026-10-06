// ---- A SECTION WIDER THAN THE SCREEN SCROLLS, AND SAYS SO --------------------
//
// docs/UI.md §"A section wider than the screen". `.block` clips its corners, so
// a body wider than a phone would vanish past the right edge. A body scrolls
// sideways instead (`.block > .bb`), and a phone's overlay scrollbar is
// invisible until touched — so each overflowing body gets this bar, pinned to
// the bottom of the screen while its section is on it, with a thumb a finger
// can drag. A layout that fits never shows it; the bar is the backstop.

/// The bar of one section body, made on first overflow and kept.
function hscrollBar(bb) {
  if (bb.__hbar) return bb.__hbar;
  const bar = document.createElement("div");
  bar.className = "hbar";
  bar.hidden = true;
  bar.innerHTML = `<button type="button" class="hbar-step" data-d="-1" aria-label="${escHtml(tr("scroll left"))}">‹</button>`
    + `<div class="hbar-track"><div class="hbar-thumb"></div></div>`
    + `<button type="button" class="hbar-step" data-d="1" aria-label="${escHtml(tr("scroll right"))}">›</button>`;
  bb.after(bar);
  const track = bar.querySelector(".hbar-track");
  const thumb = bar.querySelector(".hbar-thumb");
  // Track pixels to body pixels: the thumb is the visible fraction of the body.
  const ratio = () => bb.scrollWidth / Math.max(1, track.clientWidth);
  bar.querySelectorAll(".hbar-step").forEach((b) => b.addEventListener("click", () =>
    bb.scrollBy({ left: Number(b.dataset.d) * bb.clientWidth * 0.8, behavior: "smooth" })));
  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    const x0 = e.clientX, left0 = bb.scrollLeft;
    const move = (m) => { bb.scrollLeft = left0 + (m.clientX - x0) * ratio(); };
    const up = () => {
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", up);
      thumb.removeEventListener("pointercancel", up);
      bar.classList.remove("drag");
    };
    bar.classList.add("drag");
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up);
    thumb.addEventListener("pointercancel", up);
  });
  // A tap on the track puts the thumb's middle where the finger is.
  track.addEventListener("pointerdown", (e) => {
    const r = track.getBoundingClientRect();
    bb.scrollTo({ left: (e.clientX - r.left) * ratio() - bb.clientWidth / 2, behavior: "smooth" });
  });
  bb.addEventListener("scroll", () => hscrollPaint(bb), { passive: true });
  bb.__hbar = bar;
  return bar;
}

function hscrollPaint(bb) {
  const bar = bb.__hbar;
  if (!bar || bar.hidden) return;
  const track = bar.querySelector(".hbar-track");
  const tw = track.clientWidth;
  const w = Math.max(28, tw * bb.clientWidth / bb.scrollWidth);
  const room = bb.scrollWidth - bb.clientWidth;
  const thumb = bar.querySelector(".hbar-thumb");
  thumb.style.width = `${w}px`;
  thumb.style.transform = `translateX(${room > 0 ? (tw - w) * bb.scrollLeft / room : 0}px)`;
  bar.querySelector('[data-d="-1"]').disabled = bb.scrollLeft <= 0;
  bar.querySelector('[data-d="1"]').disabled = bb.scrollLeft >= room - 1;
}

function hscrollAll() {
  for (const bb of document.querySelectorAll(".block > .bb")) {
    const over = bb.scrollWidth > bb.clientWidth + 1 && bb.getClientRects().length > 0;
    if (!over && !bb.__hbar) continue;
    const bar = hscrollBar(bb);
    bar.hidden = !over;
    hscrollPaint(bb);
  }
}

// ONE PASS A FRAME, however many nodes a redraw touched or however the window
// moved — the same debounce the start pins use.
let hscrollFrame = 0;
const hscrollSoon = () => {
  if (!hscrollFrame) hscrollFrame = requestAnimationFrame(() => { hscrollFrame = 0; hscrollAll(); });
};
new MutationObserver(hscrollSoon).observe(document.documentElement, { childList: true, subtree: true });
addEventListener("resize", hscrollSoon);
