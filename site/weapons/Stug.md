# Stug

Chinese name: 史特克

Pistol · Secondary · Mastery Rank 2. 4 base damage (corrosive 4), 5% crit chance, 1.5x crit multiplier, 10% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-03

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | cycle | 57.0216 | Deep Freeze, Pistol Pestilence, Primed Heated Charge, Galvanized Diffusion, Primed Target Cracker, Galvanized Crosshairs, Lethal Torrent, Anemic Agility, Cascadia Flare |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | cycle | 60.2290 | Frostbite, Pistol Pestilence, Primed Convulsion, Galvanized Diffusion, Hornet Strike, Primed Target Cracker, Galvanized Crosshairs, Lethal Torrent, Secondary Deadhead |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | cycle | 13.9331 | Frostbite, Pistol Pestilence, Primed Heated Charge, Galvanized Diffusion, Primed Target Cracker, Primed Pistol Gambit, Lethal Torrent, Anemic Agility, Lethal Momentum, Cascadia Flare |

## Not modelled here

- the Incarnon form's bouncing secondary projectiles are not modelled — a stacked shot releases 2 to 5 of them, each exploding on up to 3 bounces
- the charged alternate fire is not modelled — a full 10-stack blob over 2 seconds, for 10 ammo
- unmeasured: how many stacks a shot lays — read as floor(multishot), the count the Grimoire's multishot buys; a roll on the fraction would lay more
- unmeasured: a shot already over the cap (multishot over 10) is read as holding the pile at 10 and waiting 1.5 s, refreshed by every later shot, so steady fire never sets it off
- unmeasured: a shot that crosses the cap is read as setting the pile off at once for 10 stacks, the rest lost
- unmeasured: the explosion's falloff is read as 70%, the page's bug note, over the 30% its table lists
- unmeasured: a pile is read as staying where its body stood when that body dies, going off on whoever stands there

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Stug
- Every published board row, as JSON: https://wfsim.app/board/stug.json
