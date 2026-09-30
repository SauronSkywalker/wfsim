# Opticor

Chinese name: 奥堤克光子枪

Rifle · Primary · Mastery Rank 14. 1000 base damage (impact 100, puncture 850, slash 50), 20% crit chance, 2.5x crit multiplier, 20% status chance.

## Best riven-free build on the WFSim board, as of 2026-09-30

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | alternate | 0.7560 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Primary Acuity, Galvanized Aptitude, Vital Sense, Magnetic Capacity, Primary Deadhead |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | alternate | 0.7519 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Primary Acuity, Galvanized Aptitude, Vital Sense, Magnetic Capacity, Primary Deadhead |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | alternate | 0.04425 | Primed Cryo Rounds, Malignant Force, Hellfire, Galvanized Chamber, Primary Acuity, Galvanized Aptitude, Vital Sense, Magnetic Capacity, Primary Deadhead |

## Not modelled here

- the CATALOG gives this weapon's radial its own Condition Overload row at 250% of its base ('Opticor | Charged Hitscan Direct Hit Radial | Hitscan | 400 | 1000 | 250% | Adding'), and there is no per-part CO fraction here — `co_base_fraction` is one number per ENTRY. So the part takes the term at 100% of its own base and a status-stacking build is understated on it
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Opticor
- Every published board row, as JSON: https://wfsim.app/board/opticor.json
