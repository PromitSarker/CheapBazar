# CheapBazar platform review

Reviewed 2026-11-14 on 103.228.38.69 (`~/E-Bazar-Unified`, commit `90bc843`). Code read: auth, sessions, all 8 services' money/order/stock paths,
every API route and server action, the mobile API, the Flutter app config, deploy and server setup. Read-only, except two harmless rate-limit probes (see #2).

**Verified** = I tested or read it directly. **Inferred** = follows from the code, not exercised.
**Not done:** the 131-test suite and typecheck were not re-run (the server was out of memory earlier today), and no load or penetration test.

## What is good (keep it)
- Ledger: double-entry, idempotent, DB-enforced balance, compare-and-swap payouts, 24 h cooling on new payout accounts. Reconciliation functions exist.
- Orders and stock: prices decided server-side, atomic all-or-nothing stock reserve, saga with compensation and a recovery job.
- Sessions stored hashed. Services listen on 127.0.0.1 only. Secrets are 40 chars, files mode 600. Upload validation by magic bytes. Every admin/seller route checks its role.
- The 3 weak seed accounts are **locked** correctly (random bcrypt hash, admin demoted). The real admin exists.

## Docs are wrong
`STATUS.md` still says the cutover has not happened. It **has**: backup `~/cutover-backups/20261111-064358`, `USE_SERVICES="true"` in `.env`, and the migrated data in the service databases (13 users, 5 stores, 7 products). The live site runs on the services now. Fix the doc.

---

## P0: fix before real customers or real money

| # | Problem | Evidence | Fix |
|---|---------|----------|-----|
| 1 | **No HTTPS.** Passwords, session tokens, phones and addresses cross the internet in clear text. Session cookie is not `Secure`; the Android app allows cleartext. | Verified: site on `http://IP:3000`, `COOKIE_INSECURE=true`, manifest `usesCleartextTraffic=true` | Get a domain. The server already runs nginx on 80/443 with certbot: proxy to `127.0.0.1:3000`, add a certificate, bind Next to loopback, remove `COOKIE_INSECURE`, add HSTS, rebuild the app on `https`, turn cleartext off. |
| 2 | **Rate limiting is broken both ways.** (a) Real browsers send no `X-Forwarded-For`, so every user shares one bucket `"unknown"`: **40 logins / 10 min, 10 signups / hour, 10 mobile orders / 10 min, 30 order lookups / 10 min for the whole platform**; anyone can lock everyone out. (b) Anyone who sends a made-up `X-Forwarded-For` gets a fresh bucket: unlimited password guessing, including against the admin. | Verified live: 33 lookups with rotating header, 0 blocked; 33 without header, blocked from #31. (My probe locked order lookups for ~10 min.) | nginx in front, trust only the `X-Real-IP` nginx sets (`TRUST_PROXY`), app on loopback. Also limit logins per **email** (not only IP) with growing lockout. Move limiters to the database or Redis (today in-memory, reset on restart). |
| 3 | **No backups.** Identity, ledger, orders and payments live in one Docker volume on one machine. No cron, no off-server copy, no restore test. | Verified: `crontab` empty; only ad-hoc dump folders | Nightly `pg_dump` of all 8 databases to another machine or object storage, plus `public/uploads` and `~/dev/keys`. Test a restore monthly. |
| 4 | **Nothing restarts after a reboot.** `pm2 startup` was never configured (needs sudo once). Server uptime is 70 days, so one reboot means a full outage. | Verified: no pm2 systemd unit | `pm2 startup` + `pm2 save`. |
| 5 | **No firewall.** `ufw` inactive; about 20 ports are public, including a MySQL on `0.0.0.0:3307`. | Verified | Allow 22/80/443, close the rest. Other apps on this server may use those ports, so the owner must say which. |
| 6 | **Seller wallets hold ৳4,850 each that nobody paid in**, and wallets are withdrawable (min ৳500, admin approves). 5 stores × ৳4,850. | Verified from migration notes and ledger | Decide: zero them, or make promo credit spend-on-ads only. At minimum, tell the payout approver. |

## P1: bugs and abuse paths in the code

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 7 | **COD stock-denial / fake orders.** No phone check. Orders go straight to CONFIRMED with stock committed. Service allows 100,000 units per line (edge caps at 500). Per-phone and per-IP limits are bypassable (#2). | `order-service/src/orders.ts`, `api/orders/create`, `lib/mobile/routes.ts` | Retail cap per line (e.g. min(stock, 20)); phone OTP or login above a value; auto-cancel unconfirmed COD after N hours; per-phone limit inside order-service; block phones with refused deliveries. |
| 8 | **Stock leak on a crash.** COD flow commits stock, then finalizes the order. If finalize fails, recovery calls `release`, which only returns *held* stock, so committed units are lost for good. | `orders.ts` `recoverStuckOrders` vs `inventory.ts` `release` | Recovery should call `restock` (held + committed). Add a test that crashes between the two steps. Inferred. |
| 9 | **Idempotency key is trusted blindly.** A repeated key returns the earlier order, including name, phone and address, without checking who is asking or what was sent. The web retail checkout sends no key at all. | `orders.ts` lines 135-138; `CartDrawer.tsx` | Bind each key to buyer + request hash; mismatch gives 409. Send a key from the web cart. Inferred (keys are random UUIDs today). |
| 10 | **Order confirmation page is public** and shows name, phone and address. The order number is 32 random bits, with no throttle on views. | `store/[slug]/order/[orderNumber]/page.tsx`, `newOrderNumber()` | Use a separate unguessable token (128-bit) in the URL, or mask phone and address and throttle. |
| 11 | **No password reset, change-password or email verification.** Locked-out users are lost; anyone can register any email; the admin password cannot be changed from the app. | identity-service has none of these | Add change-password (revokes all sessions), reset by email (needs an email provider), verification. |
| 12 | **Sessions are never revoked** when a role changes, an account is banned, or a password changes. 7-day fixed expiry. | `identity-service/src/auth.ts` | Delete a user's sessions on role/ban/password change; add "sign out everywhere". |
| 13 | **Admin login is `admin@admin.com`**, the most-guessed address, and #2 makes guessing free. No 2FA on the account that approves payouts and top-ups. | Verified in `identity_db` | Use a non-obvious address, strong password, TOTP for admins. |
| 14 | **Deleted buyers' data stays** in order-service (name, phone, address, email) and notifications. Store reviewers expect it anonymised. | `deleteBuyerAccount` only touches identity | Publish `UserDeleted`; anonymise orders and notifications, keep amounts. |
| 15 | **Payout accounts stored in plain text; no password re-entry** to add one or to withdraw. | `ledger-service/src/withdrawals.ts` | Encrypt the number columns; ask for the password on add/withdraw; notify the owner on any change. |
| 16 | **Dead-lettered events are only logged.** If `TopUpApproved` dead-letters, the seller paid and the wallet is never credited, silently. | `packages/event-bus/index.ts` | Alert when dead > 0; admin retry button; nightly `reconcileWallets` + `trialBalance` job (functions exist, nothing runs them). |
| 17 | **Manual payments:** a transaction id can be claimed first by anyone who learns it; top-ups cannot be clawed back. Admin review is the only control. | `payment-billing-service/src/manual.ts` | Tie claim to sender number; build the clawback; second-admin approval above a threshold. |

## P2: hardening

| # | Problem | Fix |
|---|---------|-----|
| 18 | **Next.js 14.2.35:** `npm audit` reports 1 critical and 1 high (Next, PostCSS); the fix is a major upgrade (16.x). Exploitability not checked. | Plan an upgrade; nginx in front meanwhile. |
| 19 | **No security headers** (CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS); `X-Powered-By` shown. | `headers()` in `next.config.mjs`, `poweredByHeader:false`. |
| 20 | **No CI for the web and services.** 131 tests never run on push; CI only builds the mobile app. | Job with a Postgres service: typecheck, `test:services`, `test:web`, `next build`. Protect `main`. |
| 21 | **No monitoring.** Nothing checks the 8 `/health` endpoints, disk, or the Postgres container. | Uptime check + alert (even a cron + email). |
| 22 | **Uploads live in `public/uploads`** (untracked, not backed up, lost on a clean redeploy); no per-seller quota. | Dedicated mounted folder or object storage, back it up, add a quota. |
| 23 | **Legacy leftovers:** Neon `DATABASE_URL` still in `.env`; `~/cutover-backups` holds password hashes; the old monolith data path is still in the code; `tsconfig.tsbuildinfo` is tracked in git; "Demo Bakery" test store is visible in the marketplace. | After a settling period: rotate Neon credentials, move/encrypt then delete the backups, remove the monolith path, untrack the file, hide the demo store. |
| 24 | **One shared `INTERNAL_AUTH_SECRET`** for all services. Acceptable while everything is on loopback. | Per-service secrets later. |
| 25 | **Mobile:** Android `allowBackup` not disabled, iOS `NSAllowsArbitraryLoads`, `minAppVersion` is advertised but never enforced, no way to force an update. | Fix with #1; enforce `minAppVersion`; set `allowBackup=false`. |

---

## Suggested order
1. **Code I can do now, no decisions needed:** #2 (proxy-aware IP + per-email limit), #8, #9, #12, #19, #20, #16 (alert + nightly reconcile), docs fix, #7 caps.
2. **Needs you (sudo / domain / accounts):** #1 domain + certificate, #3 backup destination, #4 `pm2 startup`, #5 which ports to close, #6 wallet credit decision, email provider for #11.
3. **Later:** #18 Next upgrade, #14, #15, #17, #13 2FA.
