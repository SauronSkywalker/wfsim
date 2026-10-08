# A form is shown under the game's own name

**The rule.** A form entry is displayed under the name the weapon's own page
gives that attack block — "Normal Shot", "Uncharged Shot", "Quick Shot". It is
written per entry as `form_name:`, and `FormKind::label()` is only the fallback.

**Why the fallback is not good enough.** `FormKind::Base.label()` is
`"Base Form"`, which is OUR word: nothing in the game is called that. It reads
as a heading on a weapon with one form and as a wrong name on a weapon with
two, where it is the label telling two modes apart in the builder, in the
optimizer's mode axis and on every board row.

**Where a name comes from.** The weapon's page. The wiki module's
`Attacks[].AttackName`, matched to an entry by damage + crit + status + charge,
is only a candidate until that page is opened. Never fill names by a bulk sweep
against DE's export: DE reuses one name across two attacks where the page does
not, and two modes sharing a label is the bug `check_mode_def` exists to catch.
