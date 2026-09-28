# Ferrox

Chinese name: 铁晶磁轨炮

Rifle · Primary · Mastery Rank 14. 350 base damage (impact 35, puncture 245, slash 70), 32% crit chance, 2.8x crit multiplier, 10% status chance.

## Best riven-free build on the WFSim board, as of 2026-09-28

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.5461 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Heavy Caliber, Serration, Critical Delay, Vital Sense, Primary Compression |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.7955 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Heavy Caliber, Serration, Critical Delay, Vital Sense, Primary Compression |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.03297 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Heavy Caliber, Serration, Critical Delay, Vital Sense, Primary Compression |

## Not modelled here

- the CATALOG gives this weapon's radial its own Condition Overload row at 350% of its base ('Ferrox | Hitscan AoE Direct | Hitscan | 200 | 700 | 350% | Adding'), and there is no per-part CO fraction here — `co_base_fraction` is one number per ENTRY. So the part takes the term at 100% of its own base and a status-stacking build is understated on it
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- it reloads 33% of its magazine a second while HOLSTERED or deployed, which is free ammunition bought by putting the weapon away — this arena never holsters it, so the reload here is always the full one
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Ferrox
- Every published board row, as JSON: https://wfsim.app/board/ferrox.json
