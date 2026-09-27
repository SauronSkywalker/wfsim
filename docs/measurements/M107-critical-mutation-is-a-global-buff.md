# M107 — Critical Mutation is a global buff, and the grenade only decides whether it lasts

*Protocol and setup: [MEASUREMENTS.md](../MEASUREMENTS.md). Cross-references `M<n>` are files in this folder.*

**Question.** The Catabolyst family's augment reads *"Each kill increases
Critical Chance and Critical Damage by 30% up to 300%. Reduce by 30% when fewer
than 3 enemies are struck by the grenade explosion."* Does the bonus pay the
whole weapon or only the reload grenade?

| source | says |
|---|---|
| the card, wiki `Critical_Mutation` body | the bonus is on kills; the grenade appears only in the reduction clause; *"additive with mods such as Pistol Gambit"* and *"Target Cracker"* |
| DE's U35 notes | the augment *"which applied buffs to its grenade"* — the reading the engine had implemented |
| DE's U35.0.4 notes | *"incorrectly applying its Critical Chance and Critical Damage buffs, leading to significantly higher than intended damage output"* — says nothing about where |

**Measured (owner, in game, 2026-09-27).**

- The bonus is on the BEAM: a global buff on the weapon, not the grenade's.
- A throw that strikes fewer than three enemies takes 30% — one step.
- Kills made fast enough keep the pile high against a single target.
- A kill by a grenade pays in like any other.
- The grenade throw keeps pace with the reload: a faster reload throws sooner.
- The grenade takes the weapon's mods.

**Implemented.** The pile is fed by every kill as it happens — the beam's and
the grenade's — and every crit bucket the weapon rolls reads it: the direct
shot's crit chance and crit damage, and every timed part's, the reload grenade
included. A throw charges it one step when its explosions strike fewer than
three enemies. The last three points were already the engine's: the throw lands
at a share of the reload's own time, which reload speed scales, and the grenade
resolves through the beam's buckets.

**Still open** (the queue in MEASUREMENTS.md): where in the reload the grenade
lands, the Coda's fan (three grenades at a small angle — read as 45° edge to
edge off the wiki, not measured), and whether the Coda's step is charged per
throw or per grenade.
