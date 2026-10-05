// SPDX-License-Identifier: AGPL-3.0-or-later
// CORRECTIONS — a riven screenshot's read and what the reader confirmed it
// should have been, sent from the bar above that card when they ticked it (docs/
// ACCOUNTS.md §"Offered screenshots"). The card's own rectangle, the lines,
// what they first read as and what was confirmed; stored under
// `ocr-samples/<day>/<id>` and nothing else: no address, no account, no id a
// reader could be found by. With no bucket bound it is not offered.

const MAX_IMAGE_BYTES = 1_500_000;
const MAX_LINES = 40;
const DAYS_KEPT = 365;

const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8" } });

export async function ocrSample(request, env) {
  if (request.method !== "POST") return reply({ ok: false, error: "POST only" }, 405);
  if (!env.UPLOADS) return reply({ ok: false, error: "not offered here" }, 501);
  // HOW OFTEN ONE ADDRESS MAY OFFER, keyed by the address, which is not stored.
  if (env.OCR_LIMIT) {
    const { success } = await env.OCR_LIMIT.limit({ key: "ocr" + (request.headers.get("cf-connecting-ip") || "unknown") });
    if (!success) return reply({ ok: false, error: "too many at once" }, 429);
  }
  let b;
  try { b = await request.json(); } catch (_) { return reply({ ok: false, error: "not json" }, 400); }
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ""));
  const bytes = m ? Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)) : null;
  if (!bytes || bytes.length > MAX_IMAGE_BYTES) return reply({ ok: false, error: "a JPEG under 1.5 MB" }, 400);
  const lines = Array.isArray(b.lines) ? b.lines.slice(0, MAX_LINES).map((x) => String(x).slice(0, 200)) : [];
  const read = b.read && typeof b.read === "object" ? b.read : null;
  const confirmed = b.confirmed && typeof b.confirmed === "object" ? b.confirmed : null;
  if (JSON.stringify([read, confirmed]).length > 8000) return reply({ ok: false, error: "riven too large" }, 400);
  const weapon = /^[a-z0-9_]{1,64}$/.test(b.weapon) ? b.weapon : null;
  const lang = /^[a-z-]{2,8}$/.test(b.lang) ? b.lang : null;
  const day = new Date().toISOString().slice(0, 10);
  const key = `ocr-samples/${day}/${crypto.randomUUID()}`;
  await env.UPLOADS.put(key + ".jpg", bytes, { httpMetadata: { contentType: "image/jpeg" } });
  await env.UPLOADS.put(key + ".json", JSON.stringify({ day, weapon, lang, lines, read, confirmed }),
    { httpMetadata: { contentType: "application/json" } });
  return reply({ ok: true, kept_days: DAYS_KEPT });
}
