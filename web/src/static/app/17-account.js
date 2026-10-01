// ---- ACCOUNTS ON THE PAGE -----------------------------------------------------------
//
// docs/ACCOUNTS.md. An account is optional and changes nothing a reader without
// one can do. Nothing here draws unless `/api/account` names a way in — the
// site with its secrets set — so the dev server and the desktop shell show no
// account control at all.
//
// THE SHAPE A SERIOUS PRODUCT HAS (docs/ACCOUNTS.md §"On the page"): one entry
// in the top bar — "Sign in", or an avatar with a short menu — and pages of
// their own for everything else: /login, /signup, /reset, /account. Mail goes
// out only to prove an address; signing in with a password sends nothing.

const ACCOUNT_SLOTS = [
  { id: "google", name: "Google" },
  { id: "discord", name: "Discord" },
  { id: "github", name: "GitHub" },
  { id: "email", name: "Email" },
];
const AUTH_PATHS = { "/login": "login", "/signup": "signup", "/reset": "reset", "/account": "account",
  "/account/billing": "billing", "/pricing": "pricing" };
const authKindOf = (path) => AUTH_PATHS[path.replace(/\/$/, "")] || null;
/// The pages of a signed-in account; every other kind is a way in.
const isSettings = (kind) => kind === "account" || kind === "billing";

/// WHAT THE SERVER SAID, in the reader's words — an outcome or a refusal.
const ACCOUNT_SAYS = {
  created: "Account created.",
  signed_in: "Signed in.",
  linked: "Connected.",
  replaced: "Replaced.",
  password_reset: "Password reset. You are signed in, and signed out everywhere else.",
  password_changed: "Password changed. Other devices are signed out.",
  taken: "That sign-in already belongs to another WFSim account. Sign in with it and disconnect it there first.",
  email_taken: "That email already has an account. Sign in, or reset its password.",
  not_signed_in: "Sign in first.",
  state: "The sign-in expired. Try again.",
  cancelled: "Sign-in was cancelled.",
  provider: "The provider did not answer. Try again.",
  unavailable: "This way to sign in is not set up yet.",
  bad_email: "That is not an email address.",
  bad_password: "A password needs at least 8 characters.",
  wrong_credentials: "The email or the password is not right.",
  wrong_password: "The current password is not right.",
  locked: "Too many wrong passwords. Wait 15 minutes, or reset the password.",
  too_soon: "A code was just sent. Wait a minute before asking again.",
  send_failed: "The mail could not be sent. Try again later.",
  rate_limited: "Too many tries. Wait a minute.",
  bad_code: "The code is six digits.",
  expired: "That code has expired. Ask for a new one.",
  wrong_code: "That code is not right.",
  too_many_attempts: "Too many wrong codes. Ask for a new one.",
  last_slot: "This is your last way to sign in. Disconnecting it deletes the account — do that below if you mean to.",
  billing_open: "A subscription could not be ended, so the account was kept. Try again in a moment.",
  already_subscribed: "This account already holds that subscription.",
  not_on_sale: "That is not on sale right now.",
  no_customer: "This account has not bought anything yet.",
  stripe: "Stripe did not answer. Try again in a moment.",
  bad_username: "A username is 3 to 20 letters, digits or underscores.",
  username_reserved: "That username is reserved.",
  username_taken: "That username is taken.",
  rename_too_soon: "A username can change once a day.",
  bad_display_name: "A display name is at most 32 characters.",
};
const accountSaid = (key) => tr(ACCOUNT_SAYS[key] || key);

// The brands' own marks, drawn inline so nothing is fetched from their hosts.
const ACCOUNT_ICONS = {
  google: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.2-.3 13.8.1 18.3a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.9zM8 15.5c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.5-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.4-2.2 2.4z"/></svg>`,
  github: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>`,
};

/// WHERE A TWO-STEP PAGE IS: its step, the address a code went to and when,
/// and the error to show in the card. One at a time; leaving a page resets it.
let authFlow = { kind: null, step: 1, email: "", sentAt: 0, error: null, open: null };
let authTimer = null;

let accountState = { providers: [], account: null, loaded: false };
/// BILLING, as `/api/billing` last said it (docs/ACCOUNTS.md §"Paid features"): off until the
/// server says Stripe is configured, and drawn only on /account.
let billingState = { configured: false, names: { offers: {}, meters: {} }, prices: [], features: [], meters: {}, held: [],
  subscription: null, invoices: [] };
/// The period the offer card shows before a reader subscribes.
let billingPeriod = "month";
let accountLoading = null;
/// THE AGENTS ACTING FOR THIS ACCOUNT, as `/api/account/agents` last said.
let agentsState = [];

async function accountCall(method, path, body) {
  try {
    const r = await fetch(path, {
      method, credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return await r.json();
  } catch (_) {
    return null;
  }
}

function loadAccount() {
  accountLoading = (async () => {
    const r = await accountCall("GET", "/api/account");
    accountState = r && r.ok
      ? { providers: r.providers || [], account: r.account, loaded: true }
      : { providers: [], account: null, loaded: true };
    if (accountState.account && isSettings(authKindOf(location.pathname))) await Promise.all([loadBilling(), loadAgents()]);
    if (authKindOf(location.pathname) === "pricing") await loadBilling();
    renderAccountEntry();
    const kind = authKindOf(location.pathname);
    if (kind) renderAuthPage(kind);
    if (accountState.account) syncSoon(0);
  })();
  return accountLoading;
}

async function loadAgents() {
  const r = await accountCall("GET", "/api/account/agents");
  agentsState = (r && r.ok && r.agents) || [];
}

async function loadBilling() {
  const b = await accountCall("GET", "/api/billing");
  if (!(b && b.ok && b.configured)) { billingState = { ...billingState, configured: false }; return; }
  const inv = accountState.account ? await accountCall("GET", "/api/billing/invoices") : null;
  billingState = { configured: true, names: b.names || { offers: {}, meters: {} }, prices: b.prices || [], features: b.features || [],
    free: b.free || {},
    meters: b.meters || {}, held: b.held || [], subscription: b.subscription || null,
    invoices: (inv && inv.ok && inv.invoices) || [] };
}

/// A path on this site to go back to after signing in, or `/` — never another
/// sign-in page, which would send a signed-in reader round in a circle.
function authReturn() {
  const r = new URLSearchParams(location.search).get("return");
  const kind = r && authKindOf(r.split("?")[0]);
  return r && /^\/(?!\/)/.test(r) && (!kind || isSettings(kind)) ? r : "/";
}
const authStart = (p, intent, back) =>
  `/api/auth/${p}/start?intent=${intent}&return=${encodeURIComponent(back)}`;
/// WHAT THE SITE CALLS AN ACCOUNT: its display name, or its username.
const accountName = (a) => (a && (a.display_name || a.username)) || "WFSim";
const accountInitial = (a) => (accountName(a).replace(/[^\p{L}\p{N}]/gu, "")[0] || "W").toUpperCase();
const aT = (s) => escHtml(tr(s));

// ---- the top bar: one entry --------------------------------------------------------------

function renderAccountEntry() {
  const box = $("account");
  if (!box) return;
  const { providers, account } = accountState;
  box.hidden = !providers.length && !account;
  if (box.hidden) return;
  const here = location.pathname + location.search;
  box.innerHTML = account
    ? `<button class="avatar" id="account-toggle" aria-haspopup="menu" aria-expanded="false" title="${aT("Account")}">${escHtml(accountInitial(account))}</button>
      <div class="acct-menu" id="acct-menu" role="menu" hidden>
        <div class="who"><span class="avatar">${escHtml(accountInitial(account))}</span><div><b>${escHtml(accountName(account))}</b>
          <span>@${escHtml(account.username || "")}</span></div></div>
        <a href="/account" role="menuitem">${aT("Account settings")}</a>
        <a class="off" role="menuitem" aria-disabled="true">${aT("My builds")} <small>${aT("Coming soon")}</small></a>
        <hr><a href="#" role="menuitem" data-acct="logout">${aT("Sign out")}</a>
      </div>`
    : `<a class="signin-btn" href="/login?return=${encodeURIComponent(authKindOf(location.pathname) ? "/" : here)}">${aT("Sign in")}</a>`;
}

(function () {
  const box = $("account");
  if (!box) return;
  const menu = (open) => {
    const m = $("acct-menu"), b = $("account-toggle");
    if (!m || !b) return;
    m.hidden = !open;
    b.setAttribute("aria-expanded", open ? "true" : "false");
  };
  box.addEventListener("click", async (e) => {
    if (e.target.closest("#account-toggle")) { e.stopPropagation(); menu($("acct-menu").hidden); return; }
    if (e.target.closest("[data-acct=logout]")) {
      e.preventDefault();
      menu(false);
      // Off the settings page first: redrawn signed out, it would send the
      // reader to sign in again.
      const leave = authKindOf(location.pathname) === "account";
      await accountCall("POST", "/api/auth/logout", {});
      presetToast(tr("Signed out."));
      accountState = { ...accountState, account: null };
      if (leave) nav("/");
      await loadAccount();
      return;
    }
    if (e.target.closest(".acct-menu a[href]")) menu(false);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#account")) menu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu(false); });
  // AN OAUTH ROUND TRIP COMES BACK WITH ITS OUTCOME ON THE ADDRESS, said once
  // as a toast — or, on a sign-in page, in the card — and taken off.
  const q = new URLSearchParams(location.search);
  const outcome = q.get("auth"), refused = q.get("auth_error");
  if (outcome || refused) {
    if (authKindOf(location.pathname) && refused) authFlow.error = refused;
    else presetToast(accountSaid(outcome || refused));
    q.delete("auth");
    q.delete("auth_error");
    history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""));
  }
  loadAccount();
})();

// ---- the pages -------------------------------------------------------------------------


function authField(id, label, type, auto, extra = "") {
  return `<div class="field"><label for="${id}">${aT(label)}${extra}</label>
    <input id="${id}" type="${type}" autocomplete="${auto}"${type === "password" ? ' minlength="8" maxlength="128"' : ""}></div>`;
}
const authError = () => (authFlow.error
  ? `<div class="auth-err" role="alert">${escHtml(accountSaid(authFlow.error))}</div>` : "");
const authVal = (id) => (($(id) || {}).value || "").trim();

function authProviders(verb, back) {
  const on = ACCOUNT_SLOTS.filter((s) => s.id !== "email" && accountState.providers.includes(s.id));
  if (!on.length) return "";
  const or = accountState.providers.includes("email") ? `<div class="or">${aT("or with email")}</div>` : "";
  return on.map((s) => `<a class="prov" data-native href="${authStart(s.id, "login", `/login?return=${encodeURIComponent(back)}`)}">${
    ACCOUNT_ICONS[s.id]}${escHtml(tr(verb).replace("{p}", s.name))}</a>`).join("") + or;
}

/// SIX BOXES FOR A SIX-DIGIT CODE: typing moves on, backspace moves back, a
/// pasted code fills them all, and the last digit submits.
function authCodeStep(title, button, extra = "") {
  const left = Math.max(0, 60 - Math.floor((Date.now() - authFlow.sentAt) / 1000));
  return `<div class="mail-ico">${ACCOUNT_ICONS.email}</div>
    <h2>${aT(title)}</h2>
    <p class="lede">${escHtml(tr("We sent a 6-digit code to {email}. It works for 10 minutes.")).replace("{email}", `<b>${escHtml(authFlow.email)}</b>`)}</p>
    ${authError()}
    <div class="code-boxes">${Array.from({ length: 6 }, (_, i) =>
      `<input data-code="${i}" inputmode="numeric" maxlength="1" autocomplete="${i ? "off" : "one-time-code"}" aria-label="${aT("Digit")} ${i + 1}">`).join("")}</div>
    ${extra}
    <button class="run-btn" data-auth="verify">${aT(button)}</button>
    <div class="auth-foot">${aT("Didn't get it?")} ${left
      ? `<span class="muted">${aT("Resend")} (0:${String(left).padStart(2, "0")})</span>`
      : `<a href="#" data-auth="resend">${aT("Resend")}</a>`} · <a href="#" data-auth="back">${aT("Use another email")}</a></div>
    <div class="fine">${aT("Check the spam folder too.")}</div>`;
}
const authCode = () => [...document.querySelectorAll("[data-code]")].map((i) => i.value).join("");

function authLoginCard() {
  const back = authReturn();
  return `<h2>${aT("Sign in to WFSim")}</h2>
    <p class="lede">${aT("An account is optional. WFSim works the same without one.")}</p>
    ${authError()}${authProviders("Continue with {p}", back)}
    ${accountState.providers.includes("email") ? `${authField("auth-email", "Email", "email", "email")}
    ${authField("auth-password", "Password", "password", "current-password",
      ` <a href="/reset?return=${encodeURIComponent(back)}">${aT("Forgot password?")}</a>`)}
    <button class="run-btn" data-auth="login">${aT("Sign in")}</button>` : ""}
    <div class="auth-foot">${aT("New to WFSim?")} <a href="/signup?return=${encodeURIComponent(back)}">${aT("Create an account")}</a></div>
    <div class="fine">${aT("By continuing you have read the")} <a data-native href="/privacy">${aT("privacy policy")}</a></div>`;
}

function authSignupCard() {
  const back = authReturn();
  if (authFlow.step === 2) return authCodeStep("Check your email", "Create account");
  return `<h2>${aT("Create a WFSim account")}</h2>
    <p class="lede">${aT("Your builds follow you across devices.")}</p>
    ${authError()}${authProviders("Sign up with {p}", back)}
    ${accountState.providers.includes("email") ? `${authField("auth-email", "Email", "email", "email")}
    ${authField("auth-password", "Password", "password", "new-password")}<span class="hint">${aT("At least 8 characters")}</span>
    <button class="run-btn" data-auth="register">${aT("Continue")}</button>` : ""}
    <div class="auth-foot">${aT("Already have an account?")} <a href="/login?return=${encodeURIComponent(back)}">${aT("Sign in")}</a></div>`;
}

function authResetCard() {
  if (authFlow.step === 2) {
    return authCodeStep("Check your email", "Set new password",
      authField("auth-password", "New password (8+ characters)", "password", "new-password"));
  }
  return `<h2>${aT("Reset your password")}</h2>
    <p class="lede">${aT("Enter the email you signed up with, and we will send a code.")}</p>
    ${authError()}${authField("auth-email", "Email", "email", "email")}
    <button class="run-btn" data-auth="reset">${aT("Send code")}</button>
    <div class="auth-foot"><a href="/login?return=${encodeURIComponent(authReturn())}">${aT("Back to sign in")}</a></div>`;
}

// ---- /account ------------------------------------------------------------------------------

function accountMethods(a) {
  const rows = ACCOUNT_SLOTS.map((s) => {
    const id = a.identities.find((i) => i.provider === s.id);
    const offered = accountState.providers.includes(s.id);
    if (!id && !offered) return "";
    const act = s.id === "email"
      ? `<a class="ghost-btn btn-sm" href="#email-password">${aT(id ? "Manage" : "Add")}</a>`
      : id
        ? `<button class="ghost-btn btn-sm" data-auth="unlink" data-p="${s.id}">${aT("Disconnect")}</button>`
        : `<a class="ghost-btn btn-sm" data-native href="${authStart(s.id, "link", "/account")}">${aT("Connect")}</a>`;
    return `<div class="method"><span class="ic">${ACCOUNT_ICONS[s.id]}</span>
      <div><b>${s.id === "email" ? aT("Email and password") : s.name}</b><span>${id ? escHtml(id.label) : aT("Not connected")}</span></div>
      <div class="acts">${id ? `<span class="tag ok">${aT("Connected")}</span>` : ""}${act}</div></div>`;
  }).join("");
  return `<div class="block" id="sign-in-methods"><div class="bh"><h2>${aT("Ways to sign in")}</h2>
    <span class="sub">${aT("Connected")} ${a.identities.length} / ${ACCOUNT_SLOTS.length}</span></div>
    <div class="bb" style="padding:0">${rows}</div></div>
    <p class="set-note">${aT("Keep at least one way to sign in. A way to sign in belongs to one account only; WFSim never merges accounts.")}</p>`;
}

/// THE NAME THE ACCOUNT GOES BY: a username, which is the site's handle for
/// it, and a display name, which is free text. The first username change is
/// at once, each later one a day after the last (docs/ACCOUNTS.md §"Names").
function accountProfileBlock(a) {
  const after = a.rename_after
    ? tr("The username can change again after {time}.").replace("{time}",
      new Date(a.rename_after).toLocaleString(billingLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))
    : "";
  const body = authFlow.open === "profile"
    ? `<div class="inline-form">
        <div class="field"><label for="auth-username">${aT("Username")}</label>
          <input id="auth-username" type="text" autocomplete="username" maxlength="20" spellcheck="false" value="${escHtml(a.username)}"${a.rename_after ? " disabled" : ""}></div>
        <div class="field"><label for="auth-display">${aT("Display name")}</label>
          <input id="auth-display" type="text" autocomplete="nickname" maxlength="32" value="${escHtml(a.display_name || "")}" placeholder="${escHtml(a.username)}"></div>
        <button class="run-btn" data-auth="profile">${aT("Save")}</button></div>${authError()}
      <p class="set-note">${aT("Letters, digits and underscores for the username; anything for the display name. Everything you sign shows your current name.")}${after ? " " + escHtml(after) : ""}</p>`
    : `<dl class="kvs"><div class="kv"><dt>${aT("Username")}</dt><dd>@${escHtml(a.username)}${
        a.username.startsWith("user_") ? ` <span class="tag muted">${aT("not chosen yet")}</span>` : ""}</dd>
        <button class="ghost-btn btn-sm" data-auth="open" data-open="profile">${aT("Edit")}</button></div>
      <div class="kv"><dt>${aT("Display name")}</dt><dd>${a.display_name ? escHtml(a.display_name) : `<span class="set-note">${aT("Not set — the username is shown")}</span>`}</dd><span></span></div></dl>`;
  return `<div class="block" id="profile"><div class="bh"><h2>${aT("Profile")}</h2></div><div class="bb">${body}</div></div>`;
}

function accountEmailBlock(a) {
  const slot = a.identities.find((i) => i.provider === "email");
  if (!accountState.providers.includes("email") && !slot) return "";
  const open = authFlow.open;
  let body;
  if (open === "email" && authFlow.step === 2) {
    body = `<div class="inline-code">${authCodeStep("Check your email", "Confirm")}</div>`;
  } else {
    const kv = slot
      ? `<dl class="kvs"><div class="kv"><dt>${aT("Email")}</dt><dd>${escHtml(slot.label)} <span class="tag ok">${aT("Verified")}</span></dd>
          <button class="ghost-btn btn-sm" data-auth="open" data-open="email">${aT("Change email")}</button></div>
        <div class="kv"><dt>${aT("Password")}</dt><dd>${aT(slot.has_password ? "Set" : "Not set yet")}</dd>
          <button class="ghost-btn btn-sm" data-auth="open" data-open="password">${aT(slot.has_password ? "Change password" : "Set password")}</button></div></dl>`
      : `<p class="set-note" style="margin:0">${aT("No email yet. Add one to sign in with an email and a password.")}</p>
        <button class="ghost-btn btn-sm" data-auth="open" data-open="email" style="margin-top:8px">${aT("Add email and password")}</button>`;
    const form = open === "email"
      ? `<div class="inline-form">${authField("auth-email", slot ? "New email" : "Email", "email", "email")}
          ${authField("auth-password", "Password (8+ characters)", "password", "new-password")}
          <button class="run-btn" data-auth="link">${aT("Send code")}</button></div>`
      : open === "password"
        ? `<div class="inline-form">${slot && slot.has_password ? authField("auth-current", "Current password", "password", "current-password") : ""}
            ${authField("auth-password", "New password (8+ characters)", "password", "new-password")}
            <button class="run-btn" data-auth="password">${aT("Save")}</button></div>
          <p class="set-note">${aT("Other devices are signed out when the password changes.")}</p>`
        : "";
    body = kv + (open ? authError() : "") + form;
  }
  return `<div class="block" id="email-password"><div class="bh"><h2>${aT("Email and password")}</h2></div>
    <div class="bb">${body}</div></div>`;
}

// ---- /account/billing ------------------------------------------------------------------------
//
// THE SHAPE A MATURE PRODUCT'S BILLING PAGE HAS: the plan first — what is held,
// its state, the next charge and the card — then the billing history as a
// table, then who takes the money. Every change of plan, card or renewal is
// Stripe's own portal; this page states facts and links there.

/// WHAT AN OFFER OR A METER IS CALLED, as the paid half names it in the
/// reader's language: the page itself knows none of them.
const billingName = (kind, id) => {
  const n = (billingState.names[kind] || {})[id] || {};
  return n[LANG] || n.en || id;
};
const billingIncludes = (offer) => ((billingState.names.offers[offer] || {}).includes || []).map((x) => x[LANG] || x.en);
const billingLocale = () => (LANG === "zh" ? "zh-CN" : "en-US");
const billingDate = (d) => new Date(d).toLocaleDateString(billingLocale(), { year: "numeric", month: "long", day: "numeric" });
const billingMoney = (amount, currency) =>
  new Intl.NumberFormat(billingLocale(), { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
const PER_INTERVAL = { month: "/ month", year: "/ year" };

/// A YEAR BOUGHT AT ONCE against twelve months, for the same offer — the
/// saving the page may state, since it is arithmetic on Stripe's own prices.
function billingSaving(offer) {
  const m = billingState.prices.find((p) => p.offer === offer && p.interval === "month");
  const y = billingState.prices.find((p) => p.offer === offer && p.interval === "year");
  return m && y && m.currency === y.currency && 12 * m.amount > y.amount
    ? { monthly: m, yearly: y, amount: 12 * m.amount - y.amount } : null;
}

function billingPayment(pm) {
  if (!pm) return tr("On file with Stripe");
  return pm.last4 ? `${pm.brand ? pm.brand[0].toUpperCase() + pm.brand.slice(1) : tr("Card")} •••• ${pm.last4}`
    : pm.type === "link" ? "Link" : pm.type;
}

/// THE PLAN THE READER HOLDS: its state as a tag, what it costs, the next date
/// that matters, the card, and the one action that state calls for.
function billingHeld(s) {
  const tag = s.status === "past_due" ? `<span class="tag bad">${aT("Renewal failed")}</span>`
    : s.cancel_at_period_end ? `<span class="tag warn">${escHtml(tr("Ends on {date}").replace("{date}", billingDate(s.period_end)))}</span>`
      : `<span class="tag ok">${aT("Active")}</span>`;
  const notice = s.status === "past_due"
    ? `<div class="notice bad"><b>${aT("The last renewal did not go through.")}</b> ${aT("Stripe tries again over the next few days, and the membership stays on meanwhile. A new payment method is charged at once.")}</div>`
    : s.cancel_at_period_end
      ? `<div class="notice warn">${escHtml(tr("Renewal is cancelled. The membership lasts until {date}, and nothing more is charged.").replace("{date}", billingDate(s.period_end)))}</div>`
      : "";
  const next = s.cancel_at_period_end ? [tr("Ends"), billingDate(s.period_end)]
    : [tr("Next charge"), `${billingDate(s.period_end)} · ${billingMoney(s.amount, s.currency)}`];
  const saving = s.interval === "month" && billingSaving(s.offer);
  const manage = `<button class="ghost-btn btn-sm" data-auth="portal">${aT("Manage subscription")}</button>`;
  const acts = s.status === "past_due" ? `<button class="run-btn" data-auth="portal">${aT("Update payment method")}</button>${manage}`
    : s.cancel_at_period_end ? `<button class="run-btn" data-auth="portal">${aT("Resume renewal")}</button>${manage}`
      : manage + (saving ? `<button class="ghost-btn btn-sm" data-auth="portal">${escHtml(
        tr("Switch to yearly, save {amount}").replace("{amount}", billingMoney(saving.amount, saving.yearly.currency)))}</button>` : "");
  return `<div class="plan">
    <div class="plan-head"><h2>${escHtml(billingName("offers", s.offer))}</h2>${tag}</div>
    <div class="price"><b>${escHtml(billingMoney(s.amount, s.currency))}</b><span>${aT(PER_INTERVAL[s.interval] || "")}</span></div>
    ${notice}
    <dl class="facts">
      <div><dt>${escHtml(next[0])}</dt><dd>${escHtml(next[1])}</dd></div>
      <div><dt>${aT("Payment method")}</dt><dd>${escHtml(billingPayment(s.payment))}</dd></div>
      <div><dt>${aT("Member since")}</dt><dd>${escHtml(billingDate(s.started_at))}</dd></div>
    </dl>
    <div class="acts">${acts}</div></div>`;
}

/// THE OFFER, BEFORE A READER HOLDS IT: its price by period, what it contains
/// as the catalog lists it, and one button — a way to sign in, signed out.
function billingOffer() {
  const subs = billingState.prices.filter((p) => p.interval);
  if (!subs.length) return `<div class="plan"><p class="set-note">${aT("Nothing is on sale yet.")}</p></div>`;
  const offer = subs[0].offer;
  const periods = subs.filter((p) => p.offer === offer);
  const pick = periods.find((p) => p.interval === billingPeriod) || periods[0];
  const saving = billingSaving(offer);
  const toggle = periods.length > 1 ? `<div class="fd-seg" role="group" aria-label="${aT("Billing period")}">${periods.map((p) =>
    `<button data-auth="period" data-period="${p.interval}" class="${p === pick ? "on" : ""}">${aT(p.interval === "year" ? "Yearly" : "Monthly")}${
      p.interval === "year" && saving ? ` <em>${escHtml(tr("save {amount}").replace("{amount}", billingMoney(saving.amount, p.currency)))}</em>` : ""}</button>`).join("")}</div>` : "";
  const perMonth = pick.interval === "year"
    ? ` · ${escHtml(tr("about {amount} a month").replace("{amount}", billingMoney(Math.round(pick.amount / 12), pick.currency)))}` : "";
  const includes = billingIncludes(offer);
  return `<div class="plan">
    <div class="plan-head"><h2>${escHtml(billingName("offers", offer))}</h2>${toggle}</div>
    <div class="price"><b>${escHtml(billingMoney(pick.amount, pick.currency))}</b><span>${aT(PER_INTERVAL[pick.interval] || "")}${perMonth}</span></div>
    ${includes.length ? `<ul class="includes">${includes.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>` : ""}
    <div class="acts">${accountState.account
      ? `<button class="run-btn" data-auth="checkout" data-price="${escHtml(pick.key)}">${aT(pick.interval === "year" ? "Subscribe yearly" : "Subscribe monthly")}</button>`
      : `<a class="run-btn" href="/login?return=${encodeURIComponent("/pricing")}">${aT("Sign in to subscribe")}</a>`}
      <span class="set-note">${aT("Cancel any time. The builder, simulator, optimizer and leaderboard need no membership.")}</span></div></div>`;
}

/// AN INVOICE'S STATE in the reader's words; a refund is read off its payment
/// by the paid half, since Stripe leaves a refunded invoice `paid`.
const INVOICE_STATUS = { paid: ["ok", "Paid"], refunded: ["", "Refunded"], partly_refunded: ["warn", "Partly refunded"],
  open: ["bad", "Unpaid"], void: ["", "Void"], uncollectible: ["bad", "Uncollectible"] };

function billingHistory() {
  const rows = billingState.invoices;
  if (!rows.length) return `<div class="empty">${aT("No bills yet.")}</div>`;
  return `<div class="table-wrap"><table class="bills"><thead><tr><th>${aT("Date")}</th><th>${aT("Item")}</th>
    <th class="num">${aT("Amount")}</th><th>${aT("Status")}</th><th class="num">${aT("Invoice")}</th></tr></thead><tbody>${rows.map((i) => {
      const st = INVOICE_STATUS[i.status] || ["", i.status];
      const what = i.offer ? `${billingName("offers", i.offer)}${i.interval ? ` · ${tr(i.interval === "year" ? "Yearly" : "Monthly")}` : ""}` : i.number || "";
      return `<tr><td>${escHtml(billingDate(i.created))}</td><td>${escHtml(what)}</td>
        <td class="num">${escHtml(billingMoney(i.total, i.currency))}</td><td><span class="tag ${st[0]}">${aT(st[1])}</span></td>
        <td class="links">${i.url ? `<a data-native target="_blank" rel="noopener" href="${escHtml(i.url)}">${aT("View")}</a>` : ""}${
          i.pdf ? `<a data-native href="${escHtml(i.pdf)}">PDF</a>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function billingPage(a) {
  const s = billingState.subscription;
  const n = billingState.invoices.length;
  return `<div class="settings">${settingsNav(a, "billing")}
    <div class="set-main"><h1 class="page">${aT("Membership and billing")}</h1>
      <section class="block">${s ? billingHeld(s) : billingOffer()}</section>
      <section class="block"><div class="bh"><h2>${aT("Billing history")}</h2>${n ? `<span class="sub">${n}</span>` : ""}</div>${billingHistory()}</section>
      <p class="set-note">${aT("Payments are handled by Stripe and appear on your statement as LINK.COM* WFSIM.APP. Stripe emails a receipt and an invoice for every payment.")}
        <a data-native href="/terms">${aT("Terms")}</a> · <a data-native href="/refunds">${aT("Refunds")}</a> · <a data-native href="/privacy">${aT("Privacy")}</a></p></div></div>`;
}

/// THE PRICE PAGE, signed in or not: what is free and what the membership adds,
/// side by side. Every number is the server's (`/api/billing`): the offer, its
/// prices, and the free allowance — none of which applies until it is on sale.
function pricingPage() {
  const sync = billingState.configured && (billingState.free || {}).sync_allowance;
  const held = billingState.subscription;
  const free = `<section class="block"><div class="plan">
    <div class="plan-head"><h2>${aT("Free")}</h2></div>
    <ul class="includes">
      <li>${aT("The builder, simulator, optimizer and leaderboard, with no account")}</li>
      <li>${aT("Saving on your browser, with no limit")}</li>
      <li>${escHtml(sync
        ? tr("Syncing to your account: {a} presets and {b} customs").replace("{a}", sync.presets).replace("{b}", sync.customs)
        : tr("Syncing to your account"))}</li>
    </ul></div></section>`;
  const member = !billingState.configured
    ? `<section class="block"><div class="plan"><p class="set-note">${aT("Membership is not on sale yet.")}</p></div></section>`
    : held ? `<section class="block"><div class="plan"><div class="plan-head"><h2>${escHtml(billingName("offers", held.offer))}</h2>
        <span class="tag ok">${aT("Active")}</span></div><div class="acts"><a class="ghost-btn btn-sm" href="/account/billing">${aT("Membership and billing")}</a></div></div></section>`
      : `<section class="block">${billingOffer()}</section>`;
  return `<div class="pricing"><h1 class="page">${aT("Pricing")}</h1>
    <div class="plans">${free}${member}</div>
    <p class="set-note">${aT("Sold by Mogin Labs Pte. Ltd., Singapore. Payments are handled by Stripe.")}
      <a data-native href="/terms">${aT("Terms")}</a> · <a data-native href="/refunds">${aT("Refunds")}</a> · <a data-native href="/privacy">${aT("Privacy")}</a></p></div>`;
}

/// THE SETTINGS PAGES' OWN NAVIGATION: who is signed in, then one link per page.
function settingsNav(a, here) {
  const since = new Date(a.created_at).toLocaleDateString(billingLocale(), { year: "numeric", month: "long" });
  const link = (href, kind, label) => `<a href="${href}"${here === kind ? ' class="on" aria-current="page"' : ""}>${aT(label)}</a>`;
  return `<nav class="set-side" aria-label="${aT("Account settings")}">
    <div class="me"><span class="avatar avatar-lg">${escHtml(accountInitial(a))}</span>
      <div><b>${escHtml(accountName(a))}</b><span>${escHtml(tr("Joined {date}").replace("{date}", since))}</span></div></div>
    ${link("/account", "account", "Account")}
    ${billingState.configured ? link("/account/billing", "billing", "Membership and billing") : ""}</nav>`;
}

/// THE SYNC ROW says where `syncStatus` stands and offers the one action that
/// state calls for (docs/UI.md §"Build sync").
function syncRowHtml() {
  const s = syncStatus;
  const row = (dd, act = "<span></span>") => `<dt>${aT("Build sync")}</dt><dd>${dd}</dd>${act}`;
  if (s.state === "on") {
    const when = new Date(s.at).toLocaleTimeString(billingLocale(), { hour: "2-digit", minute: "2-digit" });
    return row(`<span class="tag ok">${aT("On")}</span> ${escHtml(tr("last synced {time}").replace("{time}", when))}${
      s.full ? ` <span class="tag warn">${aT("Full: new items stay on this browser")}</span>` : ""}${syncUnsyncedHtml(s.unsynced)}`,
    `<button class="ghost-btn btn-sm" data-auth="sync-now">${aT("Sync now")}</button>`);
  }
  if (s.state === "other") {
    return row(aT("This browser holds items synced with another account."),
      `<button class="ghost-btn btn-sm" data-auth="sync-adopt">${aT("Add them to this account")}</button>`);
  }
  if (s.state === "error") {
    return row(`${aT("Could not sync just now.")}${s.reason ? ` <span class="set-note">(${escHtml(s.reason)})</span>` : ""}`,
      `<button class="ghost-btn btn-sm" data-auth="sync-now">${aT("Try again")}</button>`);
  }
  if (s.state === "not_included") return row(`<span class="tag muted">${aT("Not available for this account")}</span>`);
  return row(`<span class="tag muted">${aT("Checking…")}</span>`);
}
/// WHAT SYNCS: the default for a new item, and how much each pool holds —
/// against the allowance where the account has one.
function syncChoiceHtml() {
  const n = syncedCounts();
  const of = (pool) => (syncAllowance && syncAllowance[pool] != null ? ` / ${syncAllowance[pool]}` : "");
  return `<dt>${aT("What syncs")}</dt><dd>${escHtml(tr("presets {a} · customs {b}")
    .replace("{a}", n.presets + of("presets")).replace("{b}", n.customs + of("customs")))}<br>
    <span class="set-note">${aT("The cloud on each item switches it; saving on this browser is never limited.")}</span></dd>
    <label class="set-note"><input type="checkbox" id="sync-auto" ${syncAuto() ? "checked" : ""}> ${aT("Upload new items")}</label>`;
}
/// WHAT THE SERVER WOULD NOT TAKE, by name and why. Each stays on this browser.
const SYNC_REJECTED = { bad_body: "too large to sync", bad_change: "cannot be synced" };
function syncUnsyncedHtml(list) {
  if (!list || !list.length) return "";
  const here = syncLocal();
  const name = (u) => ((here.get(u.id) || {}).p || {}).name || u.id;
  return `<br><span class="tag warn">${escHtml(tr("{n} items did not sync").replace("{n}", list.length))}</span>
    <span class="set-note">${list.slice(0, 8).map((u) => `${escHtml(name(u))} — ${aT(SYNC_REJECTED[u.reason] || u.reason)}`).join("; ")}${
      list.length > 8 ? " …" : ""}</span>`;
}
function renderSyncStatus() {
  const el = $("sync-row");
  if (el) el.innerHTML = syncRowHtml();
  const c = $("sync-choice");
  if (c) c.innerHTML = syncChoiceHtml();
}

/// THE AGENTS THAT ACT FOR THIS ACCOUNT — each one claimed with a code mailed
/// here, each one revoked in one click, the way a mature product lists the
/// apps it has let in (docs/ACCOUNTS.md §"Agents").
function accountAgentsBlock() {
  const day = (d) => (d ? new Date(d).toLocaleDateString(billingLocale(), { year: "numeric", month: "short", day: "numeric" }) : "—");
  const rows = agentsState.map((g) => `<div class="kv"><dt>${escHtml(g.name)}</dt>
      <dd>${escHtml(tr("connected {date}").replace("{date}", day(g.claimed_at)))} · ${escHtml(tr("last used {date}").replace("{date}", day(g.last_used_at)))}</dd>
      <button class="ghost-btn btn-sm" data-auth="agent-revoke" data-id="${escHtml(g.id)}">${aT("Disconnect")}</button></div>`).join("");
  return `<div class="block" id="agents"><div class="bh"><h2>${aT("Connected agents")}</h2></div><div class="bb">${
    rows ? `<dl class="kvs">${rows}</dl>` : `<p class="set-note" style="margin:0">${aT("No agent acts for this account.")}</p>`}
    <p class="set-note">${aT("An AI agent connects by asking you for a code WFSim mails to your address. Disconnecting it stops its key at once.")}
      <a data-native href="/auth.md">auth.md</a></p></div></div>`;
}

function accountDataBlock() {
  return `<div class="block" id="data-privacy"><div class="bh"><h2>${aT("Data and privacy")}</h2></div><div class="bb"><dl class="kvs">
    <div class="kv" id="sync-row">${syncRowHtml()}</div>
    <div class="kv" id="sync-choice">${syncChoiceHtml()}</div>
    <div class="kv"><dt>${aT("Your data")}</dt><dd>${aT("The account, its ways to sign in, and what it syncs")}</dd>
      <button class="ghost-btn btn-sm" data-auth="export">${aT("Download my data")}</button></div>
    <div class="kv"><dt>${aT("Privacy policy")}</dt><dd>${aT("What WFSim keeps, and why")}</dd>
      <a class="ghost-btn btn-sm" data-native href="/privacy">${aT("View")}</a></div></dl></div></div>`;
}

function accountDangerBlock() {
  return `<div class="block danger" id="delete-account"><div class="bh"><h2>${aT("Delete account")}</h2></div><div class="bb">
    ${authFlow.error === "last_slot" ? `<div class="auth-err" role="alert">${escHtml(accountSaid("last_slot"))}</div>` : ""}
    <p class="set-note" style="margin:0">${aT("Deletes this account, every way to sign in to it and everything it syncs, for good.")}
      ${billingState.subscription ? aT("Its subscription is cancelled first; receipts stay with Stripe.") : ""}</p>
    <div class="confirm"><label for="auth-delete" class="set-note">${aT("Type DELETE to confirm:")}</label>
      <input id="auth-delete" autocomplete="off" spellcheck="false">
      <button class="btn-danger" data-auth="delete" disabled>${aT("Delete account for good")}</button></div></div></div>`;
}

function accountPage(a) {
  return `<div class="settings">${settingsNav(a, "account")}
    <div class="set-main"><h1 class="page">${aT("Account settings")}</h1>
      ${accountProfileBlock(a)}${accountMethods(a)}${accountEmailBlock(a)}${accountAgentsBlock()}${accountDataBlock()}${accountDangerBlock()}</div></div>`;
}

// ---- drawing a page ------------------------------------------------------------------------

function renderAuthPage(kind) {
  const main = $("auth-page");
  if (!main) return;
  // A NEW PAGE STARTS CLEAN — except the first, which may carry an OAuth refusal.
  if (authFlow.kind !== kind) {
    authFlow = { kind, step: 1, email: "", sentAt: 0, error: authFlow.kind === null ? authFlow.error : null, open: null };
  }
  clearInterval(authTimer);
  if (!accountState.loaded) { main.innerHTML = ""; return; }
  const { account, providers } = accountState;
  // A SIGNED-IN READER HAS NO SIGN-IN PAGE, and a signed-out one no settings.
  if (account && !isSettings(kind) && kind !== "pricing") { nav(authReturn()); return; }
  if (!account && isSettings(kind)) {
    history.replaceState(null, "", `/login?return=${encodeURIComponent(location.pathname)}`); route(); return;
  }
  // BILLING IS A PAGE ONLY WHERE IT IS ON: anyone else is on the account page.
  if (kind === "billing" && !billingState.configured) { history.replaceState(null, "", "/account"); route(); return; }
  if (kind === "pricing") { main.innerHTML = pricingPage(); return; }
  if (!account && !providers.length) {
    main.innerHTML = `<div class="auth-page"><div class="auth-card"><h2>${aT("Accounts are not available here")}</h2>
      <p class="lede">${aT("Sign in on wfsim.app.")}</p></div></div>`;
    return;
  }
  main.innerHTML = kind === "account" ? accountPage(account) : kind === "billing" ? billingPage(account)
    : `<div class="auth-page"><div class="auth-card" data-auth-kind="${kind}">${
      kind === "signup" ? authSignupCard() : kind === "reset" ? authResetCard() : authLoginCard()}</div></div>`;
  // BACK FROM STRIPE'S CHECKOUT: said once, then the page reads again what the
  // webhook has written by then — the redirect itself grants nothing.
  if (kind === "billing" && new URLSearchParams(location.search).get("billing") === "done") {
    history.replaceState(null, "", "/account/billing");
    presetToast(tr("Payment received. It can take a few seconds to show here."));
    setTimeout(async () => { await loadBilling(); if (authKindOf(location.pathname) === "billing") renderAuthPage("billing"); }, 4000);
  }
  if (kind === "account") {
    const del = $("auth-delete");
    if (del) del.addEventListener("input", () => { main.querySelector("[data-auth=delete]").disabled = del.value.trim() !== "DELETE"; });
  }
  // THE RESEND COUNTDOWN ticks while a code step is on screen, and only then.
  if (authFlow.step === 2 && Date.now() - authFlow.sentAt < 60000) {
    authTimer = setInterval(() => {
      const f = main.querySelector(".auth-foot .muted");
      const left = Math.max(0, 60 - Math.floor((Date.now() - authFlow.sentAt) / 1000));
      if (!f || !left) { clearInterval(authTimer); if (f) renderAuthPage(kind); return; }
      f.textContent = `${tr("Resend")} (0:${String(left).padStart(2, "0")})`;
    }, 1000);
  }
  const first = main.querySelector("[data-code]") || main.querySelector(".auth-card input, .inline-form input");
  if (first && !isSettings(kind)) first.focus();
  else if (first && authFlow.open) first.focus();
}

/// AN ANSWER THAT SIGNS SOMEBODY IN: said, the account reloaded, and the reader
/// taken back to where they came from.
async function authSignedIn(r) {
  // WHERE TO GO IS READ BEFORE ANYTHING MOVES: reloading the account redraws
  // this page, which sends a signed-in reader on and takes `?return=` with it.
  const back = authReturn();
  presetToast(accountSaid(r.outcome));
  authFlow = { kind: null, step: 1, email: "", sentAt: 0, error: null, open: null };
  await loadAccount();
  if (authKindOf(location.pathname)) nav(back);
}

async function authAct(el) {
  const what = el.dataset.auth;
  const kind = authFlow.kind;
  const main = $("auth-page");
  authFlow.error = null;
  const fail = (r) => { authFlow.error = (r && r.reason) || "send_failed"; renderAuthPage(kind); };
  const mailed = (email) => { authFlow = { ...authFlow, step: 2, email, sentAt: Date.now() }; renderAuthPage(kind); };
  el.disabled = true;
  try {
    if (what === "login") {
      const r = await accountCall("POST", "/api/auth/email/login", { email: authVal("auth-email"), password: $("auth-password").value });
      return r && r.ok ? authSignedIn(r) : fail(r);
    }
    if (what === "register" || what === "link") {
      const email = authVal("auth-email");
      const r = await accountCall("POST", `/api/auth/email/${what}`, { email, password: $("auth-password").value });
      return r && r.ok ? mailed(email) : fail(r);
    }
    if (what === "reset" || what === "resend") {
      const email = what === "resend" ? authFlow.email : authVal("auth-email");
      if (what === "resend" && kind !== "reset") { authFlow.step = 1; return renderAuthPage(kind); }
      const r = await accountCall("POST", "/api/auth/email/reset", { email });
      return r && r.ok ? mailed(email) : fail(r);
    }
    if (what === "back") { authFlow.step = 1; return renderAuthPage(kind); }
    if (what === "verify") {
      const r = await accountCall("POST", "/api/auth/email/verify", {
        email: authFlow.email, code: authCode(), ...(kind === "reset" ? { password: $("auth-password").value } : {}),
      });
      if (!(r && r.ok)) return fail(r);
      if (kind === "account") {
        presetToast(accountSaid(r.outcome));
        authFlow = { ...authFlow, step: 1, open: null };
        return loadAccount();
      }
      return authSignedIn(r);
    }
    if (what === "open") {
      authFlow = { ...authFlow, step: 1, open: authFlow.open === el.dataset.open ? null : el.dataset.open };
      return renderAuthPage(kind);
    }
    if (what === "password") {
      const r = await accountCall("POST", "/api/account/password",
        { current: ($("auth-current") || {}).value || "", password: $("auth-password").value });
      if (!(r && r.ok)) return fail(r);
      presetToast(accountSaid(r.outcome));
      authFlow.open = null;
      return loadAccount();
    }
    if (what === "unlink") {
      const r = await accountCall("POST", "/api/account/unlink", { provider: el.dataset.p });
      if (r && r.reason === "last_slot") {
        authFlow.error = "last_slot";
        renderAuthPage(kind);
        $("delete-account").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (!(r && r.ok)) return fail(r);
      presetToast(tr("Disconnected."));
      return loadAccount();
    }
    if (what === "delete") {
      const r = await accountCall("POST", "/api/account/delete", {});
      if (!(r && r.ok)) return fail(r);
      // WHAT IT SYNCED WENT WITH IT; this browser keeps its own copy, and the
      // next account to sign in here takes it as new rather than as another's.
      try { localStorage.removeItem(SYNC_KEY); } catch (_) { /* nothing to forget */ }
      presetToast(tr("Account deleted."));
      await loadAccount();
      return nav("/");
    }
    if (what === "period") {
      billingPeriod = el.dataset.period;
      return renderAuthPage(kind);
    }
    if (what === "checkout" || what === "portal") {
      const r = await accountCall("POST", `/api/billing/${what}`, what === "checkout" ? { price: el.dataset.price } : {});
      if (!(r && r.ok)) { presetToast(accountSaid((r && r.reason) || "stripe")); return; }
      location.href = r.url;
      return;
    }
    if (what === "profile") {
      const a = accountState.account;
      const r = await accountCall("POST", "/api/account/profile", {
        ...(a.rename_after ? {} : { username: authVal("auth-username") }), display_name: authVal("auth-display") });
      if (!(r && r.ok)) return fail(r);
      presetToast(tr("Saved."));
      authFlow = { ...authFlow, open: null, error: null };
      return loadAccount();
    }
    if (what === "agent-revoke") {
      const r = await accountCall("POST", "/api/account/agents/revoke", { id: el.dataset.id });
      if (!(r && r.ok)) return fail(r);
      presetToast(tr("Disconnected."));
      await loadAgents();
      return renderAuthPage(kind);
    }
    if (what === "sync-now") { await syncNow(); return; }
    if (what === "sync-adopt") { await syncAdopt(); return; }
    if (what === "export") {
      const r = await accountCall("POST", "/api/account/export", {});
      if (!(r && r.ok)) return fail(r);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
      a.download = "wfsim-account.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  } finally {
    if (el.isConnected) el.disabled = false;
    if (main && what === "delete") el.disabled = ($("auth-delete") || {}).value !== "DELETE";
  }
}

(function () {
  const main = $("auth-page");
  if (!main) return;
  main.addEventListener("click", (e) => {
    const jump = e.target.closest("a[data-jump]");
    if (jump) {
      e.preventDefault();
      const t = $(jump.getAttribute("href").slice(1));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const email = e.target.closest('a[href="#email-password"]');
    if (email) { e.preventDefault(); $("email-password").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const el = e.target.closest("[data-auth]");
    if (el) { e.preventDefault(); authAct(el); }
  });
  main.addEventListener("change", (e) => {
    if (e.target.id === "sync-auto") setSyncAuto(e.target.checked);
  });
  // ENTER SUBMITS what it is typed into, as the button under it would.
  main.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) {
      const box = e.target.closest(".auth-card, .inline-form, .inline-code, .confirm");
      const go = box && box.querySelector(".run-btn, .btn-danger");
      if (go && !go.disabled) { e.preventDefault(); authAct(go); }
      return;
    }
    if (e.key === "Backspace" && e.target.matches("[data-code]") && !e.target.value) {
      const prev = main.querySelector(`[data-code="${Number(e.target.dataset.code) - 1}"]`);
      if (prev) prev.focus();
    }
  });
  main.addEventListener("input", (e) => {
    if (!e.target.matches("[data-code]")) return;
    const boxes = [...main.querySelectorAll("[data-code]")];
    const digits = e.target.value.replace(/\D/g, "");
    const at = Number(e.target.dataset.code);
    // A PASTED OR AUTOFILLED CODE arrives in one box; it is spread across all.
    [...digits].slice(0, 6 - at).forEach((d, i) => { boxes[at + i].value = d; });
    if (!digits) e.target.value = "";
    const next = boxes[Math.min(at + Math.max(digits.length, 1), 5)];
    if (digits && next) next.focus();
    // THE LAST DIGIT SUBMITS — unless a new password still has to be typed.
    const pw = $("auth-password");
    const go = main.querySelector("[data-auth=verify]");
    if (authCode().length === 6 && go && !(pw && !pw.value)) authAct(go);
  });
})();
