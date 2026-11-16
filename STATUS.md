# CheapBazar: where things stand

Last updated 2026-11-14. This is the page to read when you come back. The detailed, dated diary is `WORK_LOG.md`;
the step-by-step cutover is `deploy/CUTOVER.md`. Nothing here contains secrets.

## In one paragraph

CheapBazar runs as 8 small services on this server (103.228.38.77), 131 tests. **The cutover was done on 2026-11-11** (backup in
`~/cutover-backups/20261111-064358`, `USE_SERVICES="true"` in `.env`, data migrated: 13 users, 5 stores, 7 products). The live site now
runs on the services; the old Neon database is only a read-only fallback. **What is left is in `PLATFORM_REVIEW.md`** (2026-11-14 review):
HTTPS, rate-limit fix, backups, reboot persistence, firewall first. The cutover steps and open-decision tables below are historical.

## In progress 2026-11-16: location-based shops (branch `feat/location-radius`, not live yet)

Admin picks how far buyers can see shops (`/admin/location`, default OFF); sellers must pin their shop at sign-up (web onboarding) and can edit it in Settings; the website and the Flutter app ask buyers for their location. Built and tested (see the 2026-11-16 entry in `WORK_LOG.md` for details, decisions and the go-live steps). **Order matters when going live: deploy, publish the new APK, ask the existing sellers to add a pin, THEN switch the limit on.**

## Moved 2026-11-15: new server 103.228.38.77

Everything (web app, 8 services, the 8 databases, uploads, secrets, release signing key copy) moved from 103.228.38.69 to **103.228.38.77**
(`ssh cheapbazar-vps`). pm2 and Docker restart on boot there. On the old server the CheapBazar pm2 apps are **stopped, not deleted**
(`pm2 start cheapbazar cb-identity cb-catalog cb-order cb-payment cb-ledger cb-ad cb-aggregator cb-notification` to roll back, after
`pm2 stop all` here, because two copies must not run at once). The old server's repo and Postgres volume are still there; delete them once you
are happy. `den-api` / `den-web` on the old server are unrelated.

- The Flutter + Android SDK toolchain is still only on the old server (`~/dev`). Build the APK there, or build from GitHub anywhere with
  `--dart-define=API_BASE_URL=https://cheapbazar.org` (this is also the new default in `mobile/lib/config.dart`).
- **Publishing an APK** (so /app and the in-app "Check for updates" see it): bump `version:` in `mobile/pubspec.yaml` and `AppConfig.version/build`
  in `mobile/lib/config.dart` (a test checks they match), build, copy the APK to `mobile/build/app/outputs/flutter-apk/app-release.apk` on this
  server, run `./deploy/publish-apk.sh`. Always sign with the same key (`~/dev/keys`), otherwise phones refuse the update.
- Database backups: `./deploy/backup.sh` (DBs, uploads, .env files; keeps 7 in `~/backups/cheapbazar`). **No cron job is installed yet**; add one with `crontab -e`: `30 2 * * * $HOME/E-Bazar-Unified/deploy/backup.sh >> $HOME/backups/cheapbazar.log 2>&1`. The backups sit on the same server, so copy them elsewhere too.

## Changed 2026-11-11: no COD fee, no wallet thresholds, mobile app

The 5% COD platform fee, the wallet soft/hard thresholds, the pause/delist timers and the ৳500 reserve bond are **removed** (services and the live site; deployed, ledger schema cleaned, migration rehearsal re-run OK). A store's status is admin-only (ACTIVE / SUSPENDED / BANNED). The earlier installable web app (PWA) was **replaced by a native Flutter buyer app** (`mobile/`, 12 screens, English + Bangla). `/app` on the site is now its APK download page (`/downloads/`, published by `deploy/publish-apk.sh`). The app talks to a new mobile API at `/api/m/v1/*` and buyers can delete their own account (needed for the app stores). Details in `WORK_LOG.md`.

### Mobile app: what is left
- Android APK: build with `~/dev/capped.sh ~/E-Bazar-Unified/mobile "flutter build apk --release --target-platform android-arm,android-arm64 --dart-define=API_BASE_URL=https://cheapbazar.org"`, then `deploy/publish-apk.sh` (see the 2026-11-14 entry in `WORK_LOG.md` for whether it is published).
- **Back up `~/dev/keys/` (release signing key).** If it is lost, phones refuse updates to the installed app.
- iPhone: needs a Mac and an Apple developer account. `.github/workflows/mobile.yml` builds it but has never been run.
- Before any Play Store / App Store submission: HTTPS on the site, then turn off the app's plain-http allowance.

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

- Server: `ssh cheapbazar-vps` (103.228.38.77), repo `~/E-Bazar-Unified`. The live site is pm2 `cheapbazar` on port 3000; services are pm2 `cb-*` on ports 4001 to 4008 (internal only).
- The old machine (103.228.39.38) does not run the app; `~/CheapBazar` there is a stale copy kept only to push to GitHub.
- Backups made by the cutover script go to `~/cutover-backups/<time>/` on the server.
