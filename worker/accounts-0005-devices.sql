-- ONE-OFF: the live `wfsim-accounts` brought up to `worker/accounts.sql` with
-- claimed devices and the contribution ranking's opt-in. Applied once; a fresh
-- database takes accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0005-devices.sql
CREATE TABLE IF NOT EXISTS devices (
  verifier   TEXT PRIMARY KEY,
  account    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_by_account ON devices (account);
CREATE TABLE IF NOT EXISTS contributors (
  account  TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  shown_at TEXT NOT NULL
);
