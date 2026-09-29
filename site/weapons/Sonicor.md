# Sonicor

Chinese name: 超音波冲击枪

Pistol · Secondary · Mastery Rank 2. 150 base damage (impact 150), 0% crit chance, 1x crit multiplier, 0% status chance.

## Best riven-free build on the WFSim board, as of 2026-09-29

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.03196 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.03280 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.0002888 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |

## Not modelled here

- the projectile explodes 'on impact OR travelling 15 metres' (wiki), so past 15 m it goes off in mid-air and the direct hit never lands. This entry carries the 15 m as a reach, which stops the direct hit correctly and stops the EXPLOSION with it — so a shot fired past 15 m is worth nothing here where in game it would still blast whatever it went off beside
- 'Projectiles guarantee knockback against enemies; most are ragdolled and launched' (wiki), and the module gives the impact a forced Ragdoll proc. A ragdoll is not a damage type and this engine's proc list holds only damage types, so it is not applied — which is the whole reason a player carries this weapon
- 'Projectiles reflect off of solid objects and surfaces' (wiki) — this arena has no walls to bounce off
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Sonicor
- Every published board row, as JSON: https://wfsim.app/board/sonicor.json
