// AN ENTER OR AN ESC IS THE INPUT METHOD'S WHILE IT COMPOSES. Typing pinyin,
// Enter picks a candidate and Esc drops the composition; a keydown handler
// that reads either key without asking first submits, closes or cancels what
// the reader is still typing. Every handler naming one asks `imeComposing(e)`
// (the app's parts) or both `isComposing` and keyCode 229 (Nona, who cannot
// name the app's globals) — Safari sends the committing Enter with
// `isComposing` already false. No browser; `check_ime_search` drives the boxes.
//
//   node scripts/check_ime_keys.mjs
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((x) => (x.isDirectory() ? walk(`${d}/${x.name}`) : x.name.endsWith(".js") ? [`${d}/${x.name}`] : []));

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${ok || detail === undefined ? "" : `  — ${detail}`}`);
  if (!ok) failures += 1;
};

const KEYDOWN = /addEventListener\("keydown"|\.onkeydown\s*=/g;
const ASKS = /imeComposing\(|isComposing[\s\S]*229|229[\s\S]*isComposing/;
const handlers = [];
for (const file of walk(resolve(ROOT, "web/src/static"))) {
  const src = readFileSync(file, "utf8");
  const at = [...src.matchAll(KEYDOWN)].map((m) => m.index);
  at.forEach((from, i) => {
    // A HANDLER is its text up to the next handler, at most a dozen lines.
    const body = src.slice(from, at[i + 1] ?? src.length).split("\n").slice(0, 12).join("\n");
    if (!/"(Enter|Escape)"/.test(body)) return;
    const line = src.slice(0, from).split("\n").length;
    handlers.push({ where: `${file.slice(ROOT.length + 1).split("\\").join("/")}:${line}`, asks: ASKS.test(body) });
  });
}
const deaf = handlers.filter((h) => !h.asks);
check(`every Enter or Esc handler asks whether an input method is composing (${handlers.length})`,
  handlers.length > 0 && deaf.length === 0, deaf.map((h) => h.where).join(", "));

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nan Enter or an Esc waits for the input method");
