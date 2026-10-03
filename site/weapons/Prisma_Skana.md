# Prisma Skana

Chinese name: 棱晶·空刃

Sword · Melee · Mastery Rank 8. 170 base damage (impact 25.5, puncture 25.5, slash 119), 28% crit chance, 2.2x crit multiplier, 16% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-03

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.08132 | Virulent Scourge, Voltaic Strike, Condition Overload, Blood Rush, Primed Reach, Galvanized Elementalist, Galvanized Steel, Weeping Wounds, Swooping Falcon, Melee Influence |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.08129 | Virulent Scourge, Voltaic Strike, Condition Overload, Blood Rush, Primed Reach, Galvanized Elementalist, Galvanized Steel, Weeping Wounds, Swooping Falcon, Melee Influence |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.007758 | Virulent Scourge, Voltaic Strike, Condition Overload, Blood Rush, Primed Reach, Galvanized Elementalist, Galvanized Steel, Weeping Wounds, Swooping Falcon, Melee Influence |

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- its Incarnon evolutions and Incarnon Form are not modelled

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Prisma_Skana
- Every published board row, as JSON: https://wfsim.app/board/prisma_skana.json
