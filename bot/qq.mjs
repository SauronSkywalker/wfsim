// SPDX-License-Identifier: AGPL-3.0-or-later
// THE QQ BOT SERVER — docs/AGENT.md §"The QQ bot". On the one address QQ's
// whitelist holds: pull what chats sent from the site's door, answer it, reply
// through QQ's API with the message's own id (a passive reply, inside QQ's
// five minutes). Secrets come from the environment file, never from the repo.
//   node bot/qq.mjs            (systemd: deploy/wfsim-bot.service)
import { readFileSync } from "node:fs";
import { loadEngine, SITE } from "./engine.mjs";
import { makeAnswer } from "./answer.mjs";

const ENV_FILE = process.env.BOT_ENV || "/etc/wfsim-bot.env";
const env = Object.fromEntries(readFileSync(ENV_FILE, "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const API = env.QQ_API || "https://api.sgroup.qq.com";
const IDLE_MS = 1000;

let token = null;
async function accessToken() {
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch("https://bots.qq.com/app/getAppAccessToken", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ appId: env.QQ_APP_ID, clientSecret: env.QQ_APP_SECRET }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j).slice(0, 200)}`);
  // RENEWED A MINUTE EARLY, so a reply never carries one that just expired.
  token = { value: j.access_token, until: Date.now() + (Number(j.expires_in) - 60) * 1000 };
  return token.value;
}

/// THE REPLY'S ADDRESS: a private chat answers its user, a group its group.
function replyPath(row) {
  const d = row.body;
  if (row.kind === "C2C_MESSAGE_CREATE") return `/v2/users/${d.author.user_openid}/messages`;
  if (row.kind === "GROUP_AT_MESSAGE_CREATE") return `/v2/groups/${d.group_openid}/messages`;
  return null;
}

async function send(row, content) {
  const path = replyPath(row);
  if (!path) return;
  const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json",
    authorization: `QQBot ${await accessToken()}`, "x-union-appid": env.QQ_APP_ID },
    body: JSON.stringify({ content, msg_type: 0, msg_id: row.body.id, msg_seq: 1 }) });
  if (!r.ok) console.error(`reply ${row.id}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function claim(done) {
  const r = await fetch(`${SITE}/api/qq/claim`, { method: "POST", headers: { "content-type": "application/json",
    authorization: `Bearer ${env.BOT_RELAY_TOKEN}` }, body: JSON.stringify({ done }) });
  if (!r.ok) throw new Error(`claim: ${r.status}`);
  return (await r.json()).rows;
}

const answer = makeAnswer(await loadEngine());
console.log("wfsim-bot: up");
let done = [];
for (;;) {
  let rows = [];
  try {
    rows = await claim(done);
    done = [];
  } catch (e) {
    console.error(String(e));
  }
  for (const row of rows) {
    try {
      await send(row, await answer(row.body.content));
    } catch (e) {
      console.error(`answer ${row.id}: ${e && e.stack || e}`);
    }
    // MARKED EITHER WAY: a message that cannot be answered must not block the rest.
    done.push(row.id);
  }
  if (!rows.length) await new Promise((r) => setTimeout(r, IDLE_MS));
}
