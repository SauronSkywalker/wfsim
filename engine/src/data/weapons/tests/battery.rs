use super::*;

/// A BATTERY'S `reload_seconds` IS THE EMPTY CASE — `delay_empty + magazine /
/// regen_per_second` ([`crate::model::Battery`]), because the fight spends it
/// as the reload from empty. An arsenal figure built on the PARTIAL delay
/// reads plausible and makes every empty battery wait the wrong delay: the
/// Bubonico's 4.5 is `1.5 + 27/9`, where an empty one comes back in 3.1.
#[test]
fn a_battery_reload_is_the_empty_delay_plus_the_refill() {
    let mut checked = 0;
    for s in all() {
        let Some(b) = s.battery else { continue };
        let (Some(reload), Some(magazine)) = (s.reload_seconds, s.magazine) else {
            panic!("{}: a battery states its magazine and reload", s.id);
        };
        let want = b.delay_empty_seconds + magazine / b.regen_per_second;
        assert!(
            (reload - want).abs() < 0.01,
            "{}: reload_seconds {reload} is not {} + {magazine}/{} = {want:.3}",
            s.id,
            b.delay_empty_seconds,
            b.regen_per_second,
        );
        checked += 1;
    }
    assert!(checked >= 10, "only {checked} batteries were read");
}
