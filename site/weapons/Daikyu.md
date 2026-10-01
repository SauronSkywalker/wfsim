# Daikyu

Chinese name: 大久和弓

Bow · Primary · Mastery Rank 10. 700 base damage (impact 210, puncture 280, slash 210), 34% crit chance, 2x crit multiplier, 46% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-01

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 1.8789 | Primed Cryo Rounds, Malignant Force, Split Flights, Serration, Galvanized Aptitude, Galvanized Scope, Vile Acceleration, Vital Sense, Primary Compression |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 12.5382 | Primed Cryo Rounds, Malignant Force, Split Flights, Serration, Galvanized Aptitude, Galvanized Scope, Vile Acceleration, Vital Sense, Primary Compression |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.1623 | Primed Cryo Rounds, Malignant Force, Split Flights, Serration, Galvanized Aptitude, Galvanized Scope, Vile Acceleration, Vital Sense, Primary Compression |

## Not modelled here

- 'Fire rate mods apply double their bonuses' is MODELLED (`class: bow`), but this weapon's real cost is the other half of its page: it can only be fired FULLY CHARGED, so a player who releases early gets nothing at all. This sim always charges fully, which is the ceiling and is what a careful player does anyway
- Spring-Loaded Broadhead, Amalgam Daikyu Target Acquired and the bow-exclusive Thunderbolt are outside the pools this roster loads
- ON KILL THE BODY FOLLOWS THE BOLT, damaging anyone in its path and pinning the corpse to walls (wiki). It is a second damage source that only exists once something has died, and this engine has no ragdoll and no wall for it to pin against — so a bolt weapon fighting a crowd is understated by however much that corpse would have hit on the way past
- this weapon is SILENT and this arena has nobody to alert — stealth is worth nothing here and a great deal in a real mission
- the LOWER zoom levels are not modelled — this arena has no field of view to trade for magnification, so the scope always sits at its top level and its best buff

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Daikyu
- Every published board row, as JSON: https://wfsim.app/board/daikyu.json
