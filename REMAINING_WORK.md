# CheapBazar: Status and Remaining Work

> **Analysis date:** 2026-11-08
> **Branch:** `feature/phase3-6-cod-first`
> **Sources:** `IMPLEMENTATION_TRACKER.md`, `MICROSERVICES_ARCHITECTURE.md`, and a direct read of the repo.
> **Verified:** `npm run typecheck:services` passes.
> **Not verified:** the 129 integration tests were not re-run (they need a local Postgres on `:54329`, which is not running now). That count is from the tracker. The live app was not opened.

## Summary

The backend is done and the web app does not use it yet. All 8 microservices are built and typecheck clean, but the live site (Next.js under pm2 as `cheapbazar` on :3000) still runs the old monolith and calls none of them.

## What exists

| Part | State |
|---|---|
| `packages/service-kit`, `packages/event-bus` | Done, about 630 lines. No tests of their own, only coverage through the services. |
| 8 services (identity, catalog, order, payment-billing, ledger, ad, aggregator, notification) | Done, about 5,800 lines of source and 3,100 lines of tests. They cover the order flow, double-entry ledger, store status rules, Buyer Pro paywall, ads and notifications. |
| Legacy web app (`src/`) | About 9,400 lines, live. 12 pages, storefront, merchant dashboard, admin pages, SSLCommerz routes, edge middleware. |

| Service | Port | Database | Tests |
|---|---:|---|---:|
| identity-service | 4001 | `identity_db` | 9 |
| catalog-service | 4002 | `catalog_db` | 8 |
| order-service | 4003 | `orders_db` | 13 |
| payment-billing-service | 4004 | `payment_billing_db` | 47 |
| ledger-service | 4005 | `ledger_db` | 11 |
| ad-service | 4006 | `ads_db` | 25 |
| aggregator-service | 4007 | `search_db` | 7 |
| notification-service | 4008 | `notifications_db` | 9 |

## What is left to develop

### 1. Connect the web app to the services (biggest gap, not started)

- **Backend-for-frontend layer in Next.js:** sessions through identity-service, rate limiting, upload validation.
- **Pages to rewire, in this order:**
  1. Storefront and cart/checkout to `order-service`
  2. Merchant portal: products, orders, wallet, payouts
  3. Admin: stores, users, payouts, status changes
  4. New `/browse` page (Retail and Wholesale tabs, Pro paywall upsell). The search API is done, the page is not.
  5. Ads: `/dashboard/ads` and `/admin/ads` are still hard-coded mock data.
- **New pages that do not exist yet:**
  - Buyer Pro upgrade page
  - Admin manual-payment review
  - Admin revenue view
  - Notification bell
  - Admin refund/chargeback screen
- **Sponsored banners:** none render on storefronts or `/browse` yet.
- **Translations:** every new screen needs English and Bengali strings.

### 2. Deployment (mostly done 2026-11-10)

- **Done:** `deploy/` has a Postgres compose file (localhost only, port 54330), `gen-env.sh` (random secrets into a gitignored `deploy/.env`), `setup.sh` (creates the 8 databases and pushes the schemas), `ecosystem.config.cjs` (pm2, 8 services on 127.0.0.1:4001-4008) and a README.
- **Verified on 103.228.38.69:** all 129 tests pass against that Postgres, all 8 services are online and answer `/health`, and requests without the internal token get 401.
- **Still open:**
  - Web-tier gateway/edge config, CDN and WAF.
  - Per-service `.env` split (all services share one `deploy/.env` for now).
  - The event transport is signed HTTP. A RabbitMQ or Redis Streams transport is a drop-in behind an interface. The ad cache is in-memory (Redis needed for more than one `ad-service` instance).
  - pm2 is not set to start on boot (needs sudo).

### 3. Data migration and cutover (not started)

- **Migration script** from the live Neon database into the per-service databases:
  - users and stores to identity
  - wallets and ledger to the ledger, as opening-balance entries
  - products to catalog
  - orders to order
- **Aggregator backfill:** a "re-publish all products" admin action.
- **Cutover and retirement** of the monolith's data layer.
- **Behavior change:** the old free ৳4,850 starting wallet is gone. New sellers start at ৳0. Since 2026-11-11 there is no COD fee and no balance threshold, so a ৳0 wallet still takes orders; it is only needed for ads.

### 4. Decisions only the owner can make

- **Real Buyer Pro price:** currently a placeholder of ৳499. Set it with `POST /admin/plans`.
- **Ad slot prices:** the four default slots (`HOME_HERO`, `BROWSE_TOP`, `BROWSE_SIDEBAR`, `STOREFRONT_BANNER`) use placeholder prices. Set them with `POST /admin/ads/slots`.
- **Retail-side money flows:** the 5% COD fee and the wallet thresholds were removed on 2026-11-11. Still open: whether online payments should be wholesale-only.
- **Ad refunds and takedowns:** not built, and this needs a refund policy decision first.

### 5. External integrations that need credentials

- Courier adapters (Pathao, RedX, Steadfast). Only a generic signed webhook exists, so `ALLOW_SELLER_FINALIZE` is still `true`.
- An SMS provider account and an email domain for Resend. Without them, messages are logged as skipped.
- SSLCommerz online payments are built but switched off (`ONLINE_PAYMENTS_ENABLED=false`).

### 6. Smaller backend gaps

- **Identity:** no 2FA, social login, or JWT/refresh tokens (opaque hashed session tokens are used).
- **Catalog:** no product variants.
- **Billing:**
  - no Buyer Pro auto-renewal
  - no partial refunds
  - no refunds or chargebacks for wallet top-ups
  - no per-order invoices
- **Late payments:** a payment that arrives after an order was cancelled is only logged. Nothing detects it automatically.
- **Tracking:** no ad impression or click counts.
- **Search:** Postgres trigram search instead of Meilisearch.

## Risks to know about now

- **The live monolith still has all 15 audit findings.** The new services fix most of them, but production gets none of those fixes until cutover. They include:
  - withdrawal race that can overdraw a wallet
  - overselling on online orders
  - SSLCommerz IPN signature check that always returns `true`
  - unauthenticated payment-status changes
  - no rate limit on order creation (COD griefing)
  - product upload trusts the client's file extension (stored XSS)
  - plaintext session tokens
- **Seed accounts:** `prisma/seed.mjs` creates `admin@storeforge.dev`, `demo@storeforge.dev` and `buyer@storeforge.dev` with known weak passwords. If `db:seed` was ever run against the live database, those logins are live. Check and remove them.
- **Pending in the web tier:** rate limiting (audit #8) and upload validation (audit #13) cannot be fixed in the services. They must be built in the new web layer.
- **Commits:** all service work is committed and merged to `main` (PR #1).
- **Migration risk:** the cutover moves real money balances out of the live Neon database, so rehearse it on a copy first.
- **Never run `db push` or the tests against the live Neon database.** The tests refuse non-local hosts.

## Suggested order

1. Commit the current work (pick the git identity, since none is configured on this server).
2. Write the deploy files and bring up all 8 services locally with real env files.
3. Build the Next.js backend-for-frontend layer, with rate limiting and upload validation.
4. Rewire the pages in the order in section 1, starting with storefront and checkout.
5. Write and rehearse the data migration on a copy of the Neon data.
6. Cut over, then retire the monolith.

Work is done one chunk at a time, pausing after each for a "continue" from the owner.
