# Accounts

An account is optional. Everything WFSim does works without one, and a reader
who never signs in has the site exactly as it was. What an account adds is a
place for a person's own things to live beyond one browser, and a holder for
anything paid.

## The model

**AN ACCOUNT IS A UUID, reached through four SLOTS**: Google, Discord, GitHub,
and an email address with a password — the first-party way in. At most one of
each. So there are two ways to sign in: a third party in one click, or an
address and its password.

**MAIL GOES OUT ONLY TO PROVE AN ADDRESS** — to register one, to link one, to
reset its password. Signing in with a password sends nothing. No account exists
until a registration's code comes back, so an address nobody proved never
becomes an account.

| rule | where it is held |
| --- | --- |
| a slot is `(provider, subject)`: the provider's own id for the person; for email, the address lowercased | `identities` primary key |
| one slot per provider per account | `UNIQUE (account, provider)` |
| a slot belongs to one account at most | the primary key — so nothing can be merged by accident |
| the account lives while a slot is filled | trigger `identities_last_slot`, so every path that empties the last slot deletes the account, and by cascade its sessions and documents |
| a new account arrives with its first slot | one batch in `arrive` — no moment exists with a UUID and no way to reach it |

**THE SERVER NEVER MERGES.** An identity already on another account is refused
(`taken`), never moved. A matching email address means nothing: a Google
account whose address equals a linked email is a different slot and, signed in
first, a different account. Two accounts become one only by their owner
removing a way in from one and adding it to the other.

**Replacing a slot is an UPDATE**, not a delete and an insert: the slot is
never empty, so the last-slot trigger cannot fire half way through.

**Removing the last slot is deleting the account.** `/api/account/unlink`
refuses it with `last_slot` unless the call says `delete_account: true`, and
the panel asks for that inline — no native dialog.

Every way in ends in one function, `arrive` in `worker/accounts.js`, so no way
in can have its own idea of what linking means.

## Where it lives

`worker/accounts.js` behind the site's worker, `worker/accounts.sql` in its own
D1 database, `wfsim-accounts` — apart from `wfsim` (docs/NAMING.md §8), because a
point-in-time restore of one must not roll the other back, and because nothing
personal may reach the public `library-backups` branch, which reads `wfsim`.
D1 Time Travel is its backup: any minute of the last 30 days.

The page's panel is `web/src/static/app/17-account.js`. It draws only where
`/api/account` names a way in, so the dev server, the desktop shell and a site
whose secrets are not set draw no account control at all. Its links carry
`data-native`, which the app's client-side router leaves to the browser.

| endpoint | does |
| --- | --- |
| `GET /api/auth/<google\|discord\|github>/start?intent=login\|link&return=/path` | the OAuth round trip, PKCE and a signed state cookie |
| `GET /api/auth/<provider>/callback` | back to `return` with `auth=<outcome>` or `auth_error=<reason>` |
| `POST /api/auth/email/register` `{email, password}` | mails a code; `email_taken` if the address has an account |
| `POST /api/auth/email/link` `{email, password}` | signed in: mails a code to fill or replace the email slot |
| `POST /api/auth/email/reset` `{email}` | mails a code if the address has an account, and answers the same if not |
| `POST /api/auth/email/verify` `{email, code, password?}` | completes what the code was mailed for; five tries, ten minutes |
| `POST /api/auth/email/login` `{email, password}` | no mail; `wrong_credentials` alike for a wrong address or password, `locked` after five in fifteen minutes |
| `POST /api/account/password` `{current?, password}` | signed in: `current` where the slot has a password |
| `GET /api/account` | the account and its slots, and which ways in are configured |
| `POST /api/account/unlink` `{provider, delete_account?}` | empties a slot |
| `POST /api/account/delete`, `/api/account/export`, `/api/auth/logout` | as named |

A state-changing call is JSON from this origin; the session cookie is
`HttpOnly; Secure; SameSite=Lax`, a random token whose hash is the table's key.

## Privacy

Privacy at the level of an ordinary service: keep what the account needs,
state it at `/privacy` (written by `build_site_app.py`, `PRIVACY_BODY`), and
change that page in the commit that changes what is kept.

- A slot keeps the provider's id, a label shown to its owner (an address or a
  name) and when it was linked. Nothing else from a provider; the access token
  is read once for the id and dropped.
- A password is at least 8 characters and nothing more is asked of it. It is
  kept as PBKDF2-SHA256 at 100,000 rounds — a Worker's ceiling — over an HMAC
  keyed with `AUTH_SECRET`, so a copy of the table alone cannot test a guess.
  A reset or a change signs every other browser out.
- No IP address is written. The rate limit on the email endpoints keys on it in
  memory.
- An email address never travels in a URL and is never logged. The mail
  service's own delivery log holds the recipient for up to 30 days; its message
  preview stays off, so no code is retained there.
- **An account is never joined to the usage count or to a board submission.**
  Both pages promise that nothing about the reader travels with them, and the
  session cookie reaching those endpoints is never read by them.

## Setup

What the owner does once, and what each gives:

| what | where | then |
| --- | --- | --- |
| `AUTH_SECRET` | random, `wrangler secret put AUTH_SECRET` | signs the OAuth state and the code hashes; nothing works without it |
| Google | Google Cloud console, OAuth client, redirect `https://wfsim.app/api/auth/google/callback` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Discord | Discord developer portal, OAuth2, redirect `…/api/auth/discord/callback` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |
| GitHub | GitHub OAuth app, callback `…/api/auth/github/callback` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Email | Cloudflare Email Service: onboard `wfsim.app`, preview off | a `send_email` binding named `EMAIL` in `wrangler.jsonc`, sender `login@wfsim.app` |

A way in whose secrets are absent is simply not offered.

`scripts/check_accounts.mjs` runs these rules against the real schema in node's
own SQLite: no network, no browser.
