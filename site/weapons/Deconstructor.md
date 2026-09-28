# Deconstructor

Chinese name: 分离

Sentinel Weapon · Sentinel · Mastery Rank 0. 130 base damage (impact 43.3333, puncture 43.3333, slash 43.3333), 0% crit chance, 1x crit multiplier, 25% status chance.

## Not modelled here

- this weapon CANNOT BE MODDED here — it uses melee and thrown melee mods (Pressure Point, Fury, Whirlwind, Power Throw) and this app models guns, so it has no pool to draw from. Its base numbers are real; a build is not
- the damage TYPE ROTATION is averaged — the weapon throws 130 of one type at a time, cycling Impact then Puncture then Slash, and this entry carries an equal three-way split instead. Total damage and status mix come out exact; ARMOUR does not, because mitigation is applied per instance and a blended hit is not the average of three pure ones
- the projectiles BOUNCE OFF WALLS like a thrown glaive, and this arena has no walls to bounce off
- the companion FIRES THIS WEAPON, not the player — it picks its own targets, fires when it decides to, and stops while the companion is reviving or out of range; this arena fires it continuously at one target, which is the ceiling rather than the average
- this attack's SPREAD is not in the data, so none of its shots can miss — the wiki's weapon module publishes a cone for it and the intake could not identify which of that weapon's attacks this entry is, so it took nothing rather than the wrong one. At a range every pellet lands here, which is the ceiling; at point blank it costs nothing, because nothing misses there anyway

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Deconstructor
- Every published board row, as JSON: https://wfsim.app/board/deconstructor.json
