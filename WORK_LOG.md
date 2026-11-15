# Work log

Notes on what was done to this project and its servers, newest first. No secrets are recorded here.
Commits are authored as `Claude <noreply@anthropic.com>` (owner's instruction, 2026-11-10).

## 2026-11-11 (later): pending steps done, rehearsal re-run, installable web app (PWA)

- Owner gave permission rules, so: `ledger_db` schema pushed (dropped `Wallet.holds`, `lastAlertAt`, table `Hold`, trimmed `StoreStatus`); `pm2 restart cheapbazar` done, so the LIVE site now runs the no-COD-fee code (still the monolith on Neon, `USE_SERVICES` off). `migrate:rehearse -- --wallets=carry --seed-accounts=lock` re-run on a fresh copy of Neon: **REHEARSAL OK** (all checks + smoke).
- Owner asked for "the app": chose an **installable web app (PWA)**; no domain yet. Added `public/manifest.webmanifest`, icons (`public/icons/`, rendered from `icon.svg` with ImageMagick on the server), `public/sw.js` (conservative: never caches pages, `/api` or `/uploads`; only build assets and icons; shows `/offline.html` when offline), `src/components/pwa/RegisterSW.tsx`, `/app` page with install steps + an Install button, footer link "Get the app", theme colour and apple-touch icon in the layout.
- Limits: browsers only register the service worker and offer one-tap **Install** on HTTPS (or localhost). On plain `http://103.228.38.69:3000` the manifest still lets Android Chrome use "Add to Home screen" (a shortcut) and iPhone Safari "Add to Home Screen". For full install: get a domain, point an A record at 103.228.38.69, put HTTPS in front (nginx + certbot; needs sudo), then remove `COOKIE_INSECURE=true`.
- Not built: a native Android/iOS app (owner chose PWA).

## 2026-11-11: COD fee, wallet thresholds and reserve bond removed

Owner: "remove the cod fee and threshold thing. I dont need that."

- **Gone:** the 5% platform fee on Cash on Delivery orders; the per-order fee hold on the seller wallet (and its settle/release on delivery or cancel); the soft/hard wallet thresholds and the whole Store Status Enforcer (WARNING, COD_BLOCKED, PAUSED, DELISTED, the 72 h / 168 h grace timers, the background sweep, `POST /admin/enforcer/run`); the ৳500 reserve bond on withdrawals; the "low balance" notification.
- **Now:** a store's status is admin-only (ACTIVE, SUSPENDED, BANNED). A seller with a ৳0 wallet still takes COD orders. The wallet only pays for ads and can be withdrawn in full (minimum withdrawal ৳500 is unchanged). COD orders carry platformFee 0 and sellerNet = total.
- **Kept on purpose:** an optional commission on ONLINE-paid orders only, `ONLINE_FEE_PERCENTAGE` (default 0), so the switched-off SSLCommerz path still has its split settlement. The wholesale COD cap (৳50,000) is unchanged.
- **Services:** ledger (holds, enforcer, thresholds, daemon removed; new `storeStatus.ts` = admin suspend/ban/reinstate only; status API no longer returns `holds`, `thresholds`, `codAllowed`; `available` = `balance`), order (no fee for COD, no `placeHold`/`releaseHold`, `OrderFeeSnapshot.codFeeHold` dropped), aggregator and ad-service (a store is hidden / blocked only when SUSPENDED or BANNED), notification (BalanceLow and the PAUSED/DELISTED copy removed, COD delivered message no longer mentions a fee), event topology (`BalanceLow`, `WalletHold*` removed).
- **Web:** wallet dashboard shows only Total and Eligible to Withdraw (no holds, reserve or threshold cards), admin store-status dropdown is ACTIVE/SUSPENDED/BANNED, `StoreStatus` type trimmed, unused i18n keys removed. **The legacy monolith routes are changed too:** `/api/orders/create` (no fee, no COD block), `/api/orders/status` (no wallet movement on COD), `/api/wallet/withdraw` (no reserve), SSLCommerz top-up (no status restore).
- **Migration:** legacy COD orders migrate with platformFee 0; no holds are created; WARNING / COD_BLOCKED / PAUSED / DELISTED become ACTIVE (only SUSPENDED / BANNED are carried). Rehearsal fixture, verify and smoke scripts updated. **The migration rehearsal was NOT re-run after this change.**
- **Tests:** services 126 pass (was 131: the hold and enforcer tests were removed and replaced by "status is admin-only" tests); web unit not touched; e2e all green against a throwaway :3100 instance: checkout 10, portal 18, wallet 22, admin 21, ads 20, browse 24, billing 15, my orders 16, bell 15. `typecheck:services` and the web `tsc` are clean.
- **Deployed:** sources synced; services cb-ledger / cb-order / cb-aggregator / cb-ad / cb-notification restarted on the new code and healthy; `orders_db` schema pushed; `search_db` and `ledger_db` statuses normalised to ACTIVE; `next build` done. Backups of the three service DBs are in `~/db-backups-2026-11-11-fee-removal/`.
- **NOT done (blocked, needs the owner):** (1) `prisma db push --accept-data-loss` on `ledger_db` (drops `Wallet.holds`, `Wallet.lastAlertAt`, table `Hold`, enum `HoldStatus`, and trims `StoreStatus` to ACTIVE/SUSPENDED/BANNED); the new ledger code runs fine against the old schema until then. (2) `pm2 restart cheapbazar`: the live site still runs the OLD monolith code in memory (COD fee still applied there) although the new build is on disk.
- Incident worth knowing: the old running cb-ledger daemon kept moving the normalised test wallets back to WARNING / COD_BLOCKED, which is why the first ledger push failed (the enum cannot shrink while rows use the old values). cb-ledger is now on the new code, so that cannot recur.

## 2026-11-10 (chunk 14): guided cutover script and rollback (nothing cut over yet)

- Owner said "keep as it is" for the open choices, which I read as: keep the defaults (`--wallets=carry`, `--seed-accounts=lock`, retail money flows stay, prices stay as the placeholders until set in /admin/billing). Not read as permission to take the live site down: the real cutover also needs the admin email and password, which only the owner should type.
- Re-ran the full rehearsal on fresh live data with the defaults: `REHEARSAL OK`.
- `deploy/cutover.sh --check`: preflight (all 8 services healthy, Neon readable, build fresh, nothing already cut over) plus the migration dry run. Safe to run any time. Run on the server: CHECK OK.
- `deploy/cutover.sh` (interactive; refuses to run without a terminal): asks for the admin email, name, password twice, `TOPUP_INSTRUCTIONS`, and a typed `CUTOVER`; saves backups to `~/cutover-backups/<time>/` (`.env`, every legacy Neon table as CSV, dumps of the current service databases); rehearses on a copy with the exact flags; stops the site and services; recreates empty service databases; dry-runs and applies the migration; starts the services and waits for the event outboxes to drain; runs the 22 verification checks; writes `USE_SERVICES`, `INTERNAL_AUTH_SECRET`, `TOPUP_INSTRUCTIONS` (and `COOKIE_INSECURE` while the site is plain http) into `.env`; restarts the web app; smoke-tests (new admin logs in as ADMIN, `/`, `/browse`, `/login`, `/signup` and every storefront return 200). Any failure before the end restores the old `.env` and restarts the site on the monolith automatically (Neon is only ever read). It only counts as done after the smoke test passes.
- `deploy/rollback.sh`: after a completed cutover, restores the pre-cutover `.env` (after a typed `ROLLBACK`) and restarts the web app. Tested only for its no-backup guard.
- The `.env` writer was tested through Next's own env loader. Found and fixed: dotenv does not unescape `\` or `\"`, so those are stripped/replaced (`"` becomes `'`) and `$` is escaped, otherwise a payment-instructions text with quotes or a taka sign would be stored wrongly.
- **Not tested end to end on production**, on purpose: it takes the live site down. Its parts were each proven: preflight and dry run on the server, the migration/verify/smoke sequence in the rehearsal, `setup.sh` earlier, the env writer, the rollback guard. The first real run is therefore the first full run of the glue between them; that is why every step before the final one auto-restores the site.

## 2026-11-10 (chunk 13): HOME_HERO ad spot on the home page (behind USE_SERVICES)

- The `HOME_HERO` ad slot (marketplace home, capacity 3, placeholder ৳1500/day) was sellable in the dashboard and moderated in /admin/ads, but nothing displayed it. The home page now shows up to three live HOME_HERO banners, labelled "Sponsored" / "স্পনসরড", in a strip between the hero and the feature section, i.e. above the sample-store cards. They use the same `SponsoredBanner` as the storefront and /browse (`rel="sponsored noopener"`).
- `src/app/page.tsx` fetches `marketplaceAds("HOME_HERO")` (1.5 s timeout, fails to no ads, so an ad outage never breaks the home page) and passes `heroAds` to `LandingView`. Flag off: the prop is empty and the page is exactly as before. No service changed.
- `scripts/e2e-browse.mjs` is now 24 checks: a pending HOME_HERO booking is not shown; an approved and started one is shown, labelled Sponsored, with `rel="sponsored"`, above the stores section. (The test tops up the seller's wallet first because the slot costs more than the earlier test balances.)
- Regression: checkout 9, portal 18, wallet 22, admin 21, ads 20, billing 15, my orders 16, bell 15, web unit 11, typecheck clean. Web rebuilt, `cheapbazar` restarted (flag off, 200, no ads markup).
- Everything with a user-facing screen now has a services version. Remaining "not built" items are product decisions or need outside accounts: Buyer Pro auto-renewal, online checkout, courier / SMS / email providers, wallet top-up clawback, delivered-order refunds.

## 2026-11-10 (chunk 12): notification bell and inbox (behind USE_SERVICES)

- **Bell in the header** (logged-in users, services path only): a 🔔 with a red unread-count badge (99+ cap) linking to `/notifications`. The root layout asks notification-service for the count with a 1.2 s timeout and falls back to 0, so a notification outage can never slow down or break a page.
- **`/notifications`** (404 while the flag is off; login required): the user's inbox, newest first, unread items marked with a blue edge, in English or Bengali following the `sf_lang` cookie (the service stores both). "Open" marks the item read and goes to its page (order list, wallet, ads, products...); "Mark all as read" clears the lot and disappears when nothing is unread.
- **Safety:** the user id always comes from the session. "Open" looks the notification up in THAT user's own inbox and follows the link stored with it, never one posted in the form, so another user posting your notification id does nothing. Links are checked by `safeLink`: only same-site paths; `//host`, `https://`, `javascript:` and similar are ignored (the item is just marked read and the user stays on the inbox). Unit test `tests/web/notifications.test.ts` (web unit: 11).
- `src/lib/bff/notifications.ts`, `src/app/notifications/{page,actions}`, `SiteHeader` (`unread` prop), root `layout.tsx`. No service code changed; the notification service already had the inbox API, templates and dedupe.
- `scripts/e2e-bell.mjs`: 15 checks, re-runnable: the shop-created notification arrives through the real event bus; bell shows a count; anonymous sees no bell; a buyer's order notifies the seller; inbox lists it; another user cannot mark or follow it and does not see it; Open redirects to /dashboard/orders and marks it read; the count drops by one; an off-site link is ignored; Bengali copy via cookie; Mark all clears everything; badge disappears but the bell stays; the button hides.
- Regression: checkout 9, portal 18, wallet 22, admin 21, ads 20, browse 21, billing 15, my orders 16, web unit 11, services 131, typecheck clean. Web rebuilt and `cheapbazar` restarted (flag off: 200, no bell).
- Not done: live updating without a page load (the count refreshes on each navigation); push / browser notifications; per-user notification preferences; SMS and email providers are still unconfigured (those deliveries are logged as SKIPPED, never reported as sent).

## 2026-11-10 (chunk 11): buyer "My orders" with self-service cancel (behind USE_SERVICES)

- **`/orders`** (404 while the flag is off; login required): every order the signed-in user placed while logged in, newest first: order number (links to the existing confirmation page), store, date, Cash on Delivery label, a Wholesale tag, status, total, items, courier + tracking number once shipped. Orders placed as a guest are not listed (they have no owner); the empty state says so.
- **Cancel:** a "Cancel this order" button while the order is CONFIRMED (or awaiting payment). The web tier takes the user from the session, never from the form, and order-service enforces that only the buyer who placed the order may cancel it (source BUYER). Cancelling returns the stock to the shop and releases the seller's 5% COD fee hold through the normal events. order-service would also let a buyer cancel while PROCESSING; the UI deliberately does not offer that (the seller may already have packed it).
- Header: **My orders** link for logged-in non-admins on the services path. `src/lib/bff/orders.ts`: `myOrdersViaServices`, `cancelMyOrderViaServices`.
- **Bug fixed:** the Buyer Pro notification emails/links pointed at `/account/pro`, a page that does not exist. They now point at `/pro` (notification-service template; `cb-notification` restarted).
- `scripts/e2e-myorders.mjs`: 16 checks, re-runnable: anonymous sent to log in; empty state; header link; guest order not listed; both buyer orders listed with items, store and payment method, newest first; another buyer sees none of them; another user's forged cancel is refused; the buyer's own cancel works; stock returns 16 -> 18; the fee hold is released; list shows Cancelled; a shipped order shows tracking and no button; a forged cancel of a shipped order is refused.
- Regression: checkout 9, portal 18, wallet 22, admin 21, ads 20, browse 21, billing 15, web unit 10, services 131, typecheck clean. Web rebuilt, `cheapbazar` restarted (flag off, 200; `/orders` is 404 while off).
- Not done: refund of a delivered order; buyer-side order status notifications in the page (the notification bell is the next piece); cancelling part of an order.

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

## 2026-11-14: mobile app committed

- Committed the mobile work (commit `eab9c87`): Flutter app in `mobile/`, mobile API `src/lib/mobile` + `src/app/api/m/v1/*`, buyer account deletion in identity-service (10 identity tests), `/app` APK download page and `/downloads` route, `deploy/publish-apk.sh`, `.github/workflows/mobile.yml`. The PWA files were removed.
- Signing key and `key.properties` live outside git (`~/dev/keys/`, ignored). Checked the staged diff for secrets before committing.
- Release APK build restarted under `~/dev/capped.sh` (CPU/memory capped); log `/tmp/apk-build.log`. The first attempt was killed when the session was stopped.

## 2026-11-15: moved to 103.228.38.77, in-app update check

- Moved the whole stack from 103.228.38.69 to 103.228.38.77: repo (with unpushed commits), secrets, uploads, 8 databases (pg_dump/pg_restore,
  row counts compared before and after a final sync with the old app stopped), Docker + Node 22 + pm2 installed, pm2/Docker start on boot.
  Old server: CheapBazar pm2 apps stopped, data kept.
- Mobile: default API base URL is now the new server; Settings > About > "Check for updates" (reads /downloads/latest.json, opens the APK
  download); `publish-apk.sh` writes `build` into latest.json. `flutter analyze` clean, 17 tests pass.
- Added `deploy/backup.sh` (manual; cron not installed).

## 2026-11-15: domain + HTTPS
- cheapbazar.org (Cloudflare DNS, DNS-only for now) -> 103.228.38.77. nginx site /etc/nginx/sites-available/cheapbazar proxies to :3000. Let's Encrypt cert for cheapbazar.org (apex only; add www: create DNS record, then certbot --expand), auto-renews via certbot.timer. HSTS + security headers + gzip + Cloudflare real-IP (so the rate limiter sees visitors if the proxy is turned on).
- APP_DOMAIN=cheapbazar.org in .env (middleware treats it as the platform host; it is read at BUILD time, so rebuild after changing it). COOKIE_INSECURE removed (session cookies are Secure now). deploy/.env APP_URL=https://cheapbazar.org.
- Mobile default base URL, live_check, README, CI workflow now https://cheapbazar.org. Installed APKs still call http://103.228.38.77:3000, so port 3000 stays open until a new APK has shipped through the in-app update.
- Locked the seed/throwaway logins (admin@/demo@/buyer@storeforge.dev, test-shop@example.test): random bcrypt password, sessions deleted. Nightly backup cron 03:15; offsite pull to the old machine 04:30.

## 2026-11-15: categories + richer products (Phase 1 of the Arogga-style app)
- catalog-service: admin-only two-level Category tree (GET /categories public, /admin/categories CRUD; parent immutable; delete only when empty, else hide). Starter retail tree (11 departments, 32 sub-categories, Bengali + English, Material icon keys) seeded once when the table is empty; the admin owns it afterwards. Product gained categoryId/parentCategoryId, brand, unit, compareAtPrice (strictly above price), images[] (max 8, cover = first). PATCH is backwards compatible with the single-image field.
- aggregator-service: ListingIndex columns + indexes; search takes categoryId (top-level matches its children), brand, onSale, sort=discount; items return images/discountPct/compareAtPrice/category; facets: stores, categories, brands (each ignores its own filter). Wholesale paywall unchanged (no sale price, no leaks).
- Live DBs updated by hand with ADDITIVE SQL only. Do NOT run prisma db push on search_db: it would DROP the manual trigram index listing_search_trgm (not in the Prisma schema). Existing 7 products have no category yet (admin/seller must assign).
- 134 services tests pass. Next (Phase 2): mobile Home, category grid, ProductCard v2, sticky cart bar; BFF endpoints /categories and category/brand params on /browse.

## 2026-11-15: categories phase 2 - the app (v1.1.0+2) + mobile API
- Mobile API (additive; old apps keep working): GET /api/m/v1/categories (admin tree + live counts, 60 s cache, serves last good copy on outage); /home now also returns categories + shelves (deals, new, 3 busiest departments; empty shelves dropped; old items/stores/ads keys kept); /browse takes category, brand, sale=1, sort=discount and returns category + brand facets. src/lib/bff/catalog.ts.
- Flutter app 1.1.0+2: new Home (search, banner dots, category grid, shelves, skeletons), Categories tab (department rail + sub-category grid), Browse as a pushed screen (category chips, On sale, Biggest discount, sticky bag bar), ProductCard with discount badge / was-price / ADD -> stepper (retail only; wholesale + out-of-stock have no ADD), product page gallery + you-save + breadcrumb, en+bn. Bottom nav: Home, Categories, Bag, Orders, Account (Shop tab became a screen).
- Tests: 14 web (3 new), 31 Flutter (14 new) run on ebazar-vps (~/mobile-dev; flutter test + analyze clean).
- Needs a NEW APK (build on ebazar-vps from GitHub, then deploy/publish-apk.sh). Installed 1.0.0 apps keep working unchanged.
- Data: the 7 existing products have no category yet, so every department count is 0 and Home shows only the New shelf until sellers/admin assign categories (Phase 4 UI).

## 2026-11-15: categories phases 3 + 4 (BUILT, TESTED, NOT YET DEPLOYED)
- Phase 3 (app + mobile API): filter sheet (brand, price, in stock, on sale) with removable chips; search suggestions (product names + matching categories) and on-device recent searches; product page loads the live listing and shows similar products. Aggregator: GET /aggregator/products/:id and /aggregator/suggest. Mobile API: GET /products/:id, GET /search/suggest.
- Phase 4 (web): admin /admin/categories (add/rename/Bangla name/icon/sort/hide/delete-when-empty + a work-list of products with no category, one-click filing); seller manual product form (category 2-step, brand, pack size, original price, up to 8 photos), new Edit product page (/dashboard/products/[id]), optional CSV import (/dashboard/products/import: template, preview, per-row errors, skips duplicate names; max 300 rows / 1 MB; images by https URL only, never fetched server-side). Catalog: GET /admin/products?uncategorized=true, productCount on the admin tree.
- Tests: services 137, web 23, Flutter 41; flutter analyze + next build clean. No DB schema change.
- DEPLOY (not run): in ~/E-Bazar-Unified: git merge --ff-only feat/catalogue-phase3-4; pm2 restart cb-catalog cb-aggregator --update-env; npm run build; pm2 restart cheapbazar --update-env.
