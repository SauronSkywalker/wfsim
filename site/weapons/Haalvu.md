# Haalvu

Chinese name: 哈尔武

Rifle · Primary · Mastery Rank 14. 33 base damage (tau 33), 25% crit chance, 2.5x crit multiplier, 19% status chance.

## Best riven-free build on the WFSim board, as of 2026-10-01

A score belongs to its ruler: compare it only with scores under the same ruler.

| Ruler | Fight | Mode | Score | Build |
| --- | --- | --- | ---: | --- |
| Standard Single Target | Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 6.6477 | Hellfire, Heavy Caliber, Primary Acuity, Serration, Rifle Elementalist, Vile Acceleration, Vital Sense, Magnetic Capacity, Vigilante Supplies, Primary Crux |
| Standard Multi Target | 5x5 at 3 m · Thrax Centurion Lv 9999 SP · 180 s · KPM | base | 11.8873 | Hellfire, Thermite Rounds, Heavy Caliber, Primary Acuity, Rifle Elementalist, Vile Acceleration, Vital Sense, Magnetic Capacity, Vigilante Supplies, Primary Crux |
| Demolisher | one target · Demolisher Devourer Lv 9999 SP · 4-player health · 180 s · KPM | base | 0.7176 | Hellfire, Thermite Rounds, Heavy Caliber, Primary Acuity, Rifle Elementalist, Vile Acceleration, Vital Sense, Magnetic Capacity, Vigilante Supplies, Primary Crux |

## Not modelled here

- TAU DAMAGE's status effect is not modelled. Tau is neutral to every health type, which this engine applies correctly — but its proc is STATUS CHANCE VULNERABILITY, raising the status chance the target receives from every other source by 10% a stack to ten stacks (wiki), and there is no debuff for it here. On a build stacking other statuses this weapon is understated
- switching firing modes takes THREE SECONDS, can be interrupted, and is scaled by Reload Speed (wiki) — this sim never switches, so each mode is measured as if it were the whole weapon and the cost of changing between them is invisible

## In WFSim

- Build, simulate and optimize it: https://wfsim.app/weapons/Haalvu
- Every published board row, as JSON: https://wfsim.app/board/haalvu.json
