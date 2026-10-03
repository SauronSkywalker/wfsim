// USAGE POINTS — the page's half against the worker's, and the endpoint against
// a stub dataset. What must hold (docs/ANALYTICS.md):
//   - every event the page sends is one the worker accepts, and every one the
//     worker accepts is sent from somewhere: a name on one side only is a time
//     series that silently never starts;
//   - the page writes the schema the worker reads;
//   - a point carries the visitor as its index and nothing that identifies them;
//   - anything that is not a point is refused and never written;
//   - no dev server or check host is live, so no test writes the live dataset.
//
//   node scripts/check_usage_events.mjs
import worker, { USAGE_EVENTS, USAGE_SCHEMA, usagePoint } from "../worker/index.js";
import { appSource } from "./app_source.mjs";

let failures = 0;
const check = (what, ok, detail = "") => {
  console.log(`  ${ok ? "ok " : "FAIL"}  ${what}${ok || !detail ? "" : `   ${detail}`}`);
  if (!ok) failures++;
};

const src = appSource();
const calls = [...src.matchAll(/(?<!function )\btrack\(([^,)]*)/g)].map((m) => m[1].trim());
const named = calls.filter((a) => /^"[^"]*"$/.test(a)).map((a) => a.slice(1, -1));
check("every track() call names its event as a literal", named.length === calls.length,
  calls.filter((a) => !/^"[^"]*"$/.test(a)).join(", "));
const unknown = named.filter((e) => !USAGE_EVENTS.includes(e));
check("every event the page sends is one the worker accepts", !unknown.length, unknown.join(", "));
const unsent = USAGE_EVENTS.filter((e) => !named.includes(e));
check("every event the worker accepts is sent by the page", !unsent.length, unsent.join(", "));

const v = src.match(/\bv: (\d+), e: event\b/);
check("the page writes the worker's schema", v && Number(v[1]) === USAGE_SCHEMA,
  v ? `page ${v[1]}, worker ${USAGE_SCHEMA}` : "no `v:` in track()");
// A ROUTE WITHOUT A VIEW KIND sends an empty subject, which the worker accepts.
const kinds = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\{([^}]*)\\}`));
  return m ? [...m[1].matchAll(/:\s*"([a-z_]+)"/g)].map((x) => x[1]) : [];
};
const viewKeys = (() => {
  const m = src.match(/const AUTH_VIEWS = \{([^}]*)\}/);
  return m ? [...m[1].matchAll(/\b([a-z_]+):/g)].map((x) => x[1]) : [];
})();
const authKinds = kinds("AUTH_PATHS");
check("every account route has its own view kind", authKinds.length > 0
  && authKinds.every((k) => viewKeys.includes(k)) && new Set(kinds("AUTH_VIEWS")).size === viewKeys.length,
  `routes ${authKinds.join(",")}; views ${viewKeys.join(",")}`);
const hosts = src.match(/const LIVE_HOSTS = (\[[^\]]*\])/);
const live = hosts ? JSON.parse(hosts[1]) : [];
check("no dev or check host is live", live.length > 0
  && !live.some((h) => /^(127\.|localhost$|0\.0\.0\.0$)/.test(h)), hosts ? hosts[1] : "no LIVE_HOSTS");

const written = [];
const env = { USAGE: { writeDataPoint: (p) => written.push(p) } };
const cid = "0123456789abcdef0123456789abcdef";
const good = { v: USAGE_SCHEMA, e: "simulator.run", cid, subject: "torid", route: "weapons",
  lang: "zh", shell: "web", release: "r20260927.1", n: 1000 };
const post = (b, e = env, method = "POST") => worker.fetch(Object.assign(new Request("https://wfsim.app/api/e", {
  method, ...(method === "POST" ? { body: typeof b === "string" ? b : JSON.stringify(b) } : {}),
}), { cf: { country: "CN" } }), e);

let r = await post(good);
check("a point is accepted", r.status === 204, `status ${r.status}`);
const p = written[0];
check("…and written once, indexed by the visitor", written.length === 1 && p.indexes[0] === cid);
check("…carrying the event, subject, route, language, shell, release and country",
  p && JSON.stringify(p.blobs) === JSON.stringify(["simulator.run", cid, "torid", "weapons", "zh", "web", "r20260927.1", "CN"]),
  p && JSON.stringify(p.blobs));
check("…and the schema and the count", p && p.doubles[0] === USAGE_SCHEMA && p.doubles[1] === 1000);
check("…answering any origin, so the desktop shell can post",
  r.headers.get("access-control-allow-origin") === "*");

const refused = [
  ["an event nobody declared", { ...good, e: "builder.click" }],
  ["a visitor id that is not one", { ...good, cid: "me@example.com" }],
  ["a subject with a path in it", { ...good, subject: "../x" }],
  ["another schema", { ...good, v: USAGE_SCHEMA + 1 }],
  ["a shell that does not exist", { ...good, shell: "bot" }],
  ["a negative count", { ...good, n: -1 }],
  ["not json", "{"],
];
for (const [what, b] of refused) {
  const before = written.length;
  r = await post(b);
  check(`refused and not written: ${what}`, r.status === 400 && written.length === before, `status ${r.status}`);
}
check("the page's own route fallback is a route the worker accepts",
  ["home", "other"].every((route) => usagePoint({ ...good, route }, "")));
for (const ua of [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/145.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.0.0 Safari/537.36",
]) {
  const before = written.length;
  r = await worker.fetch(new Request("https://wfsim.app/api/e", { method: "POST", body: JSON.stringify(good),
    headers: { "user-agent": ua } }), env);
  check(`a crawler that runs the page is answered and not counted: ${ua.match(/\w+(bot|Chrome)\b/i)[0]}`,
    r.status === 204 && written.length === before);
}
{
  const before = written.length;
  r = await worker.fetch(new Request("https://wfsim.app/api/e", { method: "POST", body: JSON.stringify(good),
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0" } }), env);
  check("…and a reader's browser is", r.status === 204 && written.length === before + 1);
}
r = await post(good, {});
check("no dataset bound is a 503, not a silent 204", r.status === 503, `status ${r.status}`);
r = await post(null, env, "OPTIONS");
check("a preflight is answered", r.status === 204 && r.headers.get("access-control-allow-methods"));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nusage points: page and worker agree");
