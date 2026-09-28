// ---- THE ACCOUNT PANEL ------------------------------------------------------------
//
// docs/ACCOUNTS.md. An account is optional and changes nothing a reader without
// one can do. The panel exists only where `/api/account` answers with a way in —
// the site, with its secrets set — so the dev server, the desktop shell and a
// site not yet configured draw no account control at all.
//
// Two ways in: a third party in one click, or an email address and a password.
// Mail goes out only to prove an address — registering, linking, resetting.
// Emptying the last slot deletes the account, so the panel asks that inline.

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
  password_reset: "Password reset. You are signed in, and signed out everywhere else.",
  password_changed: "Password changed. Other devices are signed out.",
  taken: "That sign-in already belongs to another WFSim account. Sign in with it and remove it there first.",
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
  last_slot: "This is your last way to sign in.",
};

let accountState = { providers: [], account: null };
let accountNote = null;       // { key, bad }
// THE FIRST-PARTY FORM ON SCREEN: which one, and whether it waits for a code.
//   signed out: login (the default) | register | reset
//   signed in:  link | password
let accountForm = { kind: "login", stage: "form", address: "" };
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
const accountT = (s) => escHtml(tr(s));
const accountVal = (id) => ($(id) || {}).value || "";

function renderAccount() {
  const box = $("account");
  if (!box) return;
  const { providers, account } = accountState;
  box.hidden = !providers.length && !account;
  if (box.hidden) return;
  $("account-toggle").classList.toggle("on", !!account);
  const note = accountNote
    ? `<div class="acc-note${accountNote.bad ? " bad" : ""}">${accountT(ACCOUNT_SAYS[accountNote.key] || accountNote.key)}</div>` : "";
  $("account-panel").innerHTML = note + (account ? accountSignedIn(account, providers) : accountSignedOut(providers))
    + `<a class="acc-small" data-native href="/privacy">${accountT("Privacy")}</a>`;
}

/// A field. Passwords say which kind they are, so a password manager offers the
/// saved one to sign in and a new one to register.
const accountInput = (id, type, placeholder, auto) =>
  `<input id="${id}" type="${type}" autocomplete="${auto}" placeholder="${accountT(placeholder)}"${
    type === "password" ? ` minlength="8" maxlength="128"` : ""}>`;

const accountCodeStep = (button) => `<div class="acc-form"><span class="acc-small">${accountT("Code sent to")} ${escHtml(accountForm.address)}</span>
  ${accountInput("acc-code", "text", "6-digit code", "one-time-code")}
  ${accountForm.kind === "reset" ? accountInput("acc-password", "password", "New password (8+ characters)", "new-password") : ""}
  <button class="acc-go" data-acc="verify">${accountT(button)}</button></div>`;

function accountEmailSignedOut() {
  const f = accountForm;
  if (f.stage === "code") return accountCodeStep(f.kind === "reset" ? "Set password" : "Confirm");
  const switches = (a, b) => `<div class="acc-row">${a}${b}</div>`;
  const to = (kind, label) => `<button class="acc-link" data-acc="to-${kind}">${accountT(label)}</button>`;
  if (f.kind === "register") {
    return `<div class="acc-form">${accountInput("acc-address", "email", "Email address", "email")}
      ${accountInput("acc-password", "password", "Password (8+ characters)", "new-password")}
      <button class="acc-go" data-acc="register">${accountT("Create account")}</button></div>
      ${switches(to("login", "I have an account"), "")}`;
  }
  if (f.kind === "reset") {
    return `<div class="acc-form">${accountInput("acc-address", "email", "Email address", "email")}
      <button class="acc-go" data-acc="reset">${accountT("Send code")}</button></div>
      ${switches(to("login", "Back to sign in"), "")}`;
  }
  return `<div class="acc-form">${accountInput("acc-address", "email", "Email address", "email")}
    ${accountInput("acc-password", "password", "Password", "current-password")}
    <button class="acc-go" data-acc="login">${accountT("Sign in")}</button></div>
    ${switches(to("register", "Create an account"), to("reset", "Forgot password"))}`;
}

function accountSignedOut(providers) {
  const third = ACCOUNT_SLOTS.filter((s) => s.id !== "email" && providers.includes(s.id))
    .map((s) => `<a class="acc-way" data-native href="${accountStart(s.id, "login")}">${accountT("Continue with")} ${s.name}</a>`).join("");
  const first = providers.includes("email")
    ? `${third ? `<div class="acc-or">${accountT("or with email")}</div>` : ""}${accountEmailSignedOut()}` : "";
  return `<div class="acc-h">${accountT("Sign in")}</div>
    <div class="acc-small">${accountT("Keeps your builds with you across devices. WFSim works the same without it.")}</div>${third}${first}`;
}

/// THE EMAIL ROW'S FORMS, signed in: a new address with its password, or a
/// new password for the address there is.
function accountEmailSignedIn(slot) {
  const f = accountForm;
  if (f.kind === "link") {
    if (f.stage === "code") return accountCodeStep("Confirm");
    return `<div class="acc-form">${accountInput("acc-address", "email", "Email address", "email")}
      ${accountInput("acc-password", "password", "Password (8+ characters)", "new-password")}
      <button class="acc-go" data-acc="link">${accountT("Send code")}</button></div>`;
  }
  if (f.kind === "password") {
    return `<div class="acc-form">${slot && slot.has_password
      ? accountInput("acc-current", "password", "Current password", "current-password") : ""}
      ${accountInput("acc-password", "password", "New password (8+ characters)", "new-password")}
      <button class="acc-go" data-acc="password">${accountT("Save password")}</button></div>`;
  }
  return "";
}

function accountSignedIn(account, providers) {
  const filled = account.identities.length;
  const rows = ACCOUNT_SLOTS.filter((s) => providers.includes(s.id) || account.identities.some((i) => i.provider === s.id))
    .map((s) => {
      const id = account.identities.find((i) => i.provider === s.id);
      const act = (label, how) => (s.id === "email"
        ? `<button class="acc-mini" data-acc="${how}">${accountT(label)}</button>`
        : `<a class="acc-mini" data-native href="${accountStart(s.id, "link")}">${accountT(label)}</a>`);
      const actions = id
        ? `${s.id === "email" ? act(id.has_password ? "Change password" : "Set password", "open-password") : ""}${
          providers.includes(s.id) ? act("Replace", "open-link") : ""}<button class="acc-mini" data-acc="unlink" data-p="${s.id}">${accountT("Remove")}</button>`
        : act("Link", "open-link");
      const label = id
        ? `${escHtml(id.label)}${s.id === "email" && !id.has_password ? ` <i>(${accountT("no password yet")})</i>` : ""}`
        : `<i>${accountT("not linked")}</i>`;
      const confirm = accountConfirm === s.id
        ? `<div class="acc-confirm">${accountT("This is your last way to sign in. Removing it deletes your account and everything synced to it.")}
            <button class="acc-danger" data-acc="unlink-delete" data-p="${s.id}">${accountT("Delete account")}</button>
            <button class="acc-mini" data-acc="cancel">${accountT("Cancel")}</button></div>` : "";
      return `<div class="acc-slot"><span class="acc-p">${s.name}</span><span class="acc-l">${label}</span>
        <span class="acc-a">${actions}</span></div>${confirm}${s.id === "email" ? accountEmailSignedIn(id) : ""}`;
    }).join("");
  const del = accountConfirm === "delete"
    ? `<div class="acc-confirm">${accountT("Delete your account and everything synced to it? This cannot be undone.")}
        <button class="acc-danger" data-acc="delete-yes">${accountT("Delete account")}</button>
        <button class="acc-mini" data-acc="cancel">${accountT("Cancel")}</button></div>` : "";
  return `<div class="acc-h">${accountT("Your account")}</div>
    <div class="acc-small">${accountT("Ways to sign in")} (${filled}/${ACCOUNT_SLOTS.length})</div>${rows}
    <div class="acc-row"><button class="acc-mini" data-acc="logout">${accountT("Sign out")}</button>
      <button class="acc-mini" data-acc="export">${accountT("Download my data")}</button>
      <button class="acc-mini acc-warn" data-acc="delete">${accountT("Delete account")}</button></div>${del}`;
}

/// A form's answer: a mailed code moves it to its code step; anything else is
/// said, and a success reloads the account.
async function accountSent(r) {
  if (r && r.ok && r.sent) {
    accountForm = { ...accountForm, stage: "code", address: accountVal("acc-address").trim() };
  } else if (r && r.ok) {
    accountForm = { kind: "login", stage: "form", address: "" };
    accountSay(r.outcome);
    await loadAccount();
    return true;
  } else {
    accountSay((r && r.reason) || "send_failed", true);
  }
  return false;
}

async function accountAct(el) {
  const what = el.dataset.acc;
  const p = el.dataset.p;
  accountNote = null;
  const email = () => accountVal("acc-address");
  const password = () => accountVal("acc-password");
  if (what.startsWith("to-")) {
    accountForm = { kind: what.slice(3), stage: "form", address: "" };
  } else if (what === "open-link" || what === "open-password") {
    const kind = what.slice(5);
    accountForm = accountForm.kind === kind ? { kind: "login", stage: "form", address: "" } : { kind, stage: "form", address: "" };
  } else if (what === "login") {
    if (await accountSent(await accountCall("POST", "/api/auth/email/login", { email: email(), password: password() }))) return;
  } else if (what === "register" || what === "link") {
    if (await accountSent(await accountCall("POST", `/api/auth/email/${what}`, { email: email(), password: password() }))) return;
  } else if (what === "reset") {
    if (await accountSent(await accountCall("POST", "/api/auth/email/reset", { email: email() }))) return;
  } else if (what === "verify") {
    const r = await accountCall("POST", "/api/auth/email/verify", {
      email: accountForm.address, code: accountVal("acc-code"),
      ...(accountForm.kind === "reset" ? { password: password() } : {}),
    });
    if (await accountSent(r && r.ok ? { ...r, sent: false } : r)) return;
  } else if (what === "password") {
    const r = await accountCall("POST", "/api/account/password", { current: accountVal("acc-current"), password: password() });
    if (await accountSent(r && r.ok ? { ...r, sent: false } : r)) return;
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
    accountForm = { kind: "login", stage: "form", address: "" };
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
  const panel = $("account-panel");
  panel.addEventListener("click", (e) => {
    const el = e.target.closest("[data-acc]");
    if (el) { e.preventDefault(); accountAct(el); }
  });
  // ENTER SUBMITS the form it is typed in: the form's own button, as if clicked.
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("input")) return;
    const go = e.target.closest(".acc-form") && e.target.closest(".acc-form").querySelector(".acc-go");
    if (go) { e.preventDefault(); accountAct(go); }
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
