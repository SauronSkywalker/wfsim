# M110 — a Tenet Exec shockwave is 3 m wide (owner, 2026-10-05) ⚠ OPEN

*Protocol and setup: [MEASUREMENTS.md](../MEASUREMENTS.md). Cross-references `M<n>` are files in this folder.*

**THE READING**, the owner's, translated from Chinese:

> The shockwave is 3 m wide.

**WHAT THE WIKI STATES** (Tenet Exec page, verbatim):

- "Slam attacks send out a series of **3** shockwaves in a straight line. Heavy
  slam attacks send out **3** sets of **3** shockwaves in a spread."
- "Shockwaves travel in a line and trigger every **5** meters."
- "Maximum shockwave travel distance is **not** affected by Range mods such as
  Reach."
- "Each heavy blade stance will trigger a shockwave on the last hit of the
  forward block combo. Tempo Royale can also trigger a shockwave with the
  single hit block combo."
- "Shockwave damage is affected by all melee mods and buffs that affect slams."
- "Shockwaves have the same radial damage fall-off as the slam that triggered
  them; 70% falloff for normal slam attack shockwaves, and 50% for heavy slam
  attack shockwaves."

`Module:Stances/data` gives the weapon its own two combos, marked unofficial:
`Slam = { Dmg = { 200 }, Hits = { 3 } }` and
`Heavy Slam = { Dmg = { 300 }, Hits = { 9 } }`, each `Duration = 2.5` — one
blast per shockwave, each the slam's own 2x or 3x.

**WHAT THE ENGINE DOES WITH IT** (`model::Shockwave`, docs/MELEE.md
§"Shockwaves"): each blast is the slam that sent it again — damage, crit,
status, combo multiplier and falloff — in a sphere 3 m across, 5 / 10 / 15 m
down the facing, one line for a combo's closing slam and three for a heavy
slam. The aimed body at contact is out of every blast's reach, so the
single-target rulers do not move and the crowd does.

**STILL OPEN — each is an assumption the entries declare:**

1. The fan between a heavy slam's three lines (60 degrees edge to edge here).
2. Whether the blasts go off together with the slam (here) or in sequence as
   the wave travels.
3. The falloff: the module's (50% slam, 30% heavy) against the page's note,
   which states the two the other way round.
4. Whether a slam-radius bonus widens a blast (here it does not).
