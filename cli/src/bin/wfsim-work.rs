// SPDX-License-Identifier: AGPL-3.0-or-later
//! FITS `WORK_WEIGHTS` — what one of each counted thing costs on this machine
//! (docs/BOARD.md §"Contribution"). It folds a sample of the published board's
//! rows the way a compute order does, times each, and solves for the weights
//! that make `Shard::work` track the time with the least RELATIVE error.
//!
//!   cargo run --release -p wfsim-cli --bin wfsim-work -- [rows=200] [board=site/board]
//!
//! Run it on the reference machine, idle, after `cargo build --release`.

use std::time::Instant;

use serde_json::{json, Value};
use wfsim_engine::fight::{Shard, WORK_COUNTERS};
use wfsim_webapi::board_rows::{fold_runs, row_requests, scored_build};

const N: usize = WORK_COUNTERS.len();

fn arg(name: &str, default: &str) -> String {
    std::env::args()
        .skip(1)
        .find_map(|a| a.strip_prefix(&format!("{name}=")).map(String::from))
        .unwrap_or_else(|| default.to_string())
}

/// Every published row that can be fought again from what the file states: a
/// riven's rolls are not published, so a riven row is left out.
fn rows(dir: &str) -> Vec<(Value, String, String)> {
    let mut files: Vec<_> = std::fs::read_dir(dir).expect("board dir").flatten().map(|e| e.path()).collect();
    files.sort();
    let mut out = Vec::new();
    for f in files {
        let Some(weapon) = f.file_stem().and_then(|s| s.to_str()).map(String::from) else { continue };
        let Ok(text) = std::fs::read_to_string(&f) else { continue };
        let Ok(Value::Array(list)) = serde_json::from_str::<Value>(&text) else { continue };
        for r in list {
            if r.get("riven_pos").is_some() || r.get("riven").is_some() {
                continue;
            }
            let mut rec = json!({ "weapon": weapon });
            for k in ["mods", "evolutions", "arcanes", "valence", "exilus", "grip", "loader", "wielder"] {
                if let Some(v) = r.get(k) {
                    rec[k] = v.clone();
                }
            }
            let ruler = r.get("benchmark").and_then(Value::as_str).unwrap_or("").to_string();
            let mode = r.get("mode").and_then(Value::as_str).unwrap_or("base").to_string();
            out.push((rec, ruler, mode));
        }
    }
    out
}

/// Least squares on `x·w ≈ t`, each row weighted by 1/t so the error is
/// relative, with any weight that comes out negative dropped and the rest
/// solved again.
fn fit(xs: &[[f64; N]], ts: &[f64]) -> [f64; N] {
    let mut on = [true; N];
    loop {
        let idx: Vec<usize> = (0..N).filter(|&i| on[i]).collect();
        let m = idx.len();
        let mut a = vec![vec![0.0; m + 1]; m];
        for (x, &t) in xs.iter().zip(ts) {
            let s = 1.0 / (t * t);
            for (r, &i) in idx.iter().enumerate() {
                for (c, &j) in idx.iter().enumerate() {
                    a[r][c] += s * x[i] * x[j];
                }
                a[r][m] += s * x[i] * t;
            }
        }
        for c in 0..m {
            let p = (c..m).max_by(|&p, &q| a[p][c].abs().total_cmp(&a[q][c].abs())).unwrap();
            a.swap(c, p);
            if a[c][c].abs() < 1e-30 {
                continue;
            }
            let pivot = a[c].clone();
            for (r, row) in a.iter_mut().enumerate() {
                if r != c {
                    let f = row[c] / pivot[c];
                    for (v, p) in row.iter_mut().zip(&pivot).skip(c) {
                        *v -= f * p;
                    }
                }
            }
        }
        let mut w = [0.0; N];
        for (r, &i) in idx.iter().enumerate() {
            w[i] = if a[r][r].abs() < 1e-30 { 0.0 } else { a[r][m] / a[r][r] };
        }
        match (0..N).filter(|&i| on[i] && w[i] < 0.0).min_by(|&p, &q| w[p].total_cmp(&w[q])) {
            Some(i) => on[i] = false,
            None => return w,
        }
    }
}

fn main() {
    let want: usize = arg("rows", "200").parse().unwrap_or(200);
    let all = rows(&arg("board", "site/board"));
    let stride = (all.len() / want.max(1)).max(1);
    let mut xs = Vec::new();
    let mut ts = Vec::new();
    for (rec, ruler, mode) in all.iter().step_by(stride).take(want) {
        let Some(bench) = wfsim_engine::board::benchmarks::all().iter().find(|b| &b.id == ruler) else { continue };
        let Ok(b) = scored_build(rec, ruler) else { continue };
        let scenario = serde_json::to_value(&bench.scenario).unwrap_or(Value::Null);
        let Some((_, req)) = row_requests(&b, &scenario)
            .into_iter()
            .find(|(p, _)| (if p.id.is_empty() { "base" } else { p.id }) == mode)
        else {
            continue;
        };
        let runs = req.get("runs").and_then(Value::as_u64).unwrap_or(0) as u32;
        let mut acc = Shard::default();
        let began = Instant::now();
        if fold_runs(&req, &mut acc, 0, runs).is_err() {
            continue;
        }
        let secs = began.elapsed().as_secs_f64();
        let x = acc.work_counts().map(|n| n as f64);
        println!("{}\t{ruler}\t{mode}\t{secs:.4}\t{:?}", rec["weapon"].as_str().unwrap_or(""), acc.work_counts());
        xs.push(x);
        ts.push(secs.max(1e-4));
    }
    let w = fit(&xs, &ts);
    let mut errs: Vec<f64> = xs
        .iter()
        .zip(&ts)
        .map(|(x, t)| (x.iter().zip(&w).map(|(a, b)| a * b).sum::<f64>() - t).abs() / t)
        .collect();
    errs.sort_by(f64::total_cmp);
    let q = |p: f64| errs[((errs.len() as f64 - 1.0) * p) as usize];
    println!("rows {}  total {:.1} s", ts.len(), ts.iter().sum::<f64>());
    for (name, wi) in WORK_COUNTERS.iter().zip(w) {
        println!("{name:>12}  {:.1} ns", wi * 1e9);
    }
    println!("relative error  median {:.1}%  p90 {:.1}%  max {:.1}%", q(0.5) * 100.0, q(0.9) * 100.0, q(1.0) * 100.0);
    println!("WORK_WEIGHTS = {:?}", w.map(|wi| (wi * 1e9).round() as u64));
}
