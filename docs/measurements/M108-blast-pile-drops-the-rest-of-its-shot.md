# M108 — the shot that fills a Blast pile keeps nothing past ten ✅ (owner, 2026-09-29)

*Protocol and setup: [MEASUREMENTS.md](../MEASUREMENTS.md). Cross-references `M<n>` are files in this folder.*

**Question.** A shot lands more Blast procs than the pile has room for — 8 on
a pile of 8, say. The pile detonates at ten. Do the other procs start the
next pile, or are they lost?

**Setup.** Boar Prime, Valence Formation at +200% Blast, against a Corrupted
Heavy Gunner with its armour fully stripped, every shot to the body, a second
unit standing inside 5 m to read the detonation off.

### The report, in translation

```
body 197/493
dot 19/48

8 procs a shot. Second shot: everything detonates, and no Blast is left
over (all gone) — so there is waste.

With 120 multishot: still only ever one detonation, nothing left over.

The unit beside it takes
2496  2208  3649  3072  2784  …
```

### What it settles

**The rest of the shot is lost.** At 8 procs a shot, the second shot takes
the pile from 8 to 10 and the remaining six add nothing: no stack is left to
burn down afterwards. At 120% multishot a shot carries around 17 pellets, and
it still detonates ONCE and leaves nothing — so the loss is not a matter of the
second shot's timing, it is the pile refusing the rest of the shot that filled
it.

The engine had those procs start the next pile (8, 16, 24 stacks paid over
three shots). It now pays 8, 10, 18 — the third shot is a new shot and starts a
pile of its own. `the_shot_that_fills_a_blast_pile_keeps_no_stack_past_ten`
asserts it, and fails on the old rule.

### The neighbour's numbers are every one a ten-stack pile

A stack's single-target number is 19 on a non-critical pellet and 48 on a
critical one, a crit multiplier of 2.5. Its AoE is ten times that, **192** a
stack (M54), so a pile with `k` critical stacks reaches the neighbour for

```
1920 + 288 k        288 = 192 × (2.5 − 1)

k = 1  2208    k = 2  2496    k = 3  2784    k = 4  3072    k = 6  3648 ≈ 3649
```

Five readings, five integers. Each is exactly ten stacks, and each stack keeps
the crit of the pellet that applied it. With or without multishot the readings
fall in the same range — no detonation ever carried more than ten.

### The lost proc is still a proc

A secondary shotgun with 16 pellets, pure Blast, every pellet proccing, and
Cascadia Empowered at rank 5, in translation:

```
All 16 show the Blast icon beside them — all 16 procced — and there are
16 750s. On the body itself the Blast only popped 10 times.
```

So one shot of 16 pays 10 stacks, and the six past the pile are procs in every
other sense: they show the icon and each fires Cascadia's flat 750. The engine
drops the stack and nothing else, and
`a_blast_proc_past_the_pile_still_fires_cascadia_empowered` asserts both halves.

### Still open

Whether "the same shot" is the pull or the instant: every pellet here lands on
the same frame. A projectile shotgun whose pellets arrive at different times
is not read, and the engine keys the loss to the pull AND the instant, so
staggered pellets still start a new pile. No number moves either way while
every pellet of a pull lands at the pull's instant, which is the engine today.

The lead is wiki `Secondary_Encumber`, a different mechanic with the same
shape: *"a max of 1 additional status effect per instant of time"*, where
*"Delayed hits such as projectile rebounds (Cyanex), embed delays (Kompressa),
and travel time punch-through (Catchmoon (Primary)) can proc Encumber multiple
times per shot because their hits do not always occur at the same time."* Those
three are the weapons that would read it: fill the pile on one of their early
hits and see whether a later hit of the same pull starts a new one.
