# Tenet Exec

Chinese name: 信条·枢密

Heavy Blade · Melee · Mastery Rank 16. 190 base damage (impact 102.6, slash 87.4), 38% crit chance, 2.4x crit multiplier, 22% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-03

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | heavy | 0.2704 | Primed Fever Strike, Sacrificial Pressure, Sacrificial Steel, Blood Rush, Galvanized Reflex, Gladiator Might, Seismic Wave, Corrupt Charge, Rending Crane, Dispatch Overdrive, Melee Exposure |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | heavy | 0.2704 | Primed Fever Strike, Sacrificial Pressure, Sacrificial Steel, Blood Rush, Galvanized Reflex, Gladiator Might, Seismic Wave, Corrupt Charge, Rending Crane, Dispatch Overdrive, Melee Exposure |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.01751 | Primed Fever Strike, Sacrificial Pressure, Sacrificial Steel, Blood Rush, Galvanized Reflex, Gladiator Might, Seismic Wave, Corrupt Charge, Rending Crane, Dispatch Overdrive, Melee Exposure |

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- the wiki's stance tables give this weapon combos of its OWN (heavy slam and slam attack), which replace the equipped stance's and are not transcribed: the stance's (or its class's) are played in their place
- its Tenet valence bonus is not modelled: the build cannot state the element and bonus this copy rolled, so it reads without one
- not modelled — a slam's shockwave: three explosions 5 m apart in a line, and three such lines from a heavy slam

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Tenet_Exec
- Every published board row, as JSON: https://wfsim.app/board/tenet_exec.json
