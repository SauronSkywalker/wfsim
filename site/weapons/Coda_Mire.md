# Coda Mire

Chinese name: 终幕·米尔

Sword · Melee · Mastery Rank 17. 235 base damage (impact 45, puncture 45, slash 66, toxin 79), 18% crit chance, 2.4x crit multiplier, 40% status chance.

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- its Coda valence bonus is not modelled: the build cannot state the element and bonus this copy rolled, so it reads without one

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Coda_Mire
- Every published board row, as JSON: https://wfsim.app/board/coda_mire.json
