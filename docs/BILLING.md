# Billing

Paid features sit on top of an account (`docs/ACCOUNTS.md`); everything free
stays free and needs neither. Stripe takes the money through **Managed
Payments**: Link is the seller of record, so Stripe handles sales tax and VAT,
fraud, disputes, receipts, invoices, refund mail and payment support. WFSim keeps
one thing straight — what each account has paid for — and derives from it what
the account may use.

## The model

**STRIPE IS THE AUTHORITY; THE TABLES ARE ITS MIRROR.** An event is a hint that
a customer changed. The handler fetches that customer's subscriptions and
rewrites the mirror whole, and a nightly cron re-reads every customer the same
way, least recently synced first. A lost, repeated or reordered event costs a
delay, never a wrong answer.

**WHAT AN ACCOUNT MAY USE IS DERIVED, NEVER STORED.** `entitlements()` reads
the mirror and `CATALOG` (both in `worker/billing.js`) on every call. A feature
asks `hasFeature(env, account, "<feature>")` or spends with
`consume(env, account, "<meter>", n)` — never "is this a member" — so
repackaging an offer is an edit to the catalog and nothing a feature reads.

**THE CATALOG NAMES PRICES BY LOOKUP KEY**, the key set on each price in the
Stripe dashboard. Test and live mode share the table, and a new price is a new
Stripe price under the same key.

| offer field | meaning |
| --- | --- |
| `kind` | `subscription` or `one_time` |
| `prices` | the lookup keys that sell it |
| `features` | switched on while it is held |
| `included` | `{ meter: n }` per subscription period, reset each period |
| `adds` | `{ meter: n }` of one-time credit, kept until spent |
| `days` | a one-time offer that holds its features this long |

## The rules

| rule | where it is held |
| --- | --- |
| access while Stripe says `active`, `trialing` or `past_due` (its retry window) | `ACCESS` |
| a period past its end with no word from Stripe still counts three days, then not | `GRACE_SECONDS` |
| only the webhook grants; returning from checkout grants nothing | `webhook` → `sync` |
| a full refund or a dispute ends what the money bought: a subscription now, a one-time purchase's credit and days | `reverse` |
| a partial refund changes nothing | `charge.refunded` reads `refunded` |
| an account is not sold a subscription it holds | `checkout` → `already_subscribed` |
| use spends the period's allowance first, then bought credit, all or nothing | `consume`, `billing_usage.pot` |
| deleting an account cancels its subscriptions at Stripe first; if one cannot be cancelled the account is kept | `endBilling`, `billing_open` |
| Stripe erasing a customer at their request clears the mirror | `customer.deleted` |
| an offer given without payment lapses on its own | `billing_grants.ends_at` |
| every event is handled once; a failed handling is a 500 so Stripe retries | `billing_events` |

Two uses racing can both pass on one balance. At this scale that is a few units
over, taken from the next period.

## Endpoints

| endpoint | does |
| --- | --- |
| `GET /api/billing` | whether billing is configured, the prices on sale, and for a signed-in reader their features, meters and what they hold |
| `GET /api/billing/invoices` | the reader's receipts and invoices, with Stripe's hosted and PDF links |
| `POST /api/billing/checkout` `{price}` | a Checkout Session with `managed_payments[enabled]`, for the reader's own Stripe customer |
| `POST /api/billing/portal` | Stripe's customer portal, to change or cancel |
| `POST /api/stripe/webhook` | signed events: `t` and `v1` over `t.body`, five minutes' tolerance |

The page draws a **Membership and billing** section on `/account` only when
`/api/billing` says billing is configured. `/terms` and `/refunds` are plain
pages beside `/privacy`, written by `build_site_app.py`.

## Setup

| what | where |
| --- | --- |
| the tables | `npx wrangler d1 execute wfsim-accounts --remote --file worker/billing.sql` |
| `STRIPE_SECRET_KEY` | a restricted key: Customers, Checkout Sessions, Subscriptions, Prices, Invoices, Charges read, Customer portal write; `wrangler secret put` |
| `STRIPE_WEBHOOK_SECRET` | the signing secret of an endpoint at `https://wfsim.app/api/stripe/webhook` on API version `2025-03-31.basil` or later |
| webhook events | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `customer.deleted` |
| products | a tax code marked *Eligible for Managed Payments* (software sold over the web is `txcd_10103000`), and on each price the lookup key the catalog names |
| customer portal | enabled in the dashboard, with cancellation allowed |
| the nightly sync | `triggers.crons` in `wrangler.jsonc` |

Nothing is on sale until a price with a catalog key exists in Stripe; the page
then offers it with no deploy.

`scripts/check_billing.mjs` runs these rules against the real schema with
Stripe stubbed at `fetch`: no network, no browser.
