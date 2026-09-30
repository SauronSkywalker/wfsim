//! A CYCLE RESOLVES ONE BUFF TWICE, once per form, and the two answers differ.
//!
//! `BuffGrant::FireRate` carries an ABSOLUTE rate that `resolve` derives from
//! that form's own base — the Furis Incarnon's 12 ticks/s against the base
//! form's 10 — so the same perk is worth a different number in each half of the
//! engagement. The stacks are shared (one buff, one count, one fight); only the
//! conversion is per form.
//!
//! This is the bug the stacking-buff refactor introduced and the baseline
//! caught: reading the outer params instead of the ACTIVE form handed the base
//! form the Incarnon form's rate, which showed up as more shots per engagement
//! and moved nothing else. A diff against a hand-captured baseline will not
//! exist next time, so it is asserted here.
#[test]
fn a_fire_rate_buff_converts_against_each_forms_own_base() {
    let evos = [
        "furis_evo1_incarnon_form",
        "furis_haven_foray",
        "furis_extended_volley",
        "furis_headcracker",
    ];
    let inc = crate::model::WeaponBase::from_data("furis_incarnon", true, &evos);
    let base = crate::model::WeaponBase::from_data("furis", true, &evos);
    let pol = crate::model::StackPolicy::Emergent;
    let pi = crate::build::loadout::resolve(&inc, &[], pol);
    let pb = crate::build::loadout::resolve(&base, &[], pol);

    let rate_of = |p: &crate::build::loadout::ResolvedPanel| {
        p.stacking_buffs
            .iter()
            .find(|b| b.grant == crate::model::BuffGrant::FireRate)
            .map(|b| b.per_stack)
            .expect("Headcracker resolves a fire-rate buff on both forms")
    };
    // +5% of each form's own base: 12 x 0.05 = 0.6, and 10 x 0.05 = 0.5.
    assert!((rate_of(&pi) - 0.6).abs() < 1e-9, "incarnon {}", rate_of(&pi));
    assert!((rate_of(&pb) - 0.5).abs() < 1e-9, "base {}", rate_of(&pb));
    assert!(
        rate_of(&pi) > rate_of(&pb),
        "the faster form must be worth more per stack, or the sim is reading one form's \
             rate while firing the other"
    );
}

/// A BUFF ONE FORM OF A CYCLE HAS ALONE has no stack in the cycle and pays
/// nothing there, rather than indexing past the shared stacks. Onos's
/// Sequential Skullbuster is base-form-only, and a cycle with it panicked the
/// board's scorer; docs/UNMODELLED.md §"A buff one form of a cycle has alone".
#[test]
fn a_buff_one_form_of_a_cycle_has_alone_pays_nothing_and_breaks_nothing() {
    use super::super::{run_once, ArcaneFx, FightParams, LockMode};
    let cycle = |evos: &[&str]| {
        let inc = crate::model::WeaponBase::from_data("onos_incarnon", true, evos);
        let base = crate::model::WeaponBase::from_data("onos", true, evos);
        let pol = crate::model::StackPolicy::Emergent;
        FightParams::incarnon_cycle_from_panels(
            &crate::build::loadout::resolve(&inc, &[], pol),
            &crate::build::loadout::resolve(&base, &[], pol),
            false, LockMode::Initial(0),
            &crate::arena::Arena::training(20.0), &ArcaneFx::none(),
        )
    };
    let with = cycle(&["onos_evo1_incarnon_form", "onos_sequential_skullbuster"]);
    let without = cycle(&["onos_evo1_incarnon_form"]);
    let form = &with.cycle.as_ref().expect("a cycle").base_form;
    assert_eq!(
        form.stacking_buffs.iter().map(|b| b.id).collect::<Vec<_>>(),
        with.stacking_buffs.iter().map(|b| b.id).collect::<Vec<_>>(),
        "both forms of a cycle list the same stacking buffs, in the order the shared stacks are",
    );
    let score = |p: &FightParams| run_once(p, &mut crate::fight::Rng::new(7)).total_damage();
    assert_eq!(score(&with), score(&without), "the base-form-only buff pays nothing in the cycle");
}
