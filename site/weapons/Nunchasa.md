# Nunchasa

Bow · Primary · Mastery Rank 14. 400 base damage (cold 200, puncture 200), 32% crit chance, 2.4x crit multiplier, 32% status chance.

## Not modelled here

- THE ALT FIRE IS NOT MODELLED — a second CHARGED shot, and a weapon holds one charged form because a form id has to name a form. What it does is published and none of it is below: 1.5 s of draw for 1000 damage (500 Cold, 250 Puncture, 250 Slash) at 36% crit for 3.0x, 36% status and 2 m of punch through, against this draw's 400 at 32% for 2.4x. It also leaves a CHILLING PATH behind the arrow, which has no published number at all — no damage, no width, no duration, no tick rate — and is a shape this engine does not hold: every field it has is a sphere where a shot landed, and that one is a trail along the way there
- THE DRAW IS NOT PUBLISHED. The module states a charge time for this weapon's Alt Fire (1.50 s) and none at all for this attack, so the cadence below is the 0.6 s nock alone — a bow drawn instantly. Whatever draw it really has makes it slower, so every rate here is a CEILING
- the projectile has TRAVEL TIME and has to be led — 'hitting a target at range requires leading the target before firing'. Every shot here connects the instant it is fired, so this weapon's real hit rate against anything that moves is worse than the numbers below

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Nunchasa
- Every published board row, as JSON: https://wfsim.app/board/nunchasa.json
