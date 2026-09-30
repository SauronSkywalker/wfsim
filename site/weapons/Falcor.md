# Falcor

Chinese name: 猎鹰轮

Glaive · Melee · Mastery Rank 8. 230 base damage (electricity 84, impact 36, puncture 18, slash 92), 12% crit chance, 1.6x crit multiplier, 34% status chance.

## Not modelled here

- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- not modelled — Throw, Throw Bounce Explosion, Throw Recall Explosion, Charged Throw, Charged Throw Bounce Explosion and Charged Throw Recall Explosion: of this weapon's attacks only the swing, the slam and the heavy slam are
- a glaive's heavy attack is a THROW, which is not modelled, so it has no heavy mode here and a Tennokai window converts nothing

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Falcor
- Every published board row, as JSON: https://wfsim.app/board/falcor.json
