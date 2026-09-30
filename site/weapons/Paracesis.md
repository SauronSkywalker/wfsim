# Paracesis

Chinese name: 心智之殁

Heavy Blade · Melee · Mastery Rank 10. 222 base damage (impact 48.8, puncture 17.8, slash 155.4), 31% crit chance, 2.6x crit multiplier, 22% status chance.

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- not modelled — each rank past 30 adds damage against Sentients, and at rank 40 it gains Void damage properties against them
- not modelled — a stance's mini-slam, one without the full slam visual, is multiplied by the combo multiplier and can crit

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Paracesis
- Every published board row, as JSON: https://wfsim.app/board/paracesis.json
