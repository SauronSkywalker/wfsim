# Castanas

Chinese name: 雷爆信镖

Pistol · Secondary · Mastery Rank 3. 160 base damage (electricity 160), 8% crit chance, 1.5x crit multiplier, 22% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-02

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.2031 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 0.2031 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.0006817 | Primed Heated Charge, Pistol Pestilence, Frostbite, Galvanized Diffusion, Primed Target Cracker, Galvanized Shot, Lethal Torrent, Magnetic Might, Cascadia Flare |

## Not modelled here

- THE EXPLOSION IS THE WHOLE WEAPON AND ITS RADIUS IS NOT MODELLED. The mine deals no contact damage at all — both of the module's attacks are the same blast resolved at two different moments (mid-flight, or after it has stuck) — so this entry carries that blast as the shot's own damage and no `radial:` beside it. Against ONE target, which is what this arena and the board's rulers fight, the number is exactly right; against a crowd it is a FLOOR, because nothing within the published radius takes anything here
- the mines are DETONATED BY HAND via Alternate Fire and several can be laid before firing them together (wiki). This sim detonates each one the moment it lands, which is the ceiling for a single mine and misses the play pattern the weapon exists for
- mines STICK to surfaces, enemies and allies, and multishot throws them in 'a very wide horizontal spread' (wiki) — so on this weapon multishot covers ground rather than stacking damage on one target, which is the opposite of what it does everywhere else
- this weapon is SILENT and this arena has nobody to alert — stealth is worth nothing here and a great deal in a real mission
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Castanas
- Every published board row, as JSON: https://wfsim.app/board/castanas.json
