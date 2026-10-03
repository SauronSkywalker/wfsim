/// A STACKING BUFF STATES NOTHING THE PARSER DOES NOT READ. Clip Delegation
/// carried `per_shell` and `cleared_by` and the parser read neither, so the
/// card a reader saw was not the one the fight ran.
#[test]
fn stacking_buff_keys_are_all_read() {
    use serde_norway::Value;
    let mut unread = Vec::new();
    for (path, text) in crate::data::files_under("mods/") {
        let Ok(doc) = serde_norway::from_str::<Value>(text) else { continue };
        for e in doc.get("effects").and_then(Value::as_sequence).into_iter().flatten() {
            if e.get("kind").and_then(Value::as_str) != Some("stacking_buff") {
                continue;
            }
            for k in e.as_mapping().into_iter().flat_map(|m| m.keys()).filter_map(Value::as_str) {
                if !crate::data::mods::parse::STACKING_BUFF_KEYS.contains(&k) {
                    unread.push(format!("{path}: {k}"));
                }
            }
        }
    }
    assert!(unread.is_empty(), "keys the parser never reads: {unread:?}");
}

/// CLIP DELEGATION REACHES THE FIGHT AS THE CARD READS: one stack a shell the
/// reload loads, kept with no clock until the next refill, on both buckets —
/// "Next Magazine has Status Chance and Multishot increased by 15% per shot
/// landed with current Magazine. Max 15 stacks."
#[test]
fn clip_delegation_is_one_stack_a_shell_until_the_next_refill() {
    use crate::build::loadout::resolve;
    use crate::model::{BuffTrigger, ClearedBy, StackPolicy, WeaponBase};
    let pool = crate::data::mods::class_pool("shotgun");
    let cd = pool.iter().find(|m| m.id == "clip_delegation").expect("clip delegation");
    let base = WeaponBase::from_data("sobek", true, &[]);
    let panel = resolve(&base, &[cd], StackPolicy::Emergent);
    let buffs: Vec<_> = panel.stacking_buffs.iter().filter(|b| b.id == "clip_delegation").collect();
    assert_eq!(buffs.len(), 2, "status chance and multishot");
    for b in buffs {
        assert!(b.per_shell, "{:?}: not one stack a shell", b.grant);
        assert_eq!(b.trigger, BuffTrigger::ReloadComplete, "{:?}", b.grant);
        assert_eq!(b.cleared_by, ClearedBy::MagazineRefilled, "{:?}", b.grant);
        assert!(b.duration.is_infinite(), "{:?}: a clock the card does not state", b.grant);
        assert_eq!(b.max_stacks, 15, "{:?}", b.grant);
        assert!((b.per_stack - 0.15).abs() < 1e-12, "{:?}: {}", b.grant, b.per_stack);
    }
}
