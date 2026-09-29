-- ONE-OFF: the live `wfsim-accounts` brought up to `worker/accounts.sql` with
-- usernames. Applied once; a fresh database takes accounts.sql alone. Every
-- existing account is given its `user_` name here, as a new one is at birth.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0003-usernames.sql
ALTER TABLE accounts ADD COLUMN username TEXT;
ALTER TABLE accounts ADD COLUMN display_name TEXT;
ALTER TABLE accounts ADD COLUMN username_changed_at TEXT;
UPDATE accounts SET username = 'user_' || lower(hex(randomblob(3))) WHERE username IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username ON accounts (username);
CREATE TABLE IF NOT EXISTS username_holds (
  username   TEXT PRIMARY KEY,
  account    TEXT NOT NULL,
  held_until TEXT NOT NULL
);
