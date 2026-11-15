# Cutover runbook: monolith (Neon) -> the 8 services

**Fast path: `deploy/cutover.sh --check`, then `deploy/cutover.sh`** (in your own terminal; it asks for the admin email/password and `TOPUP_INSTRUCTIONS`, backs everything up, rehearses on a fresh copy, migrates, verifies, switches the web app, smoke-tests, and puts the old setup back automatically if anything fails before the end). `deploy/rollback.sh` goes back afterwards. Defaults: `WALLETS=carry SEED_ACCOUNTS=lock`; override with env vars. The manual steps below are what the script automates.

Do NOT set `USE_SERVICES=true` before running this. Until then the live site keeps using Neon.
Plan for roughly 15 minutes of downtime. Everything below runs in `~/E-Bazar-Unified` (written for 103.228.38.69; the app has since moved to 103.228.38.77, see STATUS.md).

## Decisions to make first (the migration needs them)

| Decision | Flag / env | Default | Consequence |
|---|---|---|---|
| Seller wallets | `--wallets=carry\|zero` | `carry` | `carry` opens every wallet at its legacy balance (today every store holds the Prisma default of 4850 - a promo credit, not money anyone paid in). `zero` opens at 0. Since 2026-11-11 there is no COD fee and no balance threshold, so a wallet at 0 changes nothing about taking orders: the balance only matters for ads and withdrawals. |
| Seed accounts `admin@`/`demo@`/`buyer@storeforge.dev` (known weak passwords) | `--seed-accounts=lock\|drop` | `lock` | `lock` keeps the rows with an unguessable password (the admin loses ADMIN). `drop` deletes them and, for `demo@`, the Demo Bakery store and its products. |
| The real platform admin | `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 8), `ADMIN_NAME` | none | The ONLY legacy admin is the seed account, so without these there is no admin after cutover. |
| Platform payment account text | `TOPUP_INSTRUCTIONS` | empty | Shown on the seller top-up box and on /pro. |
| Buyer Pro price, ad slot prices | see step 7 | placeholders | |

## Before the window

1. Merge the stacked PRs into `main` (oldest first: fix/build-tsconfig, feat/deploy-services, ... feat/browse-pro-services) and pull on the server; `npm ci && npm run build`.
2. Rehearse on a fresh copy of live data, with the exact flags you will use: `npm run migrate:rehearse -- --wallets=carry --seed-accounts=lock`. It must end with `REHEARSAL OK`. (It is read-only against Neon and deletes its copy afterwards.)
3. Check `public/uploads`: only png/jpg/jpeg/gif/webp are ever served (files with other extensions are not). On 2026-11-10 it held 2 PNGs.

## Window

```bash
cd ~/E-Bazar-Unified && set -a && . deploy/.env && . ./.env && set +a      # .env supplies DATABASE_URL = Neon
SRC="$DATABASE_URL"; unset DATABASE_URL

# 1. freeze writes: stop the monolith and the services
pm2 stop cheapbazar; pm2 stop cb-identity cb-catalog cb-order cb-payment cb-ledger cb-ad cb-aggregator cb-notification

# 2. fresh, EMPTY service databases (the e2e test data is thrown away)
for d in identity_db catalog_db orders_db payment_billing_db ledger_db ads_db search_db notifications_db; do
  docker exec cheapbazar-services-pg psql -U cheapbazar -d postgres -c "DROP DATABASE IF EXISTS $d WITH (FORCE)"
done
./deploy/setup.sh                       # recreates the databases + schemas (also starts the compose Postgres)

# 3. migrate. Dry run first - it prints the plan and any BLOCKER and writes nothing.
PGU="postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PG_PORT:-54330}"
export SOURCE_DATABASE_URL="$SRC" IDENTITY_DATABASE_URL="$PGU/identity_db" CATALOG_DATABASE_URL="$PGU/catalog_db" \
       ORDER_DATABASE_URL="$PGU/orders_db" LEDGER_DATABASE_URL="$PGU/ledger_db" AGGREGATOR_DATABASE_URL="$PGU/search_db"
export ADMIN_EMAIL=you@example.com ADMIN_NAME="Platform Admin"; read -rs -p "admin password: " ADMIN_PASSWORD; export ADMIN_PASSWORD
npm run migrate:dry   -- --wallets=carry --seed-accounts=lock
npm run migrate:apply -- --wallets=carry --seed-accounts=lock

# 4. start the services; they drain the migration events (wallets' status, search index)
pm2 start deploy/ecosystem.config.cjs          # or: pm2 restart all --only /cb-/
sleep 20 && npm run migrate:verify -- --wallets=carry --seed-accounts=lock     # must print ALL CHECKS PASSED
```

BLOCKERs the migration will refuse on (fix, then re-run): an online order still PENDING_PAYMENT, a withdrawal still PENDING or PROCESSING, legacy `PaymentTransaction` rows (review, then `--ignore-payments`), invalid slugs/domains, or non-empty service databases.

5. Set the web tier's environment in `.env` (the web app reads it at start):
   `USE_SERVICES=true`, `INTERNAL_AUTH_SECRET=<same value as deploy/.env>`, `TOPUP_INSTRUCTIONS="bKash 01XXXXXXXXX (personal) ..."`, and `COOKIE_INSECURE=true` while the site is served over plain http (drop it once there is HTTPS).
6. `pm2 restart cheapbazar --update-env`.
7. Set real prices (placeholders until then). Easiest: log in as the admin and use **/admin/billing** (Pricing & Revenue). The same via curl:
   ```bash
   H="authorization: Bearer $INTERNAL_AUTH_SECRET"
   curl -s -X POST -H "$H" -H 'content-type: application/json' http://127.0.0.1:4004/admin/plans \
     -d '{"code":"BUYER_PRO","price":499,"periodDays":30,"graceDays":3}'
   curl -s -X POST -H "$H" -H 'content-type: application/json' http://127.0.0.1:4006/admin/ads/slots \
     -d '{"code":"BROWSE_TOP","name":"Browse page - top banner","placement":"AGGREGATOR","capacity":2,"pricePerDay":800}'
   ```
8. Smoke test in a browser: log in as the new admin (/admin), a migrated seller (their old password still works), open a storefront, place a COD order, /browse, /pro.
   Everyone is logged out once (sessions are not migrated).

## Rolling back

Set `USE_SERVICES=false` in `.env`, `pm2 restart cheapbazar --update-env`. Neon was never written to, so the monolith comes back exactly as it was at step 1 - but anything done on the services path since the cutover (new orders, sign-ups, top-ups) lives only in the services' databases and is NOT in Neon. Decide quickly, or plan a reverse copy.

## After

Keep Neon as-is for a few weeks as the backup. Then retire the monolith data layer: remove `prisma/schema.prisma`'s runtime use, the flag-off code paths, `/api/payments/sslcommerz/*` in the web tier, and rotate the Neon credentials. pm2 on-boot persistence needs sudo: `pm2 startup` prints the one command to run, then `pm2 save`.
