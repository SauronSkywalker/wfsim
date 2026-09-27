use super::*;

/// THE OKINA, resolved the way the page resolves a melee Incarnon: twice, the
/// armed panel with EVO1 and the unarmed one without (`FightParams::for_panel`).
///
/// `frail` puts a level-1 unit on the target and on four bodies beside it, all
/// inside the daggers' 15 m, because a dagger is made by a KILL and the
/// training dummy cannot die. `armed` holds the window open from the first
/// swing, the card knob a test uses to ask what the form is worth.
fn okina(form: &str, evos: &[&str], mods: &[&str], frail: bool, armed: bool) -> FightParams {
    let weapon = if form.starts_with("okina_prime") { "okina_prime" } else { "okina" };
    let base = crate::model::WeaponBase::from_data(form, false, evos);
    let pool = crate::data::mods::pool_for_weapon(weapon);
    let refs: Vec<&crate::model::ModDef> =
        mods.iter().filter_map(|id| pool.iter().find(|m| m.id == *id)).collect();
    assert_eq!(refs.len(), mods.len(), "every mod is in the Okina's pool: {mods:?}");
    let panel = crate::build::loadout::resolve(&base, &refs, crate::model::StackPolicy::Emergent);
    let mut arena = crate::arena::Arena::training(30.0);
    if frail {
        let unit = crate::data::enemies::all()
            .into_iter()
            .find(|e| e.id == "corrupted_heavy_gunner")
            .expect("the roster has one");
        let body = unit
            .target_params(1, false, false, TargetMode::InstantRespawn)
            .expect("a level 1 ordinary unit is legal");
        arena.target = body.clone();
        arena.others = (1..=4)
            .map(|i| crate::formation::FoeSpec {
                id: String::new(),
                params: body.clone(),
                body_parts: BodyPart::humanoid(),
                at: crate::rules::space::Vec2::new(1.5 + i as f64, 1.0),
            })
            .collect();
    }
    let mut p = FightParams::for_panel(&panel, &arena, &crate::data::arcanes::ArcaneFx::none(), || {
        let unarmed: Vec<&str> = evos
            .iter()
            .copied()
            .filter(|id| !crate::data::evolutions::states_incarnon_window(id))
            .collect();
        let b = crate::model::WeaponBase::from_data(form, false, &unarmed);
        crate::build::loadout::resolve(&b, &refs, crate::model::StackPolicy::Emergent)
    });
    if armed {
        let mut c = BuffConfig::new();
        c.insert("melee_incarnon".into(), (1, true));
        p.apply_buff_config(&c);
    }
    p
}

/// The dagger rows of one fight's record, as `(t, effective)`.
fn dagger_rows(p: &FightParams) -> Vec<(f64, f64)> {
    record(p, 0x0C1A, 0.0, 30.0, 1_000_000, 0)
        .events()
        .iter()
        .filter_map(|e| match &e.kind {
            crate::record::Kind::Damage(d) if d.origin == crate::record::Origin::SpectralDagger => {
                Some((e.t, d.effective))
            }
            _ => None,
        })
        .collect()
}

/// **A KILL MAKES A DAGGER, AND THE DAGGER HOLDS UP NO SWING.**
///
/// The same fight twice with the same dice, the daggers switched off in the
/// second: the swing count is identical — a dagger flies on its own clock —
/// and only the first has dagger rows in its record.
#[test]
fn a_kill_makes_a_dagger_and_the_dagger_holds_up_no_swing() {
    let evo = ["okina_evo1_incarnon_form"];
    let with = okina("okina", &evo, &[], true, true);
    assert!(with.spectral_dagger.is_some(), "the armed panel makes daggers");
    let mut without = with.clone();
    without.spectral_dagger = None;

    let a = run_once(&with, &mut Rng::new(0x0C1A));
    let b = run_once(&without, &mut Rng::new(0x0C1A));
    assert!(b.kills > 3, "the fixture has to kill: {}", b.kills);
    assert_eq!(a.shots, b.shots, "a dagger must not cost the swing loop a single swing");

    let rows = dagger_rows(&with);
    assert!(!rows.is_empty(), "kills in the form must make daggers that land");
    assert!(dagger_rows(&without).is_empty());
    // A STRIKE IS NEVER BEFORE ITS ORBIT: the first dagger is made by the first
    // kill, and it circles a full second before it seeks.
    let first_kill = b.first_kill_at.expect("a kill");
    assert!(
        rows[0].0 >= first_kill + 1.0 - 1e-9,
        "the first dagger lands at {:.2} s, the first kill was at {first_kill:.2} s",
        rows[0].0
    );
}

/// **NO FORM, NO DAGGERS.** A light combo with no Tennokai card performs no
/// heavy attack, so the Incarnon Form is never armed — and the kills it makes
/// in the meantime make nothing.
#[test]
fn a_kill_outside_the_form_makes_no_dagger() {
    let p = okina("okina", &["okina_evo1_incarnon_form"], &[], true, false);
    assert!(run_once(&p, &mut Rng::new(0x0C1A)).kills > 3, "the fixture has to kill");
    assert!(dagger_rows(&p).is_empty(), "the form was never up, so no kill made a dagger");
}

/// **WHAT REACHES A DAGGER, AND WHAT DOES NOT** — read off the resolved panel,
/// where each bucket is one term and nothing else moves it.
///
/// *"Dagger direct hits and explosions are not affected by melee damage
/// bonuses, such as Incarnon form's innate +100% melee damage, Pressure
/// Point"*; *"Dagger damage type can be changed with elemental mods"*; and the
/// EVO2 pair's base damage reaches the daggers and not the swing (the page's
/// Bugs).
#[test]
fn melee_damage_misses_the_dagger_and_elements_and_the_evo2_bug_reach_it() {
    let dagger = |evos: &[&str], mods: &[&str]| {
        let base = crate::model::WeaponBase::from_data("okina", false, evos);
        let pool = crate::data::mods::pool_for_weapon("okina");
        let refs: Vec<&crate::model::ModDef> =
            mods.iter().filter_map(|id| pool.iter().find(|m| m.id == *id)).collect();
        let panel = crate::build::loadout::resolve(&base, &refs, crate::model::StackPolicy::Emergent);
        let g = panel.spectral_dagger.expect("EVO1 makes daggers");
        (g.strike.damage.total(), g.blast.damage.total(), panel.damage.total())
    };
    let evo = ["okina_evo1_incarnon_form"];
    let (strike, blast, swing) = dagger(&evo, &[]);
    assert!((strike - 140.0).abs() < 1e-9, "the infobox's 21 + 49 + 70, untouched by +100%: {strike}");
    assert!((blast - 140.0).abs() < 1e-9, "the explosion's 140 Cold: {blast}");
    assert!((swing - 280.0).abs() < 1e-9, "…while the swing takes the Form's +100%: {swing}");

    let (pp, _, pp_swing) = dagger(&evo, &["pressure_point"]);
    assert!((pp - strike).abs() < 1e-9, "Pressure Point must not reach the dagger: {pp}");
    assert!(pp_swing > swing, "…and does reach the swing");

    let (cold, _, _) = dagger(&evo, &["north_wind"]);
    assert!(cold > strike * 1.5, "an elemental mod reaches it: {strike} -> {cold}");

    let (red, red_blast, red_swing) = dagger(&["okina_evo1_incarnon_form", "okina_seeing_red"], &[]);
    assert!((red - 200.0).abs() < 1e-9, "+60 base damage on the dagger: {red}");
    assert!((red_blast - 200.0).abs() < 1e-9, "…on both of its halves: {red_blast}");
    assert!((red_swing - swing).abs() < 1e-9, "…and none on the swing: {red_swing}");
}

/// **SEEING RED PAYS THROUGH THE COUNTER AND NOWHERE ELSE.** True Kiss forces a
/// Slash on its second input, so from then on every hit lands on a bleeding
/// target and earns five more points. With Blood Rush reading the counter that
/// is damage; with nothing reading it the fight is the same fight, to the digit
/// — which is also the proof its `+60` never reached the swing.
#[test]
fn seeing_red_pays_through_the_counter_and_nowhere_else() {
    let run = |evos: &[&str], mods: &[&str]| monte_carlo(&okina("okina", evos, mods, false, false), 12, 7).mean_damage;
    let red = ["okina_seeing_red"];
    assert_eq!(run(&[], &[]), run(&red, &[]), "nothing reads the counter, so the perk pays nothing");
    let off = run(&[], &["blood_rush"]);
    let on = run(&red, &["blood_rush"]);
    assert!(on > off * 1.05, "Blood Rush reads a counter Seeing Red fills faster: {off:.0} -> {on:.0}");
}

/// **SYNERGIST SURETY IS STATUS DAMAGE, ON A CLOCK THE CRITS KEEP.** It grows
/// what every bleed ticks for and leaves every direct hit exactly where it was.
#[test]
fn synergist_surety_grows_the_bleeds_and_not_the_hits() {
    let run = |evos: &[&str]| monte_carlo(&okina("okina_prime", evos, &[], false, false), 12, 7);
    let off = run(&[]);
    let on = run(&["okina_prime_synergist_surety"]);
    assert!(
        on.mean_dot_damage > off.mean_dot_damage * 1.05,
        "five stacks of +6% status damage on a 30% crit weapon: {:.0} -> {:.0}",
        off.mean_dot_damage,
        on.mean_dot_damage
    );
    let direct = |s: &Summary| s.mean_damage - s.mean_dot_damage;
    assert!(
        (direct(&on) - direct(&off)).abs() < 1e-6 * direct(&off),
        "a direct hit is not a status: {:.3} vs {:.3}",
        direct(&off),
        direct(&on)
    );
}
