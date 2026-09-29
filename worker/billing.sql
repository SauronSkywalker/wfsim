-- BILLING, in the accounts database (docs/BILLING.md).
--
--   npx wrangler d1 execute wfsim-accounts --remote --file worker/billing.sql
--
-- STRIPE IS THE AUTHORITY on what was paid; these tables are its mirror, keyed
-- by our account, and rewritten whole from Stripe on every event and every
-- night (`sync` in worker/billing.js). What an account may USE is never stored:
-- it is derived from these rows and the catalog on each read, so a repackaged
-- offer reaches every buyer without a migration.

-- WHICH STRIPE CUSTOMER IS THIS ACCOUNT. Made before the first checkout, so
-- every payment Stripe reports names a customer we can place.
CREATE TABLE IF NOT EXISTS billing_customers (
  account   TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  customer  TEXT NOT NULL UNIQUE,
  synced_at TEXT
);

-- A SUBSCRIPTION AS STRIPE LAST DESCRIBED IT. `price` is the price's lookup
-- key, which is what the catalog names; `status` is Stripe's own word.
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                   TEXT PRIMARY KEY,
  account              TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  price                TEXT NOT NULL,
  status               TEXT NOT NULL,
  period_start         TEXT NOT NULL,
  period_end           TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0
);

-- A ONE-TIME PURCHASE, by its payment intent. A refund or a dispute of it
-- takes back what it added.
CREATE TABLE IF NOT EXISTS billing_purchases (
  payment_intent TEXT PRIMARY KEY,
  account        TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  price          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed')),
  created_at     TEXT NOT NULL
);

-- AN OFFER GIVEN WITHOUT A PAYMENT — a test account, a partner, a make-good.
-- Written by hand with wrangler; it lapses at `ends_at` on its own.
CREATE TABLE IF NOT EXISTS billing_grants (
  id         INTEGER PRIMARY KEY,
  account    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  offer      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  note       TEXT
);

-- WHAT A METERED FEATURE SPENT, and from which pot: `included` is the
-- subscription period's allowance, `pack` is bought credit. Deciding the pot
-- when the use happens is what makes both balances a plain sum.
CREATE TABLE IF NOT EXISTS billing_usage (
  id      INTEGER PRIMARY KEY,
  account TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  meter   TEXT NOT NULL,
  pot     TEXT NOT NULL CHECK (pot IN ('included', 'pack')),
  amount  INTEGER NOT NULL CHECK (amount > 0),
  at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_usage_by_account ON billing_usage (account, meter, pot, at);

-- EVERY STRIPE EVENT HANDLED, so a redelivery does nothing twice.
CREATE TABLE IF NOT EXISTS billing_events (
  id   TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at   TEXT NOT NULL
);
