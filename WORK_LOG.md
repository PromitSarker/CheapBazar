# Work log

Notes on what was done to this project and its servers, newest first. No secrets are recorded here.
Commits are authored as `Claude <noreply@anthropic.com>` (owner's instruction, 2026-11-10).

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
