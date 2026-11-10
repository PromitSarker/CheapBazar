# Work log

Notes on what was done to this project and its servers, newest first. No secrets are recorded here.
Commits are authored as `Claude <noreply@anthropic.com>` (owner's instruction, 2026-11-10).

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
