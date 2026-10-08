-- ONE-OFF: the contribution ranking turned anonymous by default, a name shown
-- only by the account's own choice. Applied once, after the worker that reads
-- `contribution_choice` is live; a fresh database takes accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0007-ranking-anonymous.sql
CREATE TABLE IF NOT EXISTS contribution_choice (
  account   TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  named     INTEGER NOT NULL,
  chosen_at TEXT NOT NULL
);
DROP TABLE IF EXISTS contribution_hidden;
