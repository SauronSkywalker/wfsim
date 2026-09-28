---
name: wfsim-weapon-builds
description: Look up a Warframe weapon's stats and its best measured riven-free builds on WFSim, and give the reader a link that opens the build in the calculator.
---

# WFSim weapon builds

WFSim is a Warframe weapon calculator. It builds a loadout, simulates the fight against a named enemy, and searches for the best mods. Every formula cites its source, and every golden test is calibrated against a real in-game run. A board score belongs to its ruler, the named benchmark fight: compare scores only under one ruler, quote the ruler with the number, and give the reader the row's link, which opens the build in the calculator. It runs in the browser, free, and its source is open (AGPL-3.0).

## Call it over MCP

https://mcp.wfsim.app/mcp (Streamable HTTP, no sign-in) offers these tools, all read-only:

- `builder_weapons_find`: Find weapons by name, in any language WFSim speaks.
- `builder_board_read`: Read a weapon's leaderboard: the measured best builds per ruler (the benchmark fight), mode, and with or without a riven, ranked. Each row carries the link that opens it, and a riven-free row its `build`, which the stats read takes.
- `builder_stats_read`: Read the stats panel for a build: every stat per form and part, base and final, with the mod each change came from, and what the weapon's model does not cover.

## Look up a weapon

1. Find it in the roster, https://wfsim.app/weapons.md. A weapon's address is the Warframe
   wiki's page name: https://wfsim.app/weapons/<Wiki_Name>, for example https://wfsim.app/weapons/Soma_Prime.
2. Read it as markdown: request that address with `Accept: text/markdown`, or
   append `.md`. It states the base stats, the board's best riven-free build
   under each ruler, and what the weapon's number does not account for.
3. Give the reader the address without `.md`. It opens the weapon in the
   calculator, where they can change the build and run the fight themselves.

## Read the board as JSON

- https://wfsim.app/board/<weapon_id>.json holds every published row for one weapon. A row
  names its ruler (`benchmark`), its `score` and the rounded `shown`, its `mode`,
  and the build as WFSim ids: `mods`, `exilus`, `arcanes`, `evolutions`.
- https://wfsim.app/board/index.json holds rows for every weapon, keyed by weapon id.

## Quoting a number

- A score belongs to its ruler. Compare scores only under the same ruler, and
  quote the ruler's name with the number.
- Quote the "as of" date the page states; the board is rescored as builds arrive.
