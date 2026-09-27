# M106 — Does an "Assault Rifle" mod go on a launcher?

*Protocol and setup: [MEASUREMENTS.md](../MEASUREMENTS.md). Cross-references `M<n>` are files in this folder.*

**Question.** DE tags some rifle mods "Assault Rifle" rather than "Rifle". Which
rifle-class weapons draw them — and in particular, does a launcher?

| source | says |
|---|---|
| DE's Public Export | Tainted Mag `compatName: "Assault Rifle"` — the same tag as Rifle Ammo Mutation, Tactical Reload and Spring-Loaded Chamber; Magazine Warp is `"Rifle"` |
| wiki `Tainted_Mag` | "an Assault Rifle-exclusive mod. It does not work with Bows/Crossbows or Sniper Rifles" — launchers are not named |
| wiki `Rifle` | "Some mods are restricted to "Assault Rifle" which means they can only be equipped on "true" rifles. For example, Rifle Ammo Mutation can be equipped on the Braton but not on an Ogris, a launcher." |

**Measured (owner, in game, 2026-09-27).** Tainted Mag equips on the Kuva
Ogris. The "Assault Rifle" class includes launchers.

**Implemented.** Every `class: launcher` weapon draws `assault_rifle` beside
`primary` and `rifle`. Bows and sniper rifles still do not: the Tainted Mag page
names both, and nothing contradicts it.

**Open.** The wiki's `Rifle` page names exactly one pair as refused — Rifle
Ammo Mutation on an Ogris — and the class rule now lets it equip. The page may
be describing a second gate (the Zarr and Purgator carry DE's `ASSAULT_AMMO`
compatibility tag, the Ogris does not) or may simply be stale. It costs no
number: the sim models no ammo pickups, so the card has nothing to convert.

**How to settle it.** Try to seat Rifle Ammo Mutation (or its Primed version)
on an Ogris or Kuva Ogris. Refused ⇒ the ammo mutations need `ASSAULT_AMMO` and
come out of the launchers' pool; accepted ⇒ this entry is closed.
