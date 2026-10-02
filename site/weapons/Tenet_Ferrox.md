# Tenet Ferrox

Chinese name: 信条·铁晶磁轨炮

Rifle · Primary · Mastery Rank 16. 200 base damage (impact 20, puncture 140, slash 40), 34% crit chance, 3x crit multiplier, 26% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-02

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 6.0406 | Malignant Force, Rime Rounds, Thermite Rounds, Galvanized Chamber, Galvanized Aptitude, Critical Delay, Vile Acceleration, Vital Sense, Primary Compression |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 31.3508 | Primed Cryo Rounds, Malignant Force, Galvanized Chamber, Primed Shred, Galvanized Aptitude, Galvanized Scope, Hammer Shot, Vital Sense, Primary Deadhead |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 1.0205 | Malignant Force, Rime Rounds, Thermite Rounds, Galvanized Chamber, Galvanized Aptitude, Critical Delay, Vile Acceleration, Vital Sense, Primary Compression |

## Not modelled here

- the CATALOG gives this weapon's radial its own Condition Overload row at 333% of its base ('Tenet Ferrox | Hitscan AoE Direct | Hitscan | 240 | 800 | 333% | Adding'), and there is no per-part CO fraction here — `co_base_fraction` is one number per ENTRY. So the part takes the term at 100% of its own base and a status-stacking build is understated on it
- the explosion's CONDITION OVERLOAD, which the catalog says it takes and computes on the DIRECT hit's base — 200 against the radial's own 60, a 333% term. `co_base_fraction` is one number per entry and this entry's direct hit is ordinary, so the radial takes none here and a status-stacking build is understated on it
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- it reloads 33% of its magazine a second while HOLSTERED or deployed, which is free ammunition bought by putting the weapon away — this arena never holsters it, so the reload here is always the full one
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Tenet_Ferrox
- Every published board row, as JSON: https://wfsim.app/board/tenet_ferrox.json
