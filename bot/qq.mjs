// SPDX-License-Identifier: AGPL-3.0-or-later
// THE QQ BOT SERVER — docs/AGENT.md §"The QQ bot". On the one address QQ's
// whitelist holds: pull what chats sent from the site's door, answer it, reply
// through QQ's API with the message's own id (a passive reply, inside QQ's
// five minutes). Secrets come from the environment file, never from the repo.
//   node bot/qq.mjs            (systemd: deploy/wfsim-bot.service)
import { readFileSync } from "node:fs";
import { loadEngine, SITE } from "./engine.mjs";
import { makeAnswer } from "./answer.mjs";
import { renderCard } from "./render.mjs";

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
function chatPath(row) {
  const d = row.body;
  if (row.kind === "C2C_MESSAGE_CREATE") return `/v2/users/${d.author.user_openid}`;
  if (row.kind === "GROUP_AT_MESSAGE_CREATE") return `/v2/groups/${d.group_openid}`;
  return null;
}

async function qq(path, body) {
  const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json",
    authorization: `QQBot ${await accessToken()}`, "x-union-appid": env.QQ_APP_ID }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/// THE ANSWER, SENT: the long image with its line, or the answer in words when
/// the image cannot be made or taken — a reader is never left with nothing.
async function send(row, ans) {
  const chat = chatPath(row);
  if (!chat) return;
  const reply = { msg_id: row.body.id, msg_seq: 1 };
  if (ans.card) {
    try {
      const png = await renderCard(ans.card);
      const media = await qq(`${chat}/files`, { file_type: 1, file_data: png.toString("base64"), srv_send_msg: false });
      await qq(`${chat}/messages`, { ...reply, msg_type: 7, content: ans.line, media: { file_info: media.file_info } });
      return;
    } catch (e) {
      console.error(`image ${row.id}: ${e && e.message || e}`);
    }
  }
  await qq(`${chat}/messages`, { ...reply, msg_type: 0, content: ans.text });
}

/// A RIVEN APPRAISAL, opened for the message that asked: the chat to answer is
/// kept with it, and only this bot reads that back (worker/appraise.js).
async function openAppraisal(row, ask) {
  const d = row.body;
  const group = row.kind === "GROUP_AT_MESSAGE_CREATE";
  const r = await fetch(`${SITE}/api/appraise/new`, { method: "POST", headers: { "content-type": "application/json",
    authorization: `Bearer ${env.BOT_RELAY_TOKEN}` }, body: JSON.stringify({ ...ask, channel: "qq",
    chat: { kind: row.kind, msg_id: d.id, msg_at: row.at, ...(group ? { group_openid: d.group_openid } : { user_openid: d.author.user_openid }) },
    asker: (d.author && (d.author.member_openid || d.author.user_openid)) || "unknown", room: group ? d.group_openid : "" }) });
  return r.json().catch(() => ({ ok: false, error: String(r.status) }));
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
      await send(row, await answer(row.body.content, { openAppraisal: (ask) => openAppraisal(row, ask) }));
    } catch (e) {
      console.error(`answer ${row.id}: ${e && e.stack || e}`);
    }
    // MARKED EITHER WAY: a message that cannot be answered must not block the rest.
    done.push(row.id);
  }
  if (!rows.length) await new Promise((r) => setTimeout(r, IDLE_MS));
}
