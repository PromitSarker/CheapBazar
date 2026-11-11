# CheapBazar: where things stand

Last updated 2026-11-11. This is the page to read when you come back. The detailed, dated diary is `WORK_LOG.md`;
the step-by-step cutover is `deploy/CUTOVER.md`. Nothing here contains secrets.

## In one paragraph

CheapBazar is being moved from one Next.js app on the Neon database to 8 small services. **All 8 services are built, run on this
server (103.228.38.69) and have 131 passing tests. Every screen (buyers, sellers, admin) has a version that talks to the services,
switched by `USE_SERVICES`.** The flag is **OFF**, so the **live site is still the old app on Neon, unchanged for users**.
The data migration is written and rehearsed on copies of the live data. **What is left is the cutover itself, which needs you.**

## Changed 2026-11-11: no COD fee, no wallet thresholds

The 5% COD platform fee, the wallet soft/hard thresholds, the pause/delist timers and the ৳500 reserve bond are **removed** (services and legacy site). A store's status is now admin-only (ACTIVE / SUSPENDED / BANNED). Two small steps are still pending and need you (details in `WORK_LOG.md`, 2026-11-11):
1. Apply the ledger schema cleanup: `DATABASE_URL=<ledger_db url> npx prisma db push --schema services/ledger-service/prisma/schema.prisma --accept-data-loss` (test data only; backups are in `~/db-backups-2026-11-11-fee-removal/`). Works fine without it for now.
2. `pm2 restart cheapbazar` so the LIVE site stops charging the fee (the new build is already on disk).
Also re-run `npm run migrate:rehearse` before the cutover: it has not been run since this change.

## What you need to do (nothing else blocks go-live)

1. Merge the pull requests, oldest first (list below). The server already has all the code; this is for GitHub.
2. Decide the open questions in the next section (defaults are fine).
3. On the server run `./deploy/cutover.sh --check`, then `./deploy/cutover.sh` in your own terminal. It asks for the real admin
   email and password (typed by you). About 10 to 15 minutes of downtime. It restores the old site by itself if anything fails
   before the end; `./deploy/rollback.sh` goes back afterwards.
4. After it: log in as the new admin, open **/admin/billing** and set the real Buyer Pro and ad prices; run `pm2 startup`
   (needs sudo, once) so everything restarts after a reboot.

## Open decisions (defaults in bold; the cutover script uses them unless you say otherwise)

| # | Question | Default |
|---|----------|---------|
| 1 | Real platform admin email + password. **The only admin in the live database is the seed `admin@storeforge.dev` with a known weak password**, so without this nobody could administer the new system. | none: you type it into the script |
| 2 | Seller wallets: keep each store's current ৳4,850 (`carry`) or open at 0 (`zero`). Low stakes now (the COD fee and thresholds are gone): the balance only pays for ads and can be withdrawn. The ৳4,850 is the old app's default starting credit, not money anyone paid in. | **carry** |
| 3 | The 3 seed accounts (admin@, demo@, buyer@storeforge.dev): `lock` (keep rows, nobody can log in; admin loses admin rights) or `drop` (delete them and the Demo Bakery store). | **lock** |
| 4 | **Answered 2026-11-11: the 5% COD fee and the wallet thresholds are removed.** Seller wallet top-ups and paid ads still exist (the wallet pays for ads). Still open: whether online orders carry a commission (`ONLINE_FEE_PERCENTAGE`, default 0). | wallet top-ups + ads stay |
| 5 | Text telling people where to send manual payments (bKash/Nagad/bank number): `TOPUP_INSTRUCTIONS`. Shown on the seller wallet and on /pro. | asked by the script (can be empty, but then the page says "ask support") |
| 6 | Real prices: Buyer Pro (placeholder ৳499 / 30 days / 3 days grace) and the 4 ad slots (placeholders ৳300 to ৳1500 per day). | set in /admin/billing after cutover |
| 7 | Refund / takedown policy for ads and refunds for delivered orders (not built, needs your rules). | none |

## Done (all behind `USE_SERVICES`, which is off)

| Area | What exists |
|------|-------------|
| 8 services | identity, catalog, order, payment-billing, ledger, ad, aggregator (search), notification; own database each; event bus with retries; 131 tests |
| Deployment | `deploy/`: Postgres in Docker, pm2 process file, setup script; services listen on 127.0.0.1 only; secrets in `deploy/.env` (not in git) |
| Storefront + checkout | storefront pages, cart, COD checkout, order confirmation, rate limits, upload validation |
| Seller dashboard | sign-up/onboarding, products (incl. wholesale fields), orders, wallet + payouts + manual top-up, settings, ads booking, overview |
| Admin | stores/KYC/suspension, users/roles, payouts + CSV export, **Payment Review** (top-ups + Buyer Pro), **ad moderation**, **Pricing & Revenue** (prices, revenue, ledger books, revoke a bad Buyer Pro payment) |
| Buyers | **/browse** marketplace (retail + wholesale, ads), **/pro** Buyer Pro (manual payment), wholesale ordering, **/orders** (my orders + cancel), **notification bell + inbox**, home-page hero ads |
| Migration | `scripts/migrate/`: dry run, apply, 22 verification checks, rehearsal on a throwaway copy, smoke test. Rehearsed repeatedly on live data; reads Neon only |
| Cutover | `deploy/cutover.sh`, `deploy/rollback.sh`, `deploy/CUTOVER.md` |
| Live-site fixes made along the way | stored-XSS via image upload; COD order spam (rate limits); runtime-uploaded images returned 404 until restart |

Test status on 2026-11-10: services 131, web unit 11, end to end: checkout 9, seller portal 18, wallet 22, admin 21, ads 20,
browse 24, billing 15, my orders 16, bell 15. Re-run any of them with `node scripts/e2e-<name>.mjs` (see WORK_LOG.md for setup).

## Not done, and why

| Item | Why it is not done |
|------|--------------------|
| **The cutover itself** | needs your admin password and a go-ahead; the script is written but has never been run end to end on production (every part was tested separately) |
| Buyer Pro auto-renewal | today buyers pay by hand each period (grace days, then wholesale locks). Auto-charging needs an online payment method and your decision |
| Online card/bKash checkout (SSLCommerz) | the old code is kept but switched off ("COD first"). Needs your SSLCommerz account and a go-ahead |
| Courier, SMS and email sending | messages are stored and shown in-app; SMS/email are logged as "skipped" until you supply provider accounts (courier webhook endpoint exists) |
| Wallet top-up clawback, refund of a delivered order | needs a refund policy from you (#7) |
| Ad takedown/refund | same |
| Notification bell live updates | the count refreshes when the page changes; no push notifications |
| Retiring the old code | after a few weeks on the new system: remove the old database layer and the flag-off code paths; rotate the Neon credentials |
| `pm2 startup` | needs sudo once |
| HTTPS / domain | the site is on plain http at the server IP; `COOKIE_INSECURE=true` is set for that. Add a domain + certificate, then remove the flag |

## GitHub branches (stacked: each contains the one before; the last has everything)

fix/build-tsconfig, feat/deploy-services, feat/web-security-bff, feat/storefront-checkout-services, feat/seller-portal-services,
feat/wallet-services, feat/admin-services, feat/ads-services, feat/browse-pro-services, feat/migration-cutover,
feat/admin-billing, feat/buyer-orders, feat/notification-bell, feat/home-hero-ad, **feat/cutover-script** (tip).
Open the PR for each from `https://github.com/PromitSarker/CheapBazar/pull/new/<branch>`. Merging the tip alone brings everything.
All commits are authored by `Claude <noreply@anthropic.com>`.

## Where things are

- Server: `ssh ebazar-vps`, repo `~/E-Bazar-Unified`. The live site is pm2 `cheapbazar` on port 3000; services are pm2 `cb-*` on ports 4001 to 4008 (internal only).
- The old machine (103.228.39.38) does not run the app; `~/CheapBazar` there is a stale copy kept only to push to GitHub.
- Backups made by the cutover script go to `~/cutover-backups/<time>/` on the server.
