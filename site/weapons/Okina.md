# Okina

Chinese name: 翁

Dual Daggers · Melee · Mastery Rank 5. 140 base damage (impact 7, puncture 63, slash 70), 16% crit chance, 2x crit multiplier, 20% status chance.

## Not modelled here

- the 5% Movement Speed bonus while the weapon is held: nobody moves in this arena
- one attack input's own animation length is not published anywhere: the wiki gives a combo's total duration at 1.0x attack speed and one entry per input, so the combo's DURATION is exact and the split between its INPUTS is even. It moves a status tick's start by fractions of a second inside a combo and moves no total
- Power Spike's partial combo decay is a Warframe passive and is not modelled: this counter drops to zero when its clock runs out, so a build running that passive keeps far more of it than this reports
- how long a spectral dagger ORBITS before it seeks is unpublished — the Incarnon Form card carries a stand-in — and which body it seeks is unpublished too: it takes the nearest one inside 15 m. Both decide how soon a kill pays, and neither is measured
- the heavy attack is 2x, from this weapon's own infobox; the wiki's class table and its stance module say 5x, and nobody has measured which is right

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Okina
- Every published board row, as JSON: https://wfsim.app/board/okina.json
