// SPDX-License-Identifier: AGPL-3.0-or-later
// FITS `WORK_WEIGHTS` in the engine contributors run — the site's own wasm,
// under V8. `.github/workflows/work.yml` runs it; docs/BOARD.md §"Contribution".
//
//   node scripts/work_calibrate.mjs measure out=<file.json> [rows=300] [repeats=2] [share=0.25] [pkg=<dir>]
//   node scripts/work_calibrate.mjs fit <file.json>... [unit=keep|seconds] [drop=<count>,...]
//
// `measure` times the first `share` of each sampled row's runs: a price is per
// count, so more rows buy more than longer ones. `pkg` is a wasm-bindgen
// output to time instead of the site's — an engine not yet shipped. `fit` takes each row's MEDIAN
// time across the files, one per machine. `unit=keep` holds what a point is
// worth and moves only the prices between counts; `unit=seconds` makes a point
// one second of the median machine. `drop` prices a count at zero — one whose
// error came out near its size is not pinned down, and is not shipped.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
// THE ENGINE'S OWN LIST, read from its source so a new meter is timed the day it lands.
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, "engine/src/fight/monte_carlo.rs"), "utf8");
const COUNTERS = JSON.parse(ENGINE_SRC.match(/pub const WORK_COUNTERS: \[&str; \d+\] = (\[[^\]]*\])/)[1].replace(/,\s*\]/, "]"));

const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(name + "="));
  return a ? a.slice(name.length + 1) : dflt;
};

function engine() {
  const pkg = arg("pkg", "");
  const release = pkg ? {} : JSON.parse(fs.readFileSync(path.join(ROOT, "site/release.json"), "utf8"));
  const jsFile = pkg ? path.join(pkg, "wfsim_wasm.js") : path.join(ROOT, `site/pkg/wfsim_wasm.${release.wasm}.js`);
  const wasmFile = pkg ? path.join(pkg, "wfsim_wasm_bg.wasm") : path.join(ROOT, `site/pkg/wfsim_wasm_bg.${release.wasm}.wasm`);
  if (pkg) release.wasm = createHash("sha256").update(fs.readFileSync(wasmFile)).digest("hex").slice(0, 12);
  const js = fs.readFileSync(jsFile, "utf8");
  const ctx = vm.createContext({ console, TextEncoder, TextDecoder, WebAssembly });
  vm.runInContext(js + "\nthis.wasm_bindgen = wasm_bindgen;", ctx);
  // Built inside the context: the shim tells its argument's shape by the
  // context's own `Object.prototype`.
  ctx.bytes = fs.readFileSync(wasmFile);
  vm.runInContext("wasm_bindgen.initSync({ module: bytes })", ctx);
  return { api: (p, body) => JSON.parse(ctx.wasm_bindgen.api(p, JSON.stringify(body))), release };
}

/// Every published row that can be fought again from what the file states — a
/// riven's rolls are not published — taken at an even stride, so two machines
/// measuring the same site measure the same rows.
function sample(want) {
  const dir = path.join(ROOT, "site/board");
  const all = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (r.riven_pos !== undefined || r.riven !== undefined) continue;
      const record = { weapon: f.slice(0, -5) };
      for (const k of ["mods", "evolutions", "arcanes", "valence", "exilus", "grip", "loader", "wielder"]) {
        if (r[k] !== undefined) record[k] = r[k];
      }
      all.push({ record, ruler: r.benchmark || "", mode: r.mode || "base" });
    }
  }
  const stride = Math.max(1, Math.floor(all.length / want));
  return all.filter((_, i) => i % stride === 0).slice(0, want);
}

function measure() {
  const { api, release } = engine();
  const repeats = Number(arg("repeats", "2"));
  const share = Number(arg("share", "0.25"));
  const rows = [];
  for (const row of sample(Number(arg("rows", "300")))) {
    const order = api("/api/board/order", row);
    if (!order.ok) continue;
    const runs = Math.max(1, Math.ceil(order.request.runs * share));
    let best = Infinity;
    let acc = null;
    for (let i = 0; i < repeats; i++) {
      const t0 = process.hrtime.bigint();
      const out = api("/api/board/fold", { request: order.request, from: 0, count: runs });
      best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e9);
      acc = out.acc;
    }
    if (!acc) continue;
    const key = `${row.record.weapon}|${row.ruler}|${row.mode}|${JSON.stringify(row.record)}`;
    rows.push({ key, counts: COUNTERS.map((c) => acc[c] ?? 0), seconds: best });
    process.stderr.write(`${rows.length}\t${best.toFixed(3)}s\t${row.record.weapon} ${row.ruler} ${row.mode}\n`);
  }
  const cpu = os.cpus()[0];
  const out = {
    wasm: release.wasm,
    machine: { cpu: cpu && cpu.model, cores: os.cpus().length, node: process.version, os: `${os.platform()} ${os.release()}` },
    repeats,
    share,
    rows,
  };
  fs.writeFileSync(arg("out", "work-measure.json"), JSON.stringify(out));
  console.log(`${rows.length} rows, ${rows.reduce((a, r) => a + r.seconds, 0).toFixed(1)} s, ${out.machine.cpu}`);
}

/// Lawson–Hanson non-negative least squares, `min |A w - b|` with `w >= 0`.
function nnls(A, b) {
  const n = A[0].length;
  const w = new Array(n).fill(0);
  const P = new Set();
  const grad = () => A[0].map((_, j) => A.reduce((s, row, i) => s + row[j] * (b[i] - row.reduce((t, a, k) => t + a * w[k], 0)), 0));
  const solveOn = (set) => {
    const idx = [...set];
    const m = idx.length;
    const M = idx.map((p) => [...idx.map((q) => A.reduce((s, row) => s + row[p] * row[q], 0)), A.reduce((s, row, i) => s + row[p] * b[i], 0)]);
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < m; r++) {
        if (r === c || !M[c][c]) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
      }
    }
    const z = new Array(n).fill(0);
    idx.forEach((p, r) => { z[p] = M[r][r] ? M[r][m] / M[r][r] : 0; });
    return z;
  };
  for (let iter = 0; iter < 100; iter++) {
    const g = grad();
    const scale = Math.max(...g.map(Math.abs), 1e-300);
    const cand = [...Array(n).keys()].filter((j) => !P.has(j) && g[j] > 1e-10 * scale);
    if (!cand.length) break;
    P.add(cand.reduce((a, j) => (g[j] > g[a] ? j : a)));
    for (;;) {
      const z = solveOn(P);
      const bad = [...P].filter((j) => z[j] <= 0);
      if (!bad.length) { for (let j = 0; j < n; j++) w[j] = z[j]; break; }
      const alpha = Math.min(...bad.map((j) => w[j] / (w[j] - z[j])));
      for (let j = 0; j < n; j++) w[j] += alpha * (z[j] - w[j]);
      for (const j of [...P]) if (w[j] <= 1e-15) { P.delete(j); w[j] = 0; }
    }
  }
  return w;
}

/// One standard error per price, from the fit's own residuals. A price whose
/// error is near its size is not pinned down by these rows: the sample needs
/// rows that vary that count, or the count costs nothing measurable.
function standardErrors(rows, w) {
  const on = w.map((x, j) => (x > 0 ? j : -1)).filter((j) => j >= 0);
  const A = rows.map((r) => on.map((j) => r.counts[j] / r.seconds));
  const resid = rows.map((r) => r.counts.reduce((s, c, j) => s + c * w[j], 0) / r.seconds - 1);
  const sigma2 = resid.reduce((s, e) => s + e * e, 0) / Math.max(1, rows.length - on.length);
  const m = on.length;
  const M = on.map((_, p) => [...on.map((_, q) => A.reduce((s, row) => s + row[p] * row[q], 0)), ...on.map((_, q) => (p === q ? 1 : 0))]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * m; k++) M[c][k] /= d;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let k = 0; k < 2 * m; k++) M[r][k] -= f * M[c][k];
    }
  }
  const se = new Array(w.length).fill(0);
  on.forEach((j, p) => { se[j] = Math.sqrt(sigma2 * M[p][m + p]); });
  return se;
}

const quantile = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
const relErrors = (rows, w) => rows.map((r) => Math.abs(r.counts.reduce((s, c, j) => s + c * w[j], 0) - r.seconds) / r.seconds);
/// Each row divided by its own time, so the fit minimises RELATIVE error and a
/// long row does not set every price.
const fitRows = (rows) => nnls(rows.map((r) => r.counts.map((c) => c / r.seconds)), rows.map(() => 1));

function fit() {
  const files = process.argv.slice(3).filter((a) => !a.includes("="));
  const runs = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  if (new Set(runs.map((r) => r.wasm)).size !== 1) throw new Error("the files measured different engines");
  const byKey = new Map();
  for (const run of runs) for (const r of run.rows) {
    if (!byKey.has(r.key)) byKey.set(r.key, { counts: r.counts, times: [] });
    byKey.get(r.key).times.push(r.seconds);
  }
  const rows = [...byKey.values()]
    .filter((r) => r.times.length === runs.length)
    .map((r) => ({ counts: r.counts, seconds: quantile(r.times, 0.5) }))
    .filter((r) => r.seconds > 1e-3);

  const drop = arg("drop", "").split(",").filter(Boolean);
  for (const d of drop) if (!COUNTERS.includes(d)) throw new Error(`no count named ${d}`);
  for (const r of rows) r.counts = r.counts.map((c, j) => (drop.includes(COUNTERS[j]) ? 0 : c));
  const w = fitRows(rows);
  const errs = relErrors(rows, w);
  // OUT OF SAMPLE: fit on half the rows, judge on the other half — a fit that
  // only describes its own rows has learned the sample, not the engine.
  const held = relErrors(rows.filter((_, i) => i % 2), fitRows(rows.filter((_, i) => i % 2 === 0)));
  const spread = standardErrors(rows, w);

  const current = JSON.parse(ENGINE_SRC.match(/pub const WORK_WEIGHTS: \[u64; \d+\] = (\[[^\]]*\])/)[1].replace(/_/g, ""));
  const total = (ws, k) => rows.reduce((s, r) => s + r.counts.reduce((t, c, j) => t + c * ws[j], 0), 0) * k;
  const unit = arg("unit", "keep");
  const k = unit === "seconds" ? 1e9 : total(current, 1) / total(w, 1);
  const weights = w.map((x) => Math.round(x * k));

  console.log(`engine ${runs[0].wasm}, ${rows.length} rows, ${runs.length} machines:`);
  for (const r of runs) console.log(`  ${r.machine.cpu} · ${r.machine.cores} cores · node ${r.machine.node}`);
  console.log("");
  COUNTERS.forEach((c, j) => console.log(`${c.padStart(12)}  ${(w[j] * 1e9).toFixed(1).padStart(10)} ns  ${
    w[j] ? `± ${(spread[j] / w[j] * 100).toFixed(0).padStart(3)}%` : "  (zero)"}   was ${current[j]}`));
  console.log("");
  console.log(`relative error  median ${(quantile(errs, 0.5) * 100).toFixed(1)}%  p90 ${(quantile(errs, 0.9) * 100).toFixed(1)}%  max ${(quantile(errs, 1) * 100).toFixed(1)}%`);
  console.log(`held-out half   median ${(quantile(held, 0.5) * 100).toFixed(1)}%  p90 ${(quantile(held, 0.9) * 100).toFixed(1)}%  max ${(quantile(held, 1) * 100).toFixed(1)}%`);
  console.log(`unit=${unit}: a point is ${(1e9 / k).toFixed(3)} s of the median machine`);
  console.log(`WORK_WEIGHTS = [${weights.map((x) => x.toLocaleString("en").replace(/,/g, "_")).join(", ")}]`);
}

if (process.argv[2] === "measure") measure();
else if (process.argv[2] === "fit") fit();
else { console.error("usage: work_calibrate.mjs measure|fit …"); process.exit(2); }
