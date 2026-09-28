// ---- THE ACCOUNT PANEL ------------------------------------------------------------
//
// docs/ACCOUNTS.md. An account is optional and changes nothing a reader without
// one can do. The panel exists only where `/api/account` answers with a way in —
// the site, with its secrets set — so the dev server, the desktop shell and a
// site not yet configured draw no account control at all.
//
// Four slots, at most one of each. Emptying the last one deletes the account,
// so that is the one action the panel asks twice about, inline.

const ACCOUNT_SLOTS = [
  { id: "google", name: "Google" },
  { id: "discord", name: "Discord" },
  { id: "github", name: "GitHub" },
  { id: "email", name: "Email" },
];

/// WHAT THE SERVER SAID, in the reader's words — an outcome or a refusal.
const ACCOUNT_SAYS = {
  created: "Account created.",
  signed_in: "Signed in.",
  linked: "Linked.",
  replaced: "Replaced.",
  taken: "That sign-in already belongs to another WFSim account. Sign in with it and remove it there first.",
  not_signed_in: "Sign in first.",
  state: "The sign-in expired. Try again.",
  cancelled: "Sign-in was cancelled.",
  provider: "The provider did not answer. Try again.",
  unavailable: "This way to sign in is not set up yet.",
  bad_email: "That is not an email address.",
  too_soon: "A code was just sent. Wait a minute before asking again.",
  send_failed: "The mail could not be sent. Try again later.",
  rate_limited: "Too many tries. Wait a minute.",
  bad_code: "The code is six digits.",
  expired: "That code has expired. Ask for a new one.",
  wrong_code: "That code is not right.",
  too_many_attempts: "Too many wrong codes. Ask for a new one.",
  last_slot: "This is your last way to sign in.",
};

let accountState = { providers: [], account: null };
let accountNote = null;       // { key, bad }
let accountEmail = null;      // { intent, stage: "address"|"code", address }
let accountConfirm = null;    // "delete" | provider id

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

async function loadAccount() {
  const r = await accountCall("GET", "/api/account");
  accountState = r && r.ok ? { providers: r.providers || [], account: r.account } : { providers: [], account: null };
  renderAccount();
}

const accountSay = (key, bad) => { accountNote = { key, bad: !!bad }; };
const accountHere = () => location.pathname + location.search;
const accountStart = (p, intent) =>
  `/api/auth/${p}/start?intent=${intent}&return=${encodeURIComponent(accountHere())}`;

function renderAccount() {
  const box = $("account");
  if (!box) return;
  const { providers, account } = accountState;
  box.hidden = !providers.length && !account;
  if (box.hidden) return;
  const btn = $("account-toggle");
  btn.classList.toggle("on", !!account);
  const note = accountNote
    ? `<div class="acc-note${accountNote.bad ? " bad" : ""}">${escHtml(tr(ACCOUNT_SAYS[accountNote.key] || accountNote.key))}</div>` : "";
  $("account-panel").innerHTML = note + (account ? accountSignedIn(account, providers) : accountSignedOut(providers))
    + `<a class="acc-small" data-native href="/privacy">${escHtml(tr("Privacy"))}</a>`;
}

function accountEmailForm(intent) {
  const e = accountEmail && accountEmail.intent === intent ? accountEmail : null;
  if (!e) return "";
  return e.stage === "code"
    ? `<div class="acc-form"><span class="acc-small">${escHtml(tr("Code sent to"))} ${escHtml(e.address)}</span>
        <input id="acc-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${escHtml(tr("6-digit code"))}">
        <button class="acc-go" data-acc="verify">${escHtml(tr("Confirm"))}</button></div>`
    : `<div class="acc-form"><input id="acc-address" type="email" autocomplete="email" placeholder="${escHtml(tr("Email address"))}">
        <button class="acc-go" data-acc="send">${escHtml(tr("Send code"))}</button></div>`;
}

function accountSignedOut(providers) {
  const ways = ACCOUNT_SLOTS.filter((s) => providers.includes(s.id)).map((s) => s.id === "email"
    ? `<button class="acc-way" data-acc="email-login">${escHtml(tr("Continue with email"))}</button>${accountEmailForm("login")}`
    : `<a class="acc-way" data-native href="${accountStart(s.id, "login")}">${escHtml(tr("Continue with"))} ${s.name}</a>`).join("");
  return `<div class="acc-h">${escHtml(tr("Sign in"))}</div>
    <div class="acc-small">${escHtml(tr("Keeps your builds with you across devices. WFSim works the same without it."))}</div>${ways}`;
}

function accountSignedIn(account, providers) {
  const filled = account.identities.length;
  const rows = ACCOUNT_SLOTS.filter((s) => providers.includes(s.id) || account.identities.some((i) => i.provider === s.id))
    .map((s) => {
      const id = account.identities.find((i) => i.provider === s.id);
      const act = (label, how) => (s.id === "email"
        ? `<button class="acc-mini" data-acc="email-link">${escHtml(tr(label))}</button>`
        : `<a class="acc-mini" data-native href="${accountStart(s.id, how)}">${escHtml(tr(label))}</a>`);
      const actions = id
        ? `${providers.includes(s.id) ? act("Replace", "link") : ""}<button class="acc-mini" data-acc="unlink" data-p="${s.id}">${escHtml(tr("Remove"))}</button>`
        : act("Link", "link");
      const confirm = accountConfirm === s.id
        ? `<div class="acc-confirm">${escHtml(tr("This is your last way to sign in. Removing it deletes your account and everything synced to it."))}
            <button class="acc-danger" data-acc="unlink-delete" data-p="${s.id}">${escHtml(tr("Delete account"))}</button>
            <button class="acc-mini" data-acc="cancel">${escHtml(tr("Cancel"))}</button></div>` : "";
      return `<div class="acc-slot"><span class="acc-p">${s.name}</span>
        <span class="acc-l">${id ? escHtml(id.label) : `<i>${escHtml(tr("not linked"))}</i>`}</span>
        <span class="acc-a">${actions}</span></div>${confirm}${s.id === "email" ? accountEmailForm("link") : ""}`;
    }).join("");
  const del = accountConfirm === "delete"
    ? `<div class="acc-confirm">${escHtml(tr("Delete your account and everything synced to it? This cannot be undone."))}
        <button class="acc-danger" data-acc="delete-yes">${escHtml(tr("Delete account"))}</button>
        <button class="acc-mini" data-acc="cancel">${escHtml(tr("Cancel"))}</button></div>` : "";
  return `<div class="acc-h">${escHtml(tr("Your account"))}</div>
    <div class="acc-small">${escHtml(tr("Ways to sign in"))} (${filled}/${ACCOUNT_SLOTS.length})</div>${rows}
    <div class="acc-row"><button class="acc-mini" data-acc="logout">${escHtml(tr("Sign out"))}</button>
      <button class="acc-mini" data-acc="export">${escHtml(tr("Download my data"))}</button>
      <button class="acc-mini acc-warn" data-acc="delete">${escHtml(tr("Delete account"))}</button></div>${del}`;
}

async function accountAct(el) {
  const what = el.dataset.acc;
  const p = el.dataset.p;
  accountNote = null;
  if (what === "email-login" || what === "email-link") {
    const intent = what === "email-login" ? "login" : "link";
    accountEmail = accountEmail && accountEmail.intent === intent ? null : { intent, stage: "address" };
  } else if (what === "send") {
    const address = ($("acc-address") || {}).value || "";
    const r = await accountCall("POST", "/api/auth/email/start", { email: address });
    if (r && r.ok) accountEmail = { ...accountEmail, stage: "code", address: address.trim() };
    else accountSay((r && r.reason) || "send_failed", true);
  } else if (what === "verify") {
    const r = await accountCall("POST", "/api/auth/email/verify",
      { email: accountEmail.address, code: ($("acc-code") || {}).value || "", intent: accountEmail.intent });
    if (r && r.ok) { accountEmail = null; accountSay(r.outcome); await loadAccount(); return; }
    accountSay((r && r.reason) || "bad_code", true);
  } else if (what === "unlink" || what === "unlink-delete") {
    const r = await accountCall("POST", "/api/account/unlink", { provider: p, ...(what === "unlink-delete" ? { delete_account: true } : {}) });
    if (r && r.reason === "last_slot") accountConfirm = p;
    else { accountConfirm = null; if (r && !r.ok) accountSay(r.reason, true); await loadAccount(); return; }
  } else if (what === "delete") {
    accountConfirm = "delete";
  } else if (what === "delete-yes") {
    await accountCall("POST", "/api/account/delete", {});
    accountConfirm = null;
    await loadAccount();
    return;
  } else if (what === "cancel") {
    accountConfirm = null;
  } else if (what === "logout") {
    await accountCall("POST", "/api/auth/logout", {});
    await loadAccount();
    return;
  } else if (what === "export") {
    const r = await accountCall("POST", "/api/account/export", {});
    if (r && r.ok) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
      a.download = "wfsim-account.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }
  renderAccount();
}

// The panel opens and closes like the topbar overflow, and an OAuth round trip
// comes back with its outcome on the address, which is read once and removed.
(function () {
  const box = $("account"), btn = $("account-toggle");
  if (!box || !btn) return;
  const set = (open) => {
    box.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    // DRAWN AGAIN ON OPENING, so a panel first drawn before the language loaded
    // is in the reader's language by the time anyone reads it.
    if (open) renderAccount();
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(!box.classList.contains("open")); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#account")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  $("account-panel").addEventListener("click", (e) => {
    const el = e.target.closest("[data-acc]");
    if (el) { e.preventDefault(); accountAct(el); }
  });
  const q = new URLSearchParams(location.search);
  const outcome = q.get("auth"), refused = q.get("auth_error");
  if (outcome || refused) {
    accountSay(outcome || refused, !!refused);
    q.delete("auth");
    q.delete("auth_error");
    history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""));
    set(true);
  }
  loadAccount();
})();
