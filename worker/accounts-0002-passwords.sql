-- ONE-OFF: the live `wfsim-accounts`, created before passwords, brought up to
-- `worker/accounts.sql`. Applied once; a fresh database takes accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0002-passwords.sql
ALTER TABLE identities ADD COLUMN password_hash TEXT;
DROP TABLE IF EXISTS email_codes;
CREATE TABLE email_codes (
  email         TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  sent_at       TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'register' CHECK (purpose IN ('register', 'link', 'reset')),
  password_hash TEXT,
  account       TEXT
);
CREATE TABLE IF NOT EXISTS login_failures (
  email    TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  first_at TEXT NOT NULL
);
