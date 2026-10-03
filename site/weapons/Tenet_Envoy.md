# Tenet Envoy

Chinese name: 信条·典客

Launcher · Primary · Mastery Rank 16. 100 base damage (impact 100), 28% crit chance, 2.6x crit multiplier, 24% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-03

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 2.5135 | Primed Cryo Rounds, Malignant Force, Galvanized Chamber, Primed Firestorm, Serration, Critical Delay, Vile Acceleration, Vital Sense, Primary Compression |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 2.5135 | Primed Cryo Rounds, Malignant Force, Galvanized Chamber, Primed Firestorm, Serration, Critical Delay, Vile Acceleration, Vital Sense, Primary Compression |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.1728 | Primed Cryo Rounds, Malignant Force, Galvanized Chamber, Primed Firestorm, Serration, Critical Delay, Vile Acceleration, Vital Sense, Primary Compression |

## Not modelled here

- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- the rockets are STEERED: "Aiming will cause fired rockets to travel toward the aiming reticle, allowing them to be guided", and "Allows firing rockets from behind cover". Both are hand-aim mechanics, and both cost the shot half its speed while used (20 m/s guided against 40 unguided). Against a target that does not move, guidance buys nothing and is charged nothing
- a rocket that hits nothing detonates on its own after 6 seconds, which needs a miss this arena resolves at the wall of its own geometry-free floor
- it reloads 10% of its magazine a second while HOLSTERED or deployed, which is free ammunition bought by putting the weapon away — this arena never holsters it, so the reload here is always the full one
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Tenet_Envoy
- Every published board row, as JSON: https://wfsim.app/board/tenet_envoy.json
