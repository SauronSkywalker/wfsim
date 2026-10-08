-- ONE-OFF: a claimed device gets the name its owner calls it by. Applied once,
-- before the worker that writes `label` is live; a fresh database takes
-- accounts.sql alone.
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/accounts-0008-device-labels.sql
ALTER TABLE devices ADD COLUMN label TEXT;
