# Kulstar

Chinese name: 杀星

Pistol · Secondary · Mastery Rank 5. 200 base damage (impact 200), 17% crit chance, 2.3x crit multiplier, 19% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-02

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.2061 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.2021 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.001048 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |

## Not modelled here

- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here
- the bomblets take no Condition Overload. The wiki's CO catalog gives them a rule of their own — Kulstar | Cluster Bombs | Projectile | 75 | 200 | 257% | Adding — "CO-bonus uses parent projectile damage value" — and a CO class is a property of the WEAPON in this engine, so they take none at all rather than take it under a class the catalog denies them. The bomblets below are understated by that term and by nothing else

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Kulstar
- Every published board row, as JSON: https://wfsim.app/board/kulstar.json
