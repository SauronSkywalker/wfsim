-- ONE-OFF: the live `wfsim-accounts` brought up to `worker/accounts.sql` with
-- agent keys. Applied once; a fresh database takes accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0004-agents.sql
CREATE TABLE IF NOT EXISTS agent_keys (
  id               TEXT PRIMARY KEY,
  key_hash         TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  last_used_at     TEXT,
  account          TEXT REFERENCES accounts (id) ON DELETE CASCADE,
  claimed_at       TEXT,
  claim_email      TEXT,
  claim_code_hash  TEXT,
  claim_expires_at TEXT,
  claim_sent_at    TEXT,
  claim_attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS agent_keys_by_account ON agent_keys (account);
