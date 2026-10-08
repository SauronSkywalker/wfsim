# M111 — Neurotoxin joins Frenzy's Toxin, and a Dual Toxocyst ricochet finds a head 20% of the time ✅ (owner, 2026-10-09)

*Protocol and setup: [MEASUREMENTS.md](../MEASUREMENTS.md). Cross-references `M<n>` are files in this folder.*

## 1. Neurotoxin

The wiki's Genesis page carried *"Currently does not work"* until Hotfix 44.0.2
(2026-09-28): *"Fixed Neurotoxin not adding Toxin damage."*

**THE READING.** No mods, Fevered Frenzy in tier 2. Frenzy and Neurotoxin both
up, a body shot, no crit: **336**.

**WHAT FITS IT.** A 125 panel (Fevered Frenzy's +50 on the 75), Toxin at
`125 x (1.0 + 0.7)`, quantized against ModifiedBase / 32 (M57):

| part | raw | units of 3.90625 | quantized |
|---|---|---|---|
| Impact | 25 | 6.4 | 23.44 |
| Puncture | 62.5 | 16 | 62.50 |
| Slash | 37.5 | 9.6 | 39.06 |
| Toxin | 212.5 | 54.4 | 210.94 |
| **total** | | | **335.94** |

The Incarnon form's split is shown; the base form's quantizes to the same
335.94. Frenzy alone reads 250, so the perk adds 70% of ModifiedBase as Toxin.

**THE SECOND READING** separates "joins the injection" from "multiplies the
Toxin". Pathogen Rounds (+90% Toxin) added, everything else as above: **449**.

    adds:        125 + quantize(125 x (0.9 + 1.0 + 0.7) = 325 -> 83 units) = 125 + 324.22 = 449.22
    multiplies:  125 + 125 x (0.9 + 1.0) x 1.7 = 529

It ADDS: one Toxin bracket with the mod and Frenzy's 100%.

## 2. Ricochet headshots

**THE READINGS.** 100 Incarnon shots, each ricocheting to a body beside the
aimed one. These are the shot numbers on which the RICOCHET landed on a head:

    aimed shot on the head:  3 13 15 17 25 28 31 32 39 50 53 55 57 60 63 68 78 83 84 85 100   (21)
    aimed shot on the body:  2 3 6 9 13 14 22 32 39 65 79 80 81 92 95 100                  (16)

**WHAT IT MEANS.** 37 of 200, 18.5% (95% interval about 13–24%). The two halves
do not differ (z ≈ 0.9), so where the aimed shot landed does not decide where
the bounce lands. The entry takes **0.2**, the owner's rounding.
