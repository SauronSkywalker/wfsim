// SPDX-License-Identifier: AGPL-3.0-or-later
//! THE OPTIMIZER BUILDS NO FIGHT (docs/OPTIMIZER.md, "The search and the replay
//! must be the SAME fight"): a candidate is scored by the simulator's own
//! construction, handed in as `Scenario.params`. A fight built here is a second
//! answer to "what does this build fight", and the two drift a term at a time.

/// Where the crate may name a `FightParams` constructor: the fixture fight a
/// test states (`Scenario::from_panels`) and the CLI, which has no simulator.
const ALLOWED: &[&str] = &["evaluate.rs", "main.rs"];

#[test]
fn the_optimizer_constructs_no_fight_of_its_own() {
    let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut found = Vec::new();
    for entry in std::fs::read_dir(&src).expect("src") {
        let path = entry.expect("entry").path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") || ALLOWED.contains(&name.as_str()) {
            continue;
        }
        let text = std::fs::read_to_string(&path).expect("read");
        for (i, line) in text.lines().enumerate() {
            let code = line.split("//").next().unwrap_or_default();
            if code.contains("FightParams::") {
                found.push(format!("{name}:{}: {}", i + 1, line.trim()));
            }
        }
    }
    assert!(found.is_empty(), "the optimizer builds a fight of its own:\n{}", found.join("\n"));
}
