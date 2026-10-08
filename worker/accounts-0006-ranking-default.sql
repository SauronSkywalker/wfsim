-- ONE-OFF: the contribution ranking turned from opt-in to on by default, with a
-- way off. Applied once, after the worker that reads `contribution_hidden` is
-- live; a fresh database takes accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0006-ranking-default.sql
CREATE TABLE IF NOT EXISTS contribution_hidden (
  account   TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  hidden_at TEXT NOT NULL
);
DROP TABLE IF EXISTS contributors;
