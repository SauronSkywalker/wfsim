# Zhuge Prime

Chinese name: 诸葛连弩 Prime

Crossbow · Primary · Mastery Rank 14. 50 base damage (impact 10, puncture 22.5, slash 17.5), 26% crit chance, 2x crit multiplier, 30% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-03

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 1.5601 | Hellfire, Primary Acuity, Serration, Galvanized Aptitude, Galvanized Scope, Bladed Rounds, Rifle Elementalist, Vital Sense, Primary Compression |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 1.5601 | Hellfire, Primary Acuity, Serration, Galvanized Aptitude, Galvanized Scope, Bladed Rounds, Rifle Elementalist, Vital Sense, Primary Compression |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.2764 | Hellfire, Primary Acuity, Serration, Galvanized Aptitude, Galvanized Scope, Bladed Rounds, Rifle Elementalist, Vital Sense, Primary Compression |

## Not modelled here

- it 'reloads 50% faster from a fully depleted magazine' (wiki), and this engine carries ONE reload time per weapon. This sim holds the trigger until the magazine is dry, which is exactly the case that reload applies to — so the 3 s here is the SLOW reload for a fight that would always earn the fast one, and the weapon is understated
- the explosion arrives 0.6 SECONDS after the bolt lands, which the page says lets an enemy walk out of it — this engine resolves the blast at the point of impact immediately, so nothing ever escapes one here
- ON KILL THE BODY FOLLOWS THE BOLT, damaging anyone in its path and pinning the corpse to walls (wiki). It is a second damage source that only exists once something has died, and this engine has no ragdoll and no wall for it to pin against — so a bolt weapon fighting a crowd is understated by however much that corpse would have hit on the way past
- the blast needs no line of sight and goes through walls — this arena has no geometry, so nothing is ever behind cover and the perk pays nothing extra
- the blast staggers the WIELDER in game — this arena gives the player no body, so a build that would be unplayable in a corridor costs nothing here

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Zhuge_Prime
- Every published board row, as JSON: https://wfsim.app/board/zhuge_prime.json
