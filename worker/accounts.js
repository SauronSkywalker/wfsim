// ---- ACCOUNTS -----------------------------------------------------------------
//
// docs/ACCOUNTS.md. An account is a UUID, and a person reaches it through four
// SLOTS — Google, Discord, GitHub and an email address — at most one of each.
// The UUID lives while a slot is filled: removing the last one deletes it, and
// the schema's trigger holds that whoever deletes (`worker/accounts.sql`).
//
// THE SERVER NEVER MERGES. An identity already on another account is refused,
// never moved; two accounts become one only by their owner emptying one of them.
//
// Nothing here is needed to use WFSim: a reader who never signs in has the site
// exactly as it was. Every endpoint answers 503 while its binding or its
// provider's secrets are absent, and `/api/account` says which are configured,
// so the page offers only the ways in that work.

export const SLOTS = ["google", "discord", "github", "email"];

/// THE THIRD-PARTY WAYS IN. Each asks for the least that names a person: the
/// provider's own id, and the name shown back to them on the account page.
const PROVIDERS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid profile email",
    user: "https://openidconnect.googleapis.com/v1/userinfo",
    who: (u) => ({ subject: String(u.sub), label: u.email || u.name || "Google" }),
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    scope: "identify",
    user: "https://discord.com/api/users/@me",
    who: (u) => ({ subject: String(u.id), label: u.global_name || u.username || "Discord" }),
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "",
    user: "https://api.github.com/user",
    who: (u) => ({ subject: String(u.id), label: u.login || "GitHub" }),
  },
};

const SESSION_COOKIE = "wfsim_session";
const OAUTH_COOKIE = "wfsim_oauth";
const SESSION_SECONDS = 90 * 24 * 3600;
const OAUTH_SECONDS = 600;
const CODE_SECONDS = 600;
const CODE_RESEND_SECONDS = 60;
const CODE_ATTEMPTS = 5;
const EMAIL_FROM = "WFSim <login@wfsim.app>";

const secretOf = (env, p) => ({ id: env[`${p.toUpperCase()}_CLIENT_ID`], secret: env[`${p.toUpperCase()}_CLIENT_SECRET`] });
const configured = (env) => [
  ...Object.keys(PROVIDERS).filter((p) => secretOf(env, p).id && secretOf(env, p).secret),
  ...(env.EMAIL ? ["email"] : []),
].filter(() => env.ACCOUNTS && env.AUTH_SECRET);

// ---- small pieces -------------------------------------------------------------

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key, s) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
}
const now = () => new Date().toISOString();
const later = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const no = (reason, status = 400, extra = {}) => json({ ok: false, reason, ...extra }, status);

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const setCookie = (name, value, seconds, path = "/") =>
  `${name}=${value}; Path=${path}; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;

/// A path on this site to come back to, or `/`: an OAuth round trip carries it,
/// and anything else would make this an open redirect.
const safeReturn = (r) => (typeof r === "string" && /^\/(?!\/)[^\\\s]*$/.test(r) ? r : "/");

/// A STATE-CHANGING CALL COMES FROM THIS SITE, as JSON. The session cookie is
/// SameSite=Lax, and this is the second half: a cross-site form cannot send
/// JSON, and a cross-site fetch carries a foreign Origin.
function sameSite(request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin)
    && (request.headers.get("content-type") || "").startsWith("application/json");
}

async function limited(env, request) {
  if (!env.AUTH_LIMIT) return false;
  const { success } = await env.AUTH_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
  return !success;
}

// ---- sessions -------------------------------------------------------------------

/// The account signed in on this request, or null. The cookie holds a random
/// token; the table holds only its hash, so a copy of the table signs nobody in.
async function sessionAccount(env, request) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || !env.ACCOUNTS) return null;
  const row = await env.ACCOUNTS.prepare(
    "SELECT account FROM sessions WHERE token_hash = ?1 AND expires_at > ?2",
  ).bind(await sha256(token), now()).first();
  return row ? row.account : null;
}

async function newSession(env, account) {
  const token = random();
  await env.ACCOUNTS.prepare("INSERT INTO sessions (token_hash, account, expires_at) VALUES (?1, ?2, ?3)")
    .bind(await sha256(token), account, later(SESSION_SECONDS)).run();
  return setCookie(SESSION_COOKIE, token, SESSION_SECONDS);
}
const endSession = () => setCookie(SESSION_COOKIE, "", 0);

// ---- the one decision: an identity arrives --------------------------------------

/// A VERIFIED IDENTITY, to sign in with or to fill a slot — the same decision
/// whichever of the four ways it came by, so no way in can merge or steal.
///
///   login: its account, or a new account holding it
///   link:  into the signed-in account's slot for its provider — refused if
///          another account holds it, a replacement if the slot is filled
///
/// Returns `{ ok, outcome, account, cookie? }` or `{ ok: false, reason }`.
export async function arrive(env, request, { provider, subject, label }, intent) {
  const db = env.ACCOUNTS;
  const owner = await db.prepare("SELECT account FROM identities WHERE provider = ?1 AND subject = ?2")
    .bind(provider, subject).first();
  const signedIn = await sessionAccount(env, request);

  if (intent === "link") {
    if (!signedIn) return { ok: false, reason: "not_signed_in" };
    if (owner && owner.account !== signedIn) return { ok: false, reason: "taken" };
    if (owner) {
      await db.prepare("UPDATE identities SET label = ?1 WHERE provider = ?2 AND subject = ?3")
        .bind(label, provider, subject).run();
      return { ok: true, outcome: "linked", account: signedIn };
    }
    const slot = await db.prepare("SELECT subject FROM identities WHERE account = ?1 AND provider = ?2")
      .bind(signedIn, provider).first();
    if (slot) {
      // A REPLACEMENT IS AN UPDATE, not a delete and an insert: the slot is
      // never empty, so the last-slot trigger can never fire half way through.
      await db.prepare("UPDATE identities SET subject = ?1, label = ?2, linked_at = ?3 WHERE account = ?4 AND provider = ?5")
        .bind(subject, label, now(), signedIn, provider).run();
      return { ok: true, outcome: "replaced", account: signedIn };
    }
    await db.prepare("INSERT INTO identities (provider, subject, account, label, linked_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(provider, subject, signedIn, label, now()).run();
    return { ok: true, outcome: "linked", account: signedIn };
  }

  if (owner) {
    await db.prepare("UPDATE identities SET label = ?1 WHERE provider = ?2 AND subject = ?3")
      .bind(label, provider, subject).run();
    return { ok: true, outcome: "signed_in", account: owner.account, cookie: await newSession(env, owner.account) };
  }
  // A NEW ACCOUNT ARRIVES WITH ITS FIRST SLOT, in one batch: there is no moment
  // at which a UUID exists with nothing to reach it by.
  const account = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO accounts (id, created_at) VALUES (?1, ?2)").bind(account, now()),
    db.prepare("INSERT INTO identities (provider, subject, account, label, linked_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(provider, subject, account, label, now()),
  ]);
  return { ok: true, outcome: "created", account, cookie: await newSession(env, account) };
}

// ---- OAuth ------------------------------------------------------------------------

async function oauthStart(request, env, provider) {
  const url = new URL(request.url);
  const back = safeReturn(url.searchParams.get("return"));
  const intent = url.searchParams.get("intent") === "link" ? "link" : "login";
  const fail = (reason) => Response.redirect(`${url.origin}${back}${back.includes("?") ? "&" : "?"}auth_error=${reason}`, 302);
  if (!configured(env).includes(provider)) return fail("unavailable");
  const p = PROVIDERS[provider];
  const state = random(16);
  const verifier = random(32);
  const carried = b64url(enc.encode(JSON.stringify({ provider, state, verifier, intent, back })));
  const q = new URLSearchParams({
    client_id: secretOf(env, provider).id,
    redirect_uri: `${url.origin}/api/auth/${provider}/callback`,
    response_type: "code",
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    ...(p.scope ? { scope: p.scope } : {}),
    ...(provider === "google" ? { prompt: "select_account" } : {}),
  });
  return new Response(null, { status: 302, headers: {
    location: `${p.authorize}?${q}`,
    "set-cookie": setCookie(OAUTH_COOKIE, `${carried}.${await hmac(env.AUTH_SECRET, carried)}`, OAUTH_SECONDS, "/api/auth"),
  } });
}

async function oauthCallback(request, env, provider) {
  const url = new URL(request.url);
  const raw = cookies(request)[OAUTH_COOKIE] || "";
  const [carried, sig] = raw.split(".");
  let flow = null;
  if (carried && sig && env.AUTH_SECRET && sig === await hmac(env.AUTH_SECRET, carried)) {
    try { flow = JSON.parse(new TextDecoder().decode(Uint8Array.from(
      atob(carried.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))); } catch (_) { flow = null; }
  }
  const back = flow ? safeReturn(flow.back) : "/";
  const done = (param, cookie) => {
    const h = new Headers({ location: `${url.origin}${back}${back.includes("?") ? "&" : "?"}${param}` });
    h.append("set-cookie", setCookie(OAUTH_COOKIE, "", 0, "/api/auth"));
    if (cookie) h.append("set-cookie", cookie);
    return new Response(null, { status: 302, headers: h });
  };
  if (!flow || flow.provider !== provider || flow.state !== url.searchParams.get("state")) return done("auth_error=state");
  if (url.searchParams.get("error")) return done("auth_error=cancelled");
  const code = url.searchParams.get("code");
  if (!code || !configured(env).includes(provider)) return done("auth_error=unavailable");

  const p = PROVIDERS[provider];
  const { id, secret } = secretOf(env, provider);
  let who;
  try {
    const tok = await fetch(p.token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, client_id: id, client_secret: secret,
        redirect_uri: `${url.origin}/api/auth/${provider}/callback`, code_verifier: flow.verifier,
      }),
    }).then((r) => r.json());
    if (!tok.access_token) return done("auth_error=provider");
    const user = await fetch(p.user, {
      headers: { authorization: `Bearer ${tok.access_token}`, accept: "application/json", "user-agent": "wfsim" },
    }).then((r) => r.json());
    who = p.who(user);
    if (!who.subject || who.subject === "undefined") return done("auth_error=provider");
  } catch (_) {
    return done("auth_error=provider");
  }
  const r = await arrive(env, request, { provider, ...who }, flow.intent);
  return r.ok ? done(`auth=${r.outcome}`, r.cookie) : done(`auth_error=${r.reason}`);
}

// ---- email: the first-party way in --------------------------------------------------

const emailOf = (s) => {
  const e = String(s || "").trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
};

/// A SIX-DIGIT CODE, mailed. A code rather than a link, because it works on the
/// device the reader is on whichever device reads the mail — the desktop app
/// included. The table keeps its HMAC, not the code.
async function emailStart(request, env, b) {
  const email = emailOf(b.email);
  if (!email) return no("bad_email");
  const prior = await env.ACCOUNTS.prepare("SELECT sent_at FROM email_codes WHERE email = ?1").bind(email).first();
  if (prior && Date.parse(prior.sent_at) > Date.now() - CODE_RESEND_SECONDS * 1000) return no("too_soon", 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await env.ACCOUNTS.prepare(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT (email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4`,
  ).bind(email, await hmac(env.AUTH_SECRET, `${email}:${code}`), later(CODE_SECONDS), now()).run();
  try {
    await env.EMAIL.send({
      to: email,
      from: EMAIL_FROM,
      subject: `${code} is your WFSim code`,
      text: `Your WFSim code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this mail.\n\n你的 WFSim 验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略本邮件。\n`,
    });
  } catch (_) {
    return no("send_failed", 502);
  }
  return json({ ok: true });
}

async function emailVerify(request, env, b) {
  const email = emailOf(b.email);
  const code = String(b.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) return no("bad_code");
  const db = env.ACCOUNTS;
  const row = await db.prepare("SELECT code_hash, expires_at, attempts FROM email_codes WHERE email = ?1").bind(email).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return no("expired");
  if (row.attempts >= CODE_ATTEMPTS) return no("too_many_attempts", 429);
  if (row.code_hash !== await hmac(env.AUTH_SECRET, `${email}:${code}`)) {
    await db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?1").bind(email).run();
    return no("wrong_code");
  }
  await db.prepare("DELETE FROM email_codes WHERE email = ?1").bind(email).run();
  const r = await arrive(env, request, { provider: "email", subject: email, label: email }, b.intent === "link" ? "link" : "login");
  return r.ok ? json({ ok: true, outcome: r.outcome }, 200, r.cookie ? { "set-cookie": r.cookie } : {}) : no(r.reason, 409);
}

// ---- the account itself -------------------------------------------------------------

async function accountView(env, account) {
  const a = await env.ACCOUNTS.prepare("SELECT id, created_at FROM accounts WHERE id = ?1").bind(account).first();
  if (!a) return null;
  const { results } = await env.ACCOUNTS.prepare(
    "SELECT provider, label, linked_at FROM identities WHERE account = ?1",
  ).bind(account).all();
  return { id: a.id, created_at: a.created_at,
    identities: SLOTS.map((s) => results.find((r) => r.provider === s)).filter(Boolean) };
}

/// EMPTYING A SLOT. The last one is the account itself, so it is refused
/// unless the caller says it means that — and then the trigger takes the UUID,
/// its sessions and its data with it.
async function unlink(request, env, account, b) {
  if (!SLOTS.includes(b.provider)) return no("bad_provider");
  const { n } = await env.ACCOUNTS.prepare("SELECT COUNT(*) AS n FROM identities WHERE account = ?1").bind(account).first();
  const has = await env.ACCOUNTS.prepare("SELECT 1 FROM identities WHERE account = ?1 AND provider = ?2")
    .bind(account, b.provider).first();
  if (!has) return no("not_linked");
  if (n <= 1 && b.delete_account !== true) return no("last_slot", 409);
  await env.ACCOUNTS.prepare("DELETE FROM identities WHERE account = ?1 AND provider = ?2").bind(account, b.provider).run();
  const gone = n <= 1;
  return json({ ok: true, deleted: gone }, 200, gone ? { "set-cookie": endSession() } : {});
}

// ---- the router -----------------------------------------------------------------------

/// The response for an account path, or null for a path that is not one.
export async function accountRoute(request, env, path) {
  const m = path.match(/^\/api\/auth\/(google|discord|github)\/(start|callback)$/);
  if (m) {
    if (request.method !== "GET") return no("method", 405);
    if (!env.ACCOUNTS || !env.AUTH_SECRET) return no("unavailable", 503);
    return m[2] === "start" ? oauthStart(request, env, m[1]) : oauthCallback(request, env, m[1]);
  }
  if (path === "/api/account") {
    if (request.method !== "GET") return no("method", 405);
    const providers = configured(env);
    if (!providers.length) return json({ ok: true, account: null, providers });
    const account = await sessionAccount(env, request);
    return json({ ok: true, account: account ? await accountView(env, account) : null, providers });
  }
  const post = ["/api/auth/email/start", "/api/auth/email/verify", "/api/auth/logout",
    "/api/account/unlink", "/api/account/delete", "/api/account/export"];
  if (!post.includes(path)) return null;
  if (request.method !== "POST") return no("method", 405);
  if (!sameSite(request)) return no("cross_site", 403);
  if (!env.ACCOUNTS || !env.AUTH_SECRET) return no("unavailable", 503);
  let b = {};
  try { b = JSON.parse((await request.text()) || "{}"); } catch (_) { return no("not_json"); }

  if (path === "/api/auth/email/start" || path === "/api/auth/email/verify") {
    if (!env.EMAIL) return no("unavailable", 503);
    if (await limited(env, request)) return no("rate_limited", 429);
    return path.endsWith("/start") ? emailStart(request, env, b) : emailVerify(request, env, b);
  }
  if (path === "/api/auth/logout") {
    const token = cookies(request)[SESSION_COOKIE];
    if (token) await env.ACCOUNTS.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": endSession() });
  }
  const account = await sessionAccount(env, request);
  if (!account) return no("not_signed_in", 401);
  if (path === "/api/account/unlink") return unlink(request, env, account, b);
  if (path === "/api/account/delete") {
    await env.ACCOUNTS.prepare("DELETE FROM accounts WHERE id = ?1").bind(account).run();
    return json({ ok: true, deleted: true }, 200, { "set-cookie": endSession() });
  }
  // EVERYTHING HELD ABOUT THIS ACCOUNT, as it is held — docs/ACCOUNTS.md.
  return json({ ok: true, account: await accountView(env, account), exported_at: now() }, 200,
    { "content-disposition": 'attachment; filename="wfsim-account.json"' });
}
