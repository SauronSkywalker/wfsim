// SPDX-License-Identifier: AGPL-3.0-or-later
// THE WORLD STATE'S RELAY — docs/UI.md §"Utility". DE's host refuses the site's
// worker, so this server reads DE's file each minute and hands it to the worker
// as read (`PUT /api/world`); naming and keeping it is the worker's
// (`worker/world.js`). A failed minute is logged and the next one tries again.
import { SITE } from "./engine.mjs";

const WORLD_STATE = "https://api.warframe.com/cdn/worldState.php";
/// DE's own `Cache-Control: max-age=50`; reading it more often reads the same file.
const EVERY_MS = 60_000;

async function relayOnce(token) {
  const r = await fetch(WORLD_STATE, { headers: { "user-agent": "wfsim-bot (+https://wfsim.app)" } });
  if (!r.ok) throw new Error(`world state ${r.status}`);
  const body = await r.text();
  const put = await fetch(`${SITE}/api/world`, { method: "PUT", body,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  if (!put.ok) throw new Error(`world relay: ${put.status} ${(await put.text()).slice(0, 200)}`);
}

export function relayWorld(token) {
  (async () => {
    for (;;) {
      try { await relayOnce(token); } catch (e) { console.error(String(e && e.message || e)); }
      await new Promise((r) => setTimeout(r, EVERY_MS));
    }
  })();
}
