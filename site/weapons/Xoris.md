# Xoris

Chinese name: 驱魔之刃

Glaive · Melee · Mastery Rank 4. 120 base damage (impact 24, puncture 40.8, slash 55.2), 20% crit chance, 2.4x crit multiplier, 18% status chance.

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- not modelled — Throw, Throw Bounce Explosion, Throw Recall Explosion, Charged Throw, Charged Throw Bounce Explosion and Charged Throw Recall Explosion: of this weapon's attacks only the swing, the slam and the heavy slam are
- a glaive's heavy attack is a THROW, which is not modelled, so it has no heavy mode here and a Tennokai window converts nothing

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Xoris
- Every published board row, as JSON: https://wfsim.app/board/xoris.json
