# Work log

Notes on what was done to this project and its servers, newest first. No secrets are recorded here.
Commits are authored as `Claude <noreply@anthropic.com>` (owner's instruction, 2026-11-10).

## 2026-11-10 (chunk 10): admin "Pricing & Revenue" screen, and revoking a bad Buyer Pro payment

- **Gap found:** an admin who approves a Buyer Pro manual payment whose transaction id turns out to be fake had no way to undo it. `chargeback` only works on gateway payments, and manual approvals have no gateway Payment row. Prices could only be set with curl.
- **payment-billing-service:** `POST /admin/manual-payments/:id/revoke` `{admin, reason}`. In ONE transaction: the payment becomes `REVOKED` (new enum value), its invoice is VOID, the time it bought comes off the subscription (access ends if none is left; if the buyer paid for two months and only one is revoked, access is shortened and stays ACTIVE), and a `PlatformRevenueReversed` event takes the revenue out of the ledger (idempotent on replay). The transaction id stays claimed, so it can never be submitted again. Wallet top-ups answer 409 `UNSUPPORTED` (ledger-service has no wallet clawback). A reason is required. Repeating a revoke is a no-op. `db push` was run on the live `payment_billing_db` to add the enum value (additive) and `cb-payment` restarted. 2 new contract tests (billing tests: 49, all services: 131).
- **`/admin/billing` ("Pricing & Revenue"; 404-equivalent notice while the flag is off):** Buyer Pro revenue (net, gross, reversed, last 30 days, paid invoices); platform books straight from the ledger (cash held, fees, ad and Buyer Pro revenue, opening balances); a form for the Buyer Pro price, period and grace days; one inline form per ad slot (price per day, capacity, on sale); Buyer Pro subscriptions with buyer names; approved Buyer Pro payments with a Revoke form (reason required). Nav: "Pricing & Revenue" (and the old "Top-up Review" link now says "Payment Review", matching the page).
- `src/lib/bff/admin.ts`: `billingOverviewViaServices`, `setBuyerProPlanViaServices`, `setAdSlotViaServices`, `revokeProPaymentViaServices`. This replaces the curl price-setting step in `deploy/CUTOVER.md` (the curl lines still work).
- `scripts/e2e-billing.mjs`: 15 checks, re-runnable and it restores the prices it changes: seller redirected; screen renders; negative plan price refused; plan saved and the buyer's /pro shows the new price; zero ad price refused; slot saved in ad-service; the approved payment is listed with the buyer's name; revoke needs a reason; revoke reverses the ledger revenue, ends Pro access, marks REVOKED, and the same trx id cannot be reused; a revoked payment leaves the approved list.
- `e2e-browse.mjs`: the home-page assertion expected one specific store card, but the card list is the 8 stores with the most products and the test database now holds dozens of test stores; it now only requires that store cards appear.
- Regression: checkout 9, portal 18, wallet 22, admin 21, ads 20, browse 21, billing 15; web unit 10; services 131; both typechecks clean. The web app was rebuilt and `cheapbazar` restarted (flag off, 200).
- Not done: refunds of online order payments from the UI (online payments are off); top-up clawback; a buyer order-history page; `HOME_HERO` ad spot; notification bell.

## 2026-11-10 (chunk 9): data migration Neon -> services, rehearsed, plus the cutover runbook

- **What the live database turned out to hold** (read-only look, nothing changed): 12 users (3 are the seed accounts), 5 stores, 7 products, **0 orders, 0 payments**, 4 test ledger rows, 1 payout method, 12 sessions. The only ADMIN is the seed `admin@storeforge.dev`, so there is no "real" admin to carry over: the migration creates one from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Every store wallet sits at the Prisma default of 4850 (a promo credit; the 4 ledger rows are SSLCommerz test top-ups). `public/uploads` holds 2 PNGs and nothing else.
- `scripts/migrate/neon-to-services.ts` (`npm run migrate:dry` / `migrate:apply`): reads the legacy DB through a forced read-only session and writes only the service databases. Dry run by default; `--apply` refuses a non-empty target, a target equal to the source, and a non-local target host. Carries users (password hashes untouched), stores, products, orders with items, fee snapshots and an event row, wallets (+ COD fee holds for in-flight COD orders), statement history, payout methods, withdrawals. Drops sessions. Seed accounts: `--seed-accounts=lock` (default; unguessable password, admin demoted) or `drop`. Wallets: `--wallets=carry` (default, opens at the legacy balance through a balanced OPENING_BALANCE ledger transaction against PLATFORM_EQUITY) or `zero`.
- Search index, wallet status enforcement and non-ACTIVE statuses are built by the services themselves from events the script writes to the identity / catalog / ledger outboxes, addressed to ledger, aggregator and ad ONLY (never notification, so nobody gets a welcome message for an existing store).
- Refuses (BLOCKER) on: online orders still PENDING_PAYMENT, withdrawals still PENDING/PROCESSING, legacy PaymentTransaction rows (unless `--ignore-payments`), invalid slug / template / domain, duplicates, and negative price or stock.
- `scripts/migrate/verify-migration.ts` (`npm run migrate:verify`): 22 read-only checks: counts, exact password hashes and roles, seeds do not keep their password or ADMIN, wallet balance == sum of ledger postings, trial balance debits == credits, one hold per in-flight COD order, outboxes drained, aggregator has every store and product, non-ACTIVE statuses reached the aggregator.
- `scripts/migrate/rehearse.sh` (`npm run migrate:rehearse -- <flags>`): copies live Neon (read-only) into a local database, adds a synthetic fixture to the COPY only (2 COD orders, a withdrawal, a suspended store), builds fresh throwaway service databases, dry-runs, applies, checks that a second apply is refused, starts the real services on :41xx (events to the unstarted services go to a dead port, never to the production services), verifies, and runs `smoke.mjs` through the real services: migrated seller logs in with the OLD bcrypt hash, wrong password rejected, seed accounts cannot log in with their documented passwords, the new admin logs in as ADMIN, wallet and statement, search finds a migrated product and hides a suspended store's, orders readable, a migrated order marked DELIVERED settles its carried fee hold. Afterwards it deletes the copy (it holds real customer data) unless `KEEP=1`.
- Rehearsed both ways: `carry` + `lock` (45 PASS) and `zero` + `drop` (REHEARSAL OK). Services 129, web 10, typecheck clean.
- Finding: with `--wallets=zero`, the rehearsal moved every active store to COD_BLOCKED at once (and the enforcer would pause then delist them after 72 h + 168 h without a top-up). That is the services' designed behaviour for an empty wallet; it is why `carry` is the default.
- Small change: `validateSlug` in identity-service is now exported so the migration applies the same slug rules.
- `deploy/CUTOVER.md`: decisions, pre-window checks, the exact command sequence (freeze, fresh DBs, dry run, apply, start services, verify, env, restart, prices, smoke test), what rolling back loses, and what to retire afterwards.
- NOT done / for the owner: nothing has been run against the production service databases. The real cutover needs the owner's choices above (admin email + password, wallets carry/zero, seed accounts lock/drop, `TOPUP_INSTRUCTIONS`, Buyer Pro and ad prices). `pm2 startup` (boot persistence) needs sudo.

## 2026-11-10 (chunk 8): marketplace, Buyer Pro and wholesale ordering (behind USE_SERVICES)

- `src/lib/bff/browse.ts`: marketplace search and store directory (aggregator-service), Buyer Pro plan, status and payment (payment-billing), live ads for marketplace slots (ad-service).
- **`/browse`** (404 while the flag is off): Retail and Wholesale tabs, search, store filter, sort, paging, `BROWSE_TOP` and `BROWSE_SIDEBAR` ad banners. The wholesale paywall is decided by aggregator-service from the viewer's id; the web tier never hides or reveals prices itself. A locked viewer gets a login or upgrade prompt and no wholesale price, minimum or tier anywhere in the HTML, and price sorting is ignored for them.
- **`/pro`** (Buyer Pro): plan price and period, current status, and a manual payment form (bKash, Nagad, Rocket or bank + transaction ID, 5 submissions per hour per user, idempotent). Access starts only when an admin approves it.
- **`/admin/topups` is now "Payment Review"**: it lists wallet top-ups (sellers) and Buyer Pro payments (buyers, with name and email) in one queue.
- **Wholesale ordering:** members get an "Order wholesale" form on `/browse`, posting to the same `/api/orders/create` with `orderType: WHOLESALE` (Cash on Delivery). Minimum quantity, volume-tier pricing, the Pro check and the COD cap are enforced by order-service.
- **Seller product form** now has a wholesale section on the services path (sold as retail / both / wholesale, wholesale price, MOQ, one optional volume discount). Before this, nothing in the UI could create a wholesale product. A tier at or below the MOQ, or not cheaper, is refused with a clear message.
- Header gets **Marketplace** (and **Buyer Pro** for logged-in non-admins) links on the services path. The home page lists stores (with two sample products each) from the aggregator.
- `scripts/e2e-browse.mjs`: 21 checks, re-runnable: bad wholesale tier refused; retail listing across stores; store filter; anonymous paywall with no leaked prices (also via price sort); home page from the aggregator; buyer without Pro sees the upgrade prompt and cannot order wholesale; /pro price and status; malformed transaction id refused; payment pending; no access before approval; admin sees it labelled Buyer Pro; approval activates Pro; member sees price, MOQ, tier and order button; below-MOQ refused; 20 units at the tier price = 1200, recorded as a wholesale order for the member; a live BROWSE_TOP ad is shown.
- Regression: checkout 9, portal 18, wallet 22, admin 21, ads 20, web unit 10, services 129.
- Not done: `HOME_HERO` ad slot has no place on the home page yet (LandingView is large, left alone); Buyer Pro price is still the 499 placeholder (owner sets it with `POST /admin/plans` on payment-billing); Buyer Pro auto-renewal; a buyer order-history page; online (SSLCommerz) wholesale payment.

## 2026-11-10 (chunk 7): ads on the services (behind USE_SERVICES)

- `src/lib/bff/ads.ts`: slots, a store's bookings, book / cancel, the live banner for a storefront, admin queue and review.
- **Seller `/dashboard/ads`** (services path): real slots and prices from ad-service, a booking form with a required banner image (validated by its bytes, stored under `/uploads/`), the store's own campaigns with status and a Cancel button for pending ones. Replaces the hard-coded mock campaigns. Pricing, date-collision checks, the pending cap and the wallet charge are all enforced by ad-service; the charge happens when an admin approves.
- **Admin `/admin/ads`** (services path): pending queue with store, creative thumbnail, dates and fee; Approve / Reject (reason required); list of reviewed and live ads. Replaces the mock tables.
- **Storefront banner:** the two templates take a `sponsored` prop. Services path: a real paid banner from another store, or no banner at all (an advertiser's own page shows none; an ad-service outage never breaks a storefront). Flag off: the old placeholder text, unchanged.
- **ad-service change:** `imageUrl` may now also be a platform-stored `/uploads/<generated-name>.(png|jpg|gif|webp)` path, because the site has no HTTPS domain yet and the service demanded an https URL. Any other path (`/etc/passwd`, `//host/x.png`, `/uploads/../x`, `.svg`) is still refused; 4 new assertions in `ad.test.ts` (ad tests: 21 pass).
- **Live bug found and fixed (also affects the monolith):** `next start` only serves files that were in `public/` when it started, so a product or ad image uploaded at runtime returned 404 until the next restart. Added `src/app/uploads/[name]/route.ts`, a strict fallback that serves `png/jpg/jpeg/gif/webp` from `public/uploads` with `nosniff` and a locked-down CSP. File-name checks reject traversal and SVG. Files already present at startup are still served statically.
- `scripts/e2e-ads.mjs`: 20 checks, re-runnable (it clears its own leftover ads first): real slots shown; missing image, SVG-as-PNG and bad dates refused; booking priced by the service (3 days x 400 = 1200); pending list; same-store overlap refused; upload served immediately; cancel; insufficient wallet refused; seller blocked from moderation; admin queue; reject needs a reason; approve charges 1200; no banner before start; scheduler starts the ad; another store's page shows the banner; own page does not; admin sees ACTIVE.
- The e2e scripts now use a random sign-up address per run so the identity rate limit does not trip when they are re-run.
- Not done: the aggregator ad slots (`HOME_HERO`, `BROWSE_*`) have nowhere to render until the `/browse` page exists; no impression or click counts; no refunds or takedowns (needs a refund policy decision).
- **Old uploads:** `public/uploads` in the repo contains two committed PNGs; anything an older build stored with another extension (for example `.svg`) would still be served statically. Worth a one-time look at the live uploads folder at cutover.

## 2026-11-10 (chunk 6): admin back-office on the services (behind USE_SERVICES)

- `src/lib/bff/admin.ts`: platform stats (identity + ledger + catalog), stores with owner/status/KYC/product counts, store status and KYC changes, users and role changes, payout queue and review, bulk CSV exports, manual top-up review. Every function re-checks `ADMIN` and records the acting admin's email as the audit actor.
- `modules/admin/service.ts`, the payouts page, `/api/admin/payouts` and its CSV export delegate to it when the flag is on. Store status lives in the ledger wallet; KYC lives in identity.
- **New page `/admin/topups`** (nav link shown only on the services path): pending manual top-ups with store, amount, method and transaction ID, Approve / Reject (a reason is required to reject), and a recent-decisions list. Approval credits the seller's wallet through the ledger.
- **Behaviour fix on the services path:** the monolith's KYC toggle also forced the store back to ACTIVE (it would un-suspend a suspended store). The services path changes KYC only.
- Admin actions now show the service's error text instead of failing silently (for example "a permanent ban cannot be lifted", "cannot demote the last remaining admin", "a rejection needs a written reason").
- Fixed the manual top-up response mapping in `bff/wallet.ts` (the service returns `{ payment }`, so the seller API now reports the real status and reference).
- `scripts/e2e-admin.mjs`: 21 checks pass: seller blocked from /admin and from the payout API and export; overview; stores list; suspend takes the storefront down; KYC toggle keeps it suspended; reinstate; ban cannot be lifted; users list; role change; last admin protected; payout queue; bKash CSV; approve needs a reference; approve; no double processing; reject refunds the wallet; top-up queue; approve credits ৳300; reject needs a reason; rejected credits nothing.
- Regression: `e2e-wallet.mjs` (22), `e2e-portal.mjs` (18), `e2e-checkout.mjs` (9) pass.
- **Still on Neon even with the flag on:** `/admin/ads` and `/dashboard/ads` (ad-service is not wired yet). Keep the flag OFF in production until ads, and the cutover migration (which must carry the real admin account), are done.

## 2026-11-10 (chunk 5): wallet, payouts, overview, settings on the services (behind USE_SERVICES)

- `src/lib/bff/wallet.ts`: wallet snapshot and statement, payout methods, withdrawals (ledger-service), manual top-ups (payment-billing), store settings (identity).
- Wallet page, `/api/wallet/withdraw`, `/api/wallet/payout-methods`, dashboard overview and the settings action each have a services branch. Rules (minimum withdrawal 500, 500 reserve, one active request, 24 h payout cooling-off, scoped to the seller's store) are enforced by ledger-service, not the web tier.
- **Top-ups are manual on the services path** because online payment is off: the seller pays the platform (bKash/Nagad/Rocket/bank/cash), submits the amount, method and transaction id (`POST /api/wallet/topup`, 10 per store per hour), an admin approves it in payment-billing, and the ledger credits the wallet. One idempotency key per (store, method, trxId), so a double click never makes two payments. `WalletView` shows these fields when `manualTopUp` is set. Set `TOPUP_INSTRUCTIONS` in `.env` to the platform's payment account text shown to sellers; it is empty today.
- `/api/payments/sslcommerz/init` returns 400 when `USE_SERVICES=true`.
- Settings (name, URL, template, custom domain) go to identity-service; a taken URL or domain shows the existing error messages.
- `scripts/e2e-wallet.mjs`: 22 checks pass (minimum top-up, manual top-up, no double payment, no credit before approval, credit after approval, bad phone, payout account added, cooling-off lock, minimum withdrawal, reserve, withdrawal, second request refused, summary, listing, payout in use, rename, URL taken, custom domain, online off, no session). The test back-dates the cooling-off with one SQL update in the throwaway ledger database through `docker exec`.
- Regression: `e2e-checkout.mjs` (9) and `e2e-portal.mjs` (18) still pass.
- **Still on Neon even with the flag on, so keep the flag OFF in production:** `/admin/*` (stores, users, payouts, ads), `/dashboard/ads`, and the admin screens that approve manual top-ups (today an admin must call `PATCH /admin/manual-payments/:id/review` on payment-billing directly).

## 2026-11-10 (chunk 4): seller side on the services (behind USE_SERVICES)

Login, signup, onboarding, the dashboard shell, products and orders now have a services path. Flag off (the live setting) = monolith, unchanged.

- `src/lib/bff/portal.ts`: store for owner / by slug or domain (identity + ledger status), products (catalog), orders and status changes (order-service, `source: SELLER`).
- Auth: `getCurrentUser` and `destroySession` switch to identity-service sessions; signup and login actions call identity (rate limits and bcrypt live in the service; the address is passed through). New messages for rate-limited / unavailable. Password minimum is 8 on the services path (the form hint follows the flag).
- Onboarding creates the store in identity-service (slug-taken handled).
- Products page and actions use catalog-service. Image validation still runs first. Deleting a product that has orders is refused (`error=in-use`, bilingual message); set stock to 0 instead.
- Orders page lists from order-service. `POST /api/orders/status` calls the order state machine; the ledger settles or releases the COD hold and the catalog restocks through events, so the UI text "ledger & stock adjusted" is now eventually true, not instant.
- `scripts/e2e-portal.mjs`: drives the real forms over HTTP (server actions, cookie jar). 18 checks pass: signup, duplicate email, onboarding, dashboard, add product with a real PNG, SVG-as-PNG rejected, byte-derived extension, seller sees the order, illegal jump refused, SHIPPED, DELIVERED, hold settled (fee 30 on 600), no-session refused, stock +5, in-use delete refused, redirect to login, wrong password, right password.
- `scripts/e2e-checkout.mjs` (chunk 3) still passes.
- **Not on the services yet** (these pages still read Neon even with the flag on, so do NOT turn the flag on in production until they are done): dashboard overview, wallet and payouts (`/api/wallet/*`), ads, settings, all of `/admin`.
- The test left a few 12-byte PNG files in `public/uploads/`; they were removed.

## 2026-11-10 (chunk 3): storefront and checkout on the services (behind USE_SERVICES)

Rewired the public storefront, checkout and order confirmation page to the services. All of it is behind `USE_SERVICES=true`; with the flag off (the live setting) the pages use the monolith exactly as before.

- `src/lib/bff/storefront.ts`: store from identity (`/tenants/resolve`, custom domain then slug), status from ledger, products from catalog (RETAIL channel). Same view model the templates already use.
- `src/lib/bff/orders.ts`: `placeOrderViaServices` keeps the cart drawer's contract (`{success, redirectUrl, orderNumber}` or `{error}`); prices, stock, fee and wallet hold are decided by order-service. `getOrderViewViaServices` backs the order page and refuses an order shown under another store's URL.
- `/api/orders/create`: rate limits run first, then the services path when the flag is on. The logged-in buyer (if any) comes from identity-service.
- The order confirmation page loads through one `loadOrder()` with a monolith branch and a services branch, sharing one view model.
- `scripts/e2e-checkout.mjs`: end-to-end smoke test. Start a second web instance with the flag on (`USE_SERVICES=true INTERNAL_AUTH_SECRET=... npm start -- -p 3100`), then run `INTERNAL_AUTH_SECRET=... node scripts/e2e-checkout.mjs`. It seeds its own seller, store and product in the services' databases (never Neon). 9 checks pass: storefront render, 404s, COD order, confirmation page, stock 5 to 3, 5% fee hold (25 on 500), oversell rejected, negative quantity rejected.
- Verified: typecheck clean; live site (flag off) still 200 on home, storefront and login. The temporary test instance on :3100 was stopped.
- Not done in this chunk: online (SSLCommerz) checkout through payment-billing (switched off), buyer login pages on the services, seller order status updates (`/api/orders/status`), middleware custom-domain lookup.

## 2026-11-10 (chunk 2): web-tier security and service client

Built the first part of the web-tier ("BFF") layer. Nothing here switches the live site to the services.

- `src/lib/security/ratelimit.ts`: fixed-window in-memory `RateLimiter` and `clientIp()`.
- `src/lib/security/uploads.ts`: image validation by magic bytes (PNG, JPEG, GIF, WebP), 5 MB cap, SVG/HTML rejected, extension derived from the bytes.
- `src/lib/bff/client.ts`: server-side `callService()` with the internal bearer token, timeout, typed errors. `servicesEnabled()` reads `USE_SERVICES` (default off).
- `src/lib/bff/session.ts`: login, register, session check and logout through identity-service (httpOnly cookie, hashed token server-side). **Not wired into any page yet.**
- Tests: `npm run test:web` (10 tests, all pass). Test files live in `tests/web/` and are excluded from the Next tsconfig.
- Applied to the LIVE monolith (fixes from the audit):
  - Product image upload (`dashboard/products/actions.ts`) no longer trusts the file name or extension (audit #13, stored XSS). New bilingual error message "image".
  - `POST /api/orders/create` is rate limited per IP, per phone and per store (audit #8, COD griefing). Per-IP is skipped when no address is known, so direct visitors are not lumped into one bucket. Smoke test: 10 requests pass, the 11th gets 429.
- Rebuilt and restarted `cheapbazar` on 103.228.38.69. Home, login, signup and a storefront return 200.

**Finding (not changed):** the live Neon database contains the seed accounts `admin@storeforge.dev` (ADMIN), `demo@storeforge.dev` (SELLER) and `buyer@storeforge.dev` (BUYER). The seed script gives them known weak passwords. Rotate or delete them. 12 users and 5 stores in total. I did not try the passwords and did not modify any data.

## 2026-11-10 (chunk 1): deployment of the 8 services

- `deploy/`: `docker-compose.yml` (Postgres 16, container `cheapbazar-services-pg`, 127.0.0.1:54330, 512 MB limit), `gen-env.sh` (random secrets into gitignored `deploy/.env`), `setup.sh` (creates 8 databases, pushes schemas), `ecosystem.config.cjs` (pm2), `README.md`.
- Services run under pm2 as `cb-identity|catalog|order|payment|ledger|ad|aggregator|notification` on 127.0.0.1:4001-4008. They use their own databases, not Neon.
- All 129 service tests pass against that Postgres. Calls without the internal token get 401.
- Test command: `TEST_PG_ADMIN_URL=postgresql://cheapbazar:$PG_PASSWORD@127.0.0.1:54330/postgres npm run test:services` (the tests leave `*_test` databases behind; drop them afterwards).
- Fixed `next build` by excluding `packages/` and `services/` from the root tsconfig (they use `tsconfig.services.json`).

## 2026-11-10: move to 103.228.38.69

- Owner wanted CheapBazar to run ONLY on 103.228.38.69. This repo is `~/E-Bazar-Unified` there (`ssh ebazar-vps`).
- Installed dependencies, copied `.env` (same live Neon `DATABASE_URL`), built, started pm2 `cheapbazar` on :3000.
- On the old machine (103.228.39.38): deleted the pm2 `cheapbazar` process and saved the empty list, stopped the local test Postgres (:54329). `~/CheapBazar` there is a stale copy.
- New address: `http://103.228.38.69:3000` (was `http://103.228.39.38:3000`). Anything pointing at the old address (domain, SSLCommerz return/IPN URLs) needs updating.
- pm2 is not set to start on boot (needs sudo). After a reboot run `pm2 resurrect`.
- The server also runs unrelated apps (den-api, den-web and many containers). They were not touched.

## 2026-11-10: git history and GitHub

- The microservices work (commits `1c3bc29`, `2fd7410`) was rewritten to be authored by `Claude <noreply@anthropic.com>` with no co-author trailer. It was merged to `main` on GitHub as PR #1.
- Pushed to GitHub with a dedicated SSH key on the old machine (`~/.ssh/github_cheapbazar`), added by the owner to their GitHub account. The server itself has no GitHub write access (its `origin` is https).
- Branches pushed: `fix/build-tsconfig`, `feat/deploy-services`. Pull requests are opened by the owner.
- The old machine's `~/.ssh/config` has entries `ebazar-vps` (103.228.38.69, key `uitl_vps`) and `github.com`.

## Earlier state of the project

- 8 microservices (identity, catalog, order, payment-billing, ledger, ad, aggregator, notification) built COD-first, 129 tests, per `MICROSERVICES_ARCHITECTURE.md`.
- The live site is still the Next.js monolith talking to Neon. See `REMAINING_WORK.md` for what is left.

## Next

1. Rewire the web pages to the services behind `USE_SERVICES`: storefront and checkout first, then merchant portal, admin, `/browse`, ads.
2. New screens: Buyer Pro upgrade, admin payment review, revenue, notification bell, refunds.
3. Data migration from Neon (rehearse on a copy), cutover, retire the monolith data layer.
4. Owner decisions: Buyer Pro price, ad slot prices, whether the 5% COD fee / top-ups / ad fees stay, ad refund policy.
