# Helstrum

Chinese name: 赫尔斯壮

Sentinel Weapon · Sentinel · Mastery Rank 0. 9 base damage (impact 4.95, puncture 4.05), 5% crit chance, 1.5x crit multiplier, 30% status chance.

## Best riven-free build on the WFSim board, as of 2026-09-29

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.006257 | Hellfire, Wildfire, Malignant Force, Thermite Rounds, Rime Rounds, Split Chamber, Serration, Magnetic Capacity |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.006809 | Hellfire, Wildfire, Malignant Force, Thermite Rounds, Rime Rounds, Split Chamber, Serration, Magnetic Capacity |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.00003654 | Hellfire, Wildfire, Malignant Force, Thermite Rounds, Rime Rounds, Split Chamber, Serration, Magnetic Capacity |

## Not modelled here

- the missiles HOME, and homing is not modelled — this arena has one target at zero distance, so a guided missile and a straight one land the same
- the explosion's falloff is not stated by the page and is therefore not modelled — the target stands at the centre and takes the full 30 either way
- the companion FIRES THIS WEAPON, not the player — it picks its own targets, fires when it decides to, and stops while the companion is reviving or out of range; this arena fires it continuously at one target, which is the ceiling rather than the average
- this attack's SPREAD is not in the data, so none of its shots can miss — the wiki's weapon module publishes a cone for it and the intake could not identify which of that weapon's attacks this entry is, so it took nothing rather than the wrong one. At a range every pellet lands here, which is the ceiling; at point blank it costs nothing, because nothing misses there anyway

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Helstrum
- Every published board row, as JSON: https://wfsim.app/board/helstrum.json
