//! THE OKINA'S SPECTRAL DAGGERS — `notes: okina_spectral_dagger`.
//!
//! An ENTITY, like an orb: made by a kill, it orbits the wielder, seeks a body
//! and strikes it on a clock of its own, so the swing loop never waits for it.
//! What it deals is settled through [`field_tick`], the one function every
//! timed damage instance in this engine shares.
use super::*;

/// ONE DAGGER between the kill that made it and the body it strikes.
#[derive(Debug, Clone, Copy)]
pub(super) struct DaggerState {
    /// Whose kill made it — the rule every entity here follows.
    pub(super) owner: Seat,
    /// What it deals, as of the panel that made it.
    pub(super) part: SpectralDaggerParams,
    /// The body it seeks. `None` while nobody stands inside its reach, and then
    /// it orbits on, holding one of the six places.
    pub(super) body: Option<usize>,
    /// When it strikes — the orbit, then the flight at the infobox's speed.
    pub(super) strikes_at: f64,
}

/// MAKE A DAGGER FOR EVERY KILL SINCE THE LAST LOOK, while the form making them
/// is up.
///
/// *"Kills from the daggers will not generate new daggers, but kills from
/// status procs created by daggers will"* — `kill_mark` is advanced past a
/// dagger's own kills where they are settled ([`process_daggers`]), so what is
/// left here is every other kill: a swing's, a status tick's, a slam's.
///
/// A KILL IS SEEN AT THE NEXT SWING, which is when this runs. A status kill
/// between two swings makes its dagger up to one swing late — a fraction of a
/// second against a one-second orbit.
pub(super) fn make_daggers(
    owner: Seat,
    params: &FightParams,
    active: &FightParams,
    t: f64,
    r: &RunResult,
    kill_mark: &mut u32,
    live: &mut Vec<DaggerState>,
) {
    let fresh = r.kills.saturating_sub(*kill_mark);
    *kill_mark = r.kills;
    let Some(g) = active.spectral_dagger else { return };
    // *"Up to 6 daggers can be active at once"* — a kill with no room makes none.
    let alive = live.iter().filter(|d| d.owner == owner).count() as u32;
    let n = fresh.min(g.rules.max_alive.saturating_sub(alive));
    if n == 0 {
        return;
    }
    // THE NEAREST BODY INSIDE ITS REACH, measured from the wielder it orbits.
    // The page says it "seeks an enemy within 15 meters" and names no
    // preference, so the nearest is the one that invents none.
    let target = params
        .body_positions()
        .iter()
        .enumerate()
        .map(|(b, &at)| (b, crate::rules::space::gap(params.player_at, at)))
        .filter(|&(_, d)| d <= g.rules.seek_range_m)
        .min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
    for _ in 0..n {
        live.push(DaggerState {
            owner,
            part: g,
            body: target.map(|(b, _)| b),
            strikes_at: target.map_or(f64::INFINITY, |(_, d)| t + g.rules.orbit_seconds + d / g.speed_mps.max(1e-9)),
        });
    }
}

/// SETTLE EVERY DAGGER DUE STRICTLY BEFORE `until`, oldest first — the shape
/// [`process_orbs`] has, for the same reason: a strike changes what the next
/// one sees.
///
/// A dagger STRIKES its body — a direct hit, which rolls its own crit and
/// status, takes Condition Overload and forces ten Cold stacks — and then
/// EXPLODES there, reaching every body inside its sphere with a forced Cold of
/// its own and no Condition Overload.
#[allow(clippy::too_many_arguments)]
pub(super) fn process_daggers(
    // See `process_ticks`.
    w: &CardWindows,
    daggers: &mut Vec<DaggerState>,
    gal: &mut GalStacks,
    arc: &mut ArcRuntime,
    until: f64,
    params: &FightParams,
    active: &FightParams,
    ctx: &FieldCtx,
    r: &mut RunResult,
    rec: &mut crate::record::Record,
    d: &mut crate::rules::rng::Draws,
    bodies: &mut [Body],
    kill_mark: &mut u32,
) {
    if daggers.is_empty() {
        return;
    }
    let body_at = params.body_positions();
    while let Some(i) = daggers
        .iter()
        .enumerate()
        .filter(|(_, g)| g.strikes_at < until)
        .min_by(|a, b| a.1.strikes_at.total_cmp(&b.1.strikes_at))
        .map(|(i, _)| i)
    {
        let dagger = daggers.remove(i);
        let at = dagger.strikes_at;
        let Some(b) = dagger.body else { continue };
        process_ticks(
            w,
            &mut bodies[0], gal, arc, at + 1e-9, params, active, r, rec, &mut d.status,
            &params.foe, 0,
        );
        let kills_before = r.kills;
        let mut hit = |k: usize, part: &crate::build::loadout::ResolvedLingering, mult: f64, is_blast: bool, bodies: &mut [Body], r: &mut RunResult, rec: &mut crate::record::Record, d: &mut crate::rules::rng::Draws| {
            let (Some(spec), Some(here)) = (params.body(k), bodies.get_mut(k)) else { return };
            let killed = field_tick(
                w,
                dagger.owner,
                part, mult, at, ctx, here, k, gal, arc, params, active, r, rec, d,
                spec.params, crate::record::Origin::SpectralDagger, None, is_blast,
            );
            // THE BODY THAT STANDS BACK UP IS A NEW INDIVIDUAL, so the pile
            // the last one wore goes with it — before the explosion lands, so
            // the Cold the explosion forces lands on the one standing there.
            if killed {
                if k == 0 {
                    bodies[0].debuffs.on_death(dagger.owner, params.acid_shells, &params.foe);
                } else {
                    bodies[k].debuffs.on_death(dagger.owner, None, spec.params);
                }
            }
        };
        hit(b, &dagger.part.strike, 1.0, false, bodies, r, rec, d);
        let centre = body_at[b];
        for (k, &pos) in body_at.iter().enumerate() {
            let dist = pos.distance(centre);
            if !crate::rules::space::caught_by_blast(dist, dagger.part.blast.radius_m) {
                continue;
            }
            let mult = dagger.part.blast.falloff_at(crate::rules::space::blast_reach(dist));
            hit(k, &dagger.part.blast, mult, true, bodies, r, rec, d);
        }
        // …AND WHAT IT KILLED MAKES NO DAGGER of its own.
        *kill_mark += r.kills - kills_before;
    }
}
