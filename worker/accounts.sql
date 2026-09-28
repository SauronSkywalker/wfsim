-- THE ACCOUNTS DATABASE — `wfsim-accounts`, apart from `wfsim` (docs/ACCOUNTS.md).
--
--   npx wrangler d1 create wfsim-accounts
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts.sql
--
-- APART, because D1 restores a whole database to a point in time, and a restore
-- of one must not roll the other back; and because nothing in here may ever
-- reach the public library backup, which reads `wfsim`.

-- A PERSON, and nothing about them but when the account began. Everything that
-- says who they are is a slot below.
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- THE FOUR WAYS IN, at most one of each per account. `subject` is the
-- provider's own id for the person — for `email`, the address, lowercased —
-- and (provider, subject) belongs to one account at most, which is what makes a
-- merge impossible to do by accident. `label` is only what the account page
-- shows the person: a name, or the address.
CREATE TABLE IF NOT EXISTS identities (
  provider  TEXT NOT NULL CHECK (provider IN ('google', 'discord', 'github', 'email')),
  subject   TEXT NOT NULL,
  account   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject),
  UNIQUE (account, provider)
);

-- AN ACCOUNT LIVES WHILE A SLOT IS FILLED. Stated here rather than in the
-- worker, so every path that empties the last slot takes the account with it —
-- and, by cascade, its sessions and its documents.
CREATE TRIGGER IF NOT EXISTS identities_last_slot AFTER DELETE ON identities
WHEN NOT EXISTS (SELECT 1 FROM identities WHERE account = OLD.account)
BEGIN
  DELETE FROM accounts WHERE id = OLD.account;
END;

-- A SIGNED-IN BROWSER. The cookie carries a random token; this keeps its hash,
-- so a copy of the table signs nobody in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- A CODE MAILED AND NOT YET USED, one per address; its HMAC, never the code.
-- Deleted when it is used.
CREATE TABLE IF NOT EXISTS email_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    TEXT NOT NULL
);
