# Cheap-Bazar: Architecture & Implementation Tracking Document

> **Source reference:** System Architecture (Diagram 1), Store Lifecycle State Machine (Diagram 2), Wholesale & Billing Rules (Diagram 3), Checkout & Double-Entry Ledger (Diagram 4), Ad Manager Workflow (Diagram 5), and `MICROSERVICES_ARCHITECTURE.md`.
> **Last updated:** November 3, 2026
> **Branch:** `feature/phase3-6-cod-first` (uncommitted work-in-progress; `master` and the live site are untouched)

---

## 1. Executive Summary

Cheap-Bazar is being moved from a single Next.js monolith to the event-driven microservice architecture in `MICROSERVICES_ARCHITECTURE.md`, using the **Strangler Fig** approach: new services are built and tested alongside the monolith, and the web app is re-pointed at them once enough exist.

**Two systems exist right now, and it matters which one you are looking at:**

| System | Where | State |
| :--- | :--- | :--- |
| **Legacy monolith** | `src/` (Next.js + one Prisma schema on the live Neon database), running under pm2 as `cheapbazar` on :3000 | Serving production. **Unchanged by this work.** Still has the pre-existing issues listed in section 5. |
| **New microservices** | `services/*`, `packages/*` | All 8 services built and tested (129 integration tests passing). **Not yet connected to the web UI** and not deployed. |

**Business rule (2026-11-03): sellers pay nothing for wholesale. The only plan is Buyer Pro, a monthly fee paid by wholesale buyers; retail buyers pay no plan fee. The Buyer Pro fee is the platform's (admin's) revenue and is booked into the ledger's `PLATFORM_SUBSCRIPTION_REVENUE` account.**

**Operating decision: everything is Cash-on-Delivery for now.** SSLCommerz is *kept, not removed*, and is gated behind `ONLINE_PAYMENTS_ENABLED` (default `false`). `order-service` already enforces the flag (`ONLINE_DISABLED`); the SSLCommerz code itself still lives untouched in `src/modules/payments/sslcommerz/` and has been **ported** (not removed) into `payment-billing-service`; the monolith keeps using its own copy until cutover.

### Progress at a glance

| Layer | Status |
| :--- | :--- |
| Shared packages (`service-kit`, `event-bus`) | 🟢 Done, used by all services |
| `ledger-service` | 🟢 Done, 11 tests |
| `identity-service` | 🟢 Done, 9 tests |
| `catalog-service` | 🟢 Done, 8 tests |
| `order-service` | 🟢 Done, 13 tests |
| `aggregator-service` | 🟢 Done, 7 tests |
| `notification-service` | 🟢 Done, 9 tests |
| `payment-billing-service` | 🟢 Done 2026-11-03, 47 tests (incl. contract tests against the real ledger and the real aggregator / order entitlement clients) |
| `ad-service` | 🟢 Done, 25 tests (21 + 4 against the real ledger) |
| Web app (Next.js) rewired to call services | 🔴 Not started |
| Deploy files (process manager / compose / gateway) | 🔴 Not started |
| Data migration from the legacy database | 🔴 Not started |

---

## 2. Microservice Status

All services follow the same shape: own Prisma schema → own database, internal-only HTTP API (bearer token), transactional outbox for events, idempotent event consumers, and an integration test suite that runs the real service against a throw-away local Postgres.

| Service | Port | Database | Tests | Status |
| :--- | :---: | :--- | :---: | :--- |
| `identity-service` | 4001 | `identity_db` | 9 | 🟢 Built |
| `catalog-service` | 4002 | `catalog_db` | 8 | 🟢 Built |
| `order-service` | 4003 | `orders_db` | 13 | 🟢 Built |
| `payment-billing-service` | 4004 | `payment_billing_db` | 45 | 🟢 Built |
| `ledger-service` | 4005 | `ledger_db` | 11 | 🟢 Built |
| `ad-service` | 4006 | `ads_db` | 25 | 🟢 Built |
| `aggregator-service` | 4007 | `search_db` | 7 | 🟢 Built |
| `notification-service` | 4008 | `notifications_db` | 9 | 🟢 Built |

### Shared packages (`packages/`)

- **`service-kit`**: dependency-free HTTP toolkit (router, bearer-token internal auth, JSON errors, retrying service client, rate limiter, SQL script splitter, test helpers that refuse non-local databases).
- **`event-bus`**: the full event topology (who consumes what), `publish()` (one outbox row per consumer, written in the same DB transaction as the state change), a relay with exponential backoff and dead-lettering, and `registerEventRoute()` (dedupes on `eventId` in the same transaction as the handler). The transport is an interface; the default is signed HTTP.

### What each built service does

**`ledger-service`**: accounting, wallets, and the Store Status Enforcer.
- Double-entry ledger (`LedgerAccount` / `LedgerTransaction` / `LedgerPosting`) plus a seller-facing statement. DB triggers make ledger rows insert-only and force every transaction to balance; reversals (refund / chargeback) are mirror transactions.
- Seller wallets with `available = balance - holds`. COD platform-fee holds: place → settle (becomes a fee debit) or release. Atomic, idempotent by order number.
- Store Status Enforcer daemon (60 s): `ACTIVE → WARNING → COD_BLOCKED → PAUSED → DELISTED`, automatic recovery on top-up, `DELISTED` needs admin + top-up, `SUSPENDED` / `BANNED` admin-only (a ban cannot be lifted).
- Top-ups, service charges (ads / subscriptions), payout methods (24 h cooling period), withdrawals (reserve bond, one active request per store, race-free, compare-and-swap admin approve/reject), reconciliation and trial-balance endpoints.

**`identity-service`**: users, sessions, tenants.
- Register / login / logout / session check. Session tokens are stored only as SHA-256 hashes. Login and sign-up are rate limited; login errors do not reveal whether an email exists. Only `SELLER` / `BUYER` can self-register.
- Roles (the last admin cannot be demoted). Stores as tenant records: slug rules + reserved names, one store per seller, validated unique custom domains, ownership checks on edits, KYC flag, `GET /tenants/resolve` for the edge router.

**`catalog-service`**: products and stock.
- Product CRUD scoped to the store, retail price, **wholesale channel** (`RETAIL` / `WHOLESALE` / `BOTH`), MOQ, volume tiers (validated to get cheaper as quantity grows). Wholesale listings are **free for sellers**: no plan is needed to publish them.
- Stock reservation engine: `reserve` (atomic, all-or-nothing, idempotent, 15-min TTL, never oversells under concurrency) / `commit` / `release` / `restock`, plus an expiry janitor.
- `POST /pricing/quote`: the only source of prices for checkout (retail price or wholesale tier price, MOQ, channel and stock rules).

**`order-service`**: checkout saga and order state machine.
- Saga: persist `PLACING` → reserve stock → (COD) place fee hold → commit stock → `CONFIRMED` (COD) or `PENDING_PAYMENT` (online). Every step is compensated on failure; compensation always attempts both releases because a timed-out call may have succeeded. A recovery job rolls back orders stuck in `PLACING`.
- Idempotency keys, locked `OrderFeeSnapshot`, server-side pricing only.
- Rules: store must accept orders, COD blocked stores refuse COD, no self-purchase, wholesale needs login + Buyer Pro (the only plan) + MOQ + COD cap (fail-closed with an honest `503` when billing is down).
- State machine with compare-and-swap transitions, tenant-scoped seller actions, buyer self-cancel, courier-driven outcomes. Money/stock effects are event-driven (ledger settles/releases the hold, catalog restocks).
- Online path (SSLCommerz, on hold) is implemented and tested behind the flag: stock held 15 min, no fee hold, `PaymentCaptured` confirms, expiry or `PaymentFailed` cancels.

**`aggregator-service`**: CQRS read side.
- Retail Index and Wholesale Index built purely from events (no cross-database reads), safe against out-of-order and duplicate events (producer timestamps + tombstones).
- Visibility: only `ACTIVE` / `WARNING` / `COD_BLOCKED` stores are listed (Delisted = removed from the aggregator). Sellers need no plan for wholesale visibility.
- Search: terms, store-name match, literal `%` / `_`, price / stock / store filters, sorting, pagination, store facets, store directory.
- **Pro paywall:** only a verified Buyer Pro sees wholesale price / MOQ / tiers; everyone else gets a preview with none of that data, and price filters/sorts are disabled while locked so they cannot be used to infer prices. Fails closed.

**`notification-service`**: notifications, delivery, courier webhooks.
- Turns 22 event types into **bilingual (EN + বাংলা) in-app notifications** through a pure, unit-tested planner (`templates.ts`): new orders, order status, wallet top-ups, low balance / COD blocked, store status changes, payouts, stock-outs, plus the billing and ad events those services will publish. Bengali numerals included.
- Per-user inbox API (list, unread count, mark read: always scoped to the user, so one user cannot mark another's notifications). Replays and repeated alerts collapse: unique dedupe keys, with low-balance alerts throttled to one per store+level per 6 hours and stock-outs to one per product per day.
- **Email and SMS** go through a retrying delivery log (`Delivery`): exponential backoff, `FAILED` after 6 attempts, and honest `SKIPPED` (never reported as sent) when no provider is configured, the address is a guest placeholder, or the phone is not a Bangladeshi mobile (numbers normalised to `8801XXXXXXXXX`). A provider outage never fails event handling.
- Recipients are resolved through identity-service; if identity is down the event handler **fails and the bus retries** it, so nothing is lost or half-written.
- **Courier webhook** `POST /courier/webhook/:courier` (public route; authenticated by HMAC-SHA256 over `timestamp.body`, 5-minute replay window, per-courier secrets, disabled with `503` until a secret is set). Idempotent per courier event, maps statuses conservatively (ambiguous ones such as `partial_delivered` are recorded but never forwarded), and publishes `ShipmentUpdated` to `order-service`.

**`payment-billing-service`**: gateway payments, manual payments, subscriptions, invoices, refunds.
- **Gateway abstraction** (`Gateway` interface: init / validate / query / refund / verifyIpn). SSLCommerz is **ported** from `src/modules/payments/sslcommerz` (the monolith keeps its copy until cutover). It refuses to start in live mode without credentials (no `testbox/qwerty` fallback). The whole online path is **gated behind `ONLINE_PAYMENTS_ENABLED=false`**: `POST /payments/charge` answers `ONLINE_DISABLED` and the IPN webhook answers 503 until you turn it on.
- **Online charges** (`POST /payments/charge`, purposes `STORE_ORDER` / `WALLET_TOPUP` / `SUBSCRIPTION`): amounts come from order-service, the plan table or a validated top-up range, never from the caller. Idempotency keys, one live gateway session per order, `ALREADY_PAID` guard, payment window 15 min.
- **Capture is the only way to money:** server-to-server validation by `val_id` with tran id + amount + currency all matching, compare-and-swap so the IPN and the browser return can race harmlessly, then `PaymentCaptured` (order confirms, ledger books the split or top-up). Verified money wins even over a payment already marked FAILED / CANCELLED / EXPIRED (late payment).
- **Audit findings fixed here:** #3 the IPN `verify_sign` is really checked (and a stripped/renamed signed field fails); #4 browser return pages call `POST /payments/:tranId/reconcile`, which asks the gateway and trusts nothing from the redirect, so no unauthenticated request can change a payment; #5 a validation that does not match records the attempt but **never changes the status**, so a later valid callback still works.
- **Manual payments** (bKash / Nagad / Rocket / bank / cash): merchant submits the transaction id, admin approves or rejects (rejection needs a reason, decisions are compare-and-swap). One real transfer can only be claimed once (`method + trxId` unique), max 5 pending per owner. Approval publishes `TopUpApproved` (ledger credits the wallet) or activates the subscription, in the same transaction as the decision. This is how wallets get funded while online is off.
- **Buyer Pro (the only plan):** a wholesale buyer's monthly fee; sellers and retail buyers pay nothing. Price / period / grace days live in an admin-editable `Plan` table (**placeholder price ৳499, set the real one with `POST /admin/plans`**). The buyer pays each month by gateway (when enabled) or manually (admin verifies); nothing is ever charged automatically. Lifecycle `ACTIVE → GRACE (3 days, still has access) → LAPSED`, tick every 60 s, early payment stacks on the remaining time. `GET /subscriptions/buyer/:userId/status` re-checks the clock on every read, so a late tick can never leave a lapsed plan active. Invoices record what the buyer actually paid.
- **Buyer fee = admin revenue:** every paid month publishes `PlatformRevenueReceived`; ledger-service books it as debit `PLATFORM_CASH` (manual) or `GATEWAY_CLEARING` (online) / credit `PLATFORM_SUBSCRIPTION_REVENUE`, idempotent per payment. A chargeback publishes `PlatformRevenueReversed` (mirror posting) and revokes access. `GET /admin/revenue` gives gross / charged-back / net.
- **Refunds / disputes (admin):** full refund of an order payment (status flips first by compare-and-swap, then the gateway is asked, undone if it refuses, ledger reversal idempotent and retryable by repeating the call). Chargeback entry point: order payments reverse in the ledger, plan payments revoke access and reverse the platform revenue.
- **Events published:** `PaymentCaptured`, `PaymentFailed`, `TopUpApproved`, `ManualPaymentReviewed`, `SubscriptionActivated`, `SubscriptionEnteredGrace`, `SubscriptionLapsed`, `PlatformRevenueReceived`, `PlatformRevenueReversed`. Janitor re-checks stale PENDING payments with the gateway before expiring them.

---

## 3. Diagram-by-Diagram Status

### Diagram 1: System Overview

```
                  ┌────────────────────────────────────────────────────────┐
                  │                      ACTORS                            │
                  │   Seller      Buyer       Admin     Pro Wholesale Buyer│
                  └──────┬──────────┬───────────┬────────────────┬─────────┘
      ┌──────────────────┴──────────┼───────────┴────────────────┴─────────┐
      │  EDGE LAYER   [CDN + WAF] ──► [Domain Router + Tenant Resolver]    │
      └─────────────────────────────┼──────────────────────────────────────┘
      ┌─────────────────────────────┴──────────────────────────────────────┐
      │  CORE PLATFORM: Auth & Identity · Merchant Portal · Admin ·        │
      │  Storefront · Billing & Ad Manager · Payments & Orders ·           │
      │  Double-Entry Ledger · Event Bus ──► Notifications & Integrations  │
      └─────────────────────────────┬──────────────────────────────────────┘
      ┌─────────────────────────────┴──────────────────────────────────────┐
      │  AGGREGATOR & PROJECTIONS: Aggregator UI · Retail/Wholesale Index  │
      │  · Ads Cache                                                       │
      └────────────────────────────────────────────────────────────────────┘
```

**Done**
- [x] Auth & identity service; tenant resolve API for the edge router (`identity-service`).
- [x] Event Bus: transactional outbox + at-least-once delivery + idempotent consumers (`packages/event-bus`), full topology defined.
- [x] Retail Index and Wholesale Index projections with Pro paywall (`aggregator-service`).
- [x] Notifications (in-app, email, SMS) and courier webhook receiver (`notification-service`).
- [x] Legacy monolith (still live): merchant portal, admin back-office, storefronts with cart, edge middleware for subdomains/custom domains.

**Left**
- [ ] Re-point the Next.js app (storefront, merchant portal, aggregator UI, admin) at the services (BFF layer).
- [ ] Aggregator **UI** (`/browse`, Retail and Wholesale tabs, paywall upsell). The API is done.
- [ ] Edge gateway (Traefik/Nginx) routing, CDN/WAF (infrastructure, not code).
- [ ] A broker-backed transport (RabbitMQ / Redis Streams). Not possible in the current environment (no Docker); the `Transport` interface makes it a drop-in.
- [ ] Third-party integrations that need credentials/vendor docs: real courier adapters (Pathao, RedX, Steadfast; a generic signed adapter exists), an SMS vendor account (generic HTTP gateway call exists), an email domain for Resend, Stripe/bKash direct (SSLCommerz code exists, on hold).

---

### Diagram 2: Store Status Lifecycle (Store Status Enforcer)

```
   ┌──────────────────► [Active] ◄────────────────────────────────────────┐
   │        balance < soft │ balance < hard                              │
   │                  [Warning]   [CodBlocked] ── grace 1 ends ──► [Paused]
   │        Top-Up ──────────────────────────────────────── grace 2 ends ─┤
   │                                                          ▼          │
   │                                          [Delisted] ──(Top-up + Admin)
   │  [Admin Action (KYC/Fraud/Policy)] ──► [Suspended] ──► [Permanent Ban]
   └───────────────(Review Passed)───────────────┘
```

**Done** (all in `ledger-service`, covered by tests)
- [x] Status enum, wallet balance / holds / `available`, `statusReason`, `statusChangedAt`.
- [x] Soft/hard threshold engine and both grace-period timers (daemon + on every wallet change).
- [x] Top-up recovery: `WARNING` / `COD_BLOCKED` / `PAUSED` return to `ACTIVE` automatically at the soft threshold.
- [x] `DELISTED` recovery requires admin **and** available ≥ soft threshold; a top-up alone never re-lists.
- [x] Admin suspend / reinstate; permanent ban cannot be lifted.
- [x] Events: `StoreStatusChanged` (to ad, aggregator, notification), `BalanceLow` (to notification).

**Left**
- [x] Seller alerts (in-app + email) for low balance, COD blocked, paused, delisted, suspended, banned, restored (`notification-service`).
- [x] `ad-service` consumer: ads are suspended when a store goes `PAUSED` / `DELISTED` / `SUSPENDED` / `BANNED`, and resume on recovery.
- [ ] Admin UI for status changes calling the service (the legacy admin page still edits the monolith DB).

---

### Diagram 3: Wholesale & Billing Lifecycle

```
  [BUYER WHOLESALE PAYWALL]                    [SELLER WHOLESALE PUBLISH]
     Active Pro Plan? No → Preview (prices & MOQ hidden)   No plan, no fee: sellers list wholesale for free
                     Yes → Full catalog (prices, MOQ, tiers)
  [WHOLESALE CHECKOUT]  Buyer Pro valid · no self-purchase · over COD cap → prepaid only
```

**Done**
- [x] Wholesale product model: channel, MOQ, base wholesale price, validated volume tiers (`catalog-service`).
- [x] Sellers publish wholesale listings for free (the seller-plan gate was removed everywhere on 2026-11-03).
- [x] Buyer paywall: preview with no leaked price data; fail-closed on billing outage (`aggregator-service`).
- [x] Checkout rules: Buyer Pro, MOQ, tier pricing, self-purchase block, wholesale COD cap with prepaid-required message (`order-service`).

- [x] **Subscription model and lifecycle** `Active → Grace → Lapsed` for Buyer Pro, the only plan (`payment-billing-service`).
- [x] **Entitlement endpoints** the other services call: `GET /subscriptions/buyer/:userId/status` → `{ active, status, ... }`. Verified with the real aggregator and order clients; they fail closed when billing is down.
- [x] **Events:** `SubscriptionActivated` / `SubscriptionEnteredGrace` / `SubscriptionLapsed` (notification-service only: the aggregator no longer projects plans).
- [x] **Buyer fee booked as platform (admin) revenue** in the real ledger, with a reversal on chargeback.
- [x] Invoices per paid subscription period (`GET /subscriptions/invoices`).

**Left**
- [ ] Buyer-facing "Upgrade to Pro" page and an admin revenue / manual-payment review page (web tier).
- [ ] Per-order invoices at checkout (the fee snapshot exists; only subscription invoices exist).
- [ ] Real Buyer Pro price (placeholder ৳499: set with `POST /admin/plans`).
- [ ] Buyer Pro auto-renewal (needs a stored payment instrument; today a buyer pays again each period and gets a grace window).

---

### Diagram 4: Order & Checkout Flow, Payments, Ledger

```
  Buyer Checkout ─► Server Validation ─► Reserve Stock (time-limited) ─► Create Order + Lock Fee Snapshot
        ├─ ONLINE: charge gateway (idempotency key) ─ fail → release stock · ok → split settlement (Fee→Platform, Net→Seller)
        └─ COD: (Balance − Holds) ≥ Fee? ─ no → blocked · yes → fee hold ─ ship ─ Refused → release hold + restock
                                                                              └ Delivered → settle hold to fee debit
                                   └──────────► DOUBLE-ENTRY IMMUTABLE LEDGER ─► Payouts (net of unpaid fees)
```

**Done**
- [x] Distributed checkout saga with compensation, recovery job and idempotency keys (`order-service`); atomic, time-limited stock reservation (`catalog-service`).
- [x] `OrderFeeSnapshot` locked at creation; order state machine with audit trail (`OrderEvent`).
- [x] **COD pipeline end to end across three services:** fee hold on order → delivered settles it to a fee debit → refused/cancelled releases it and restocks (tested with the real services and event relay; replaying the whole outbox changes nothing).
- [x] Double-entry immutable ledger, reversals, reconciliation, trial balance, payouts net of holds and reserve (`ledger-service`).
- [x] Online split settlement + refund/chargeback reversal in the ledger and online order path in `order-service` (**on hold behind the flag**).
- [x] Courier outcome handling is idempotent and out-of-order safe (`ShipmentUpdated` consumer) and the signed webhook receiver that feeds it (`notification-service`).
- [x] Buyer SMS for confirmed / shipped / delivered / cancelled orders; seller notifications for every order event.

**Left**
- [x] `payment-billing-service`: gateway abstraction with the SSLCommerz code ported (behind `ONLINE_PAYMENTS_ENABLED`), idempotency keys, `PaymentCaptured` / `PaymentFailed`, manual top-up approval, refund and chargeback entry points.
- [ ] Real courier-vendor adapters (the receiver accepts a generic payload; each vendor needs a thin adapter written against its docs + credentials), then set `ALLOW_SELLER_FINALIZE=false`.
- [ ] Buyer-facing cart/checkout UI calling `order-service` (the drawer in the monolith still posts to the monolith).
- [ ] Late-payment-after-cancellation: an admin can now refund it (`POST /admin/payments/:tranId/refund`), but nothing detects it automatically (order-service only logs it on the order's event log), and there is no admin UI.
- [ ] Partial refunds, and refunds / chargebacks of wallet top-ups and plan payments (refunds: orders only; top-up chargebacks need a wallet clawback in ledger-service, answered `UNSUPPORTED` for now).

---

### Diagram 5: Ad Manager Flow

**Done** (`ad-service`, covered by tests, including against the real `ledger-service`)
- [x] **Slots** (`AdSlot`): code, placement (`AGGREGATOR` / `STOREFRONT`), `capacity` (ads allowed on the same day), price per day. Admin create/edit; inactive slots are hidden from merchants. An empty database gets four **placeholder** slots (`HOME_HERO`, `BROWSE_TOP`, `BROWSE_SIDEBAR`, `STOREFRONT_BANNER`); the prices are my guesses, so set real ones with `POST /admin/ads/slots`.
- [x] **No-overlap bookings:** dates are calendar days in Bangladesh time, inclusive. Capacity is checked **per day**, not per booking (two non-overlapping ads never block a third). Requests serialise on the slot row, so five stores racing for the last place give exactly one winner. A store cannot hold two places in the same slot on the same day. A pending request holds its dates until reviewed.
- [x] **Booking rules:** starts at least 1 day ahead (time for review), max 60 days, https-only image URL, https or internal-path target, headline 3-80 chars, at most 3 pending requests per store (so nobody can hoard dates), price locked on the booking, idempotency key.
- [x] **Workflow:** `PENDING_REVIEW → APPROVED → ACTIVE → EXPIRED`, plus `REJECTED`, `CANCELLED` (merchant, before review only) and `SUSPENDED`.
- [x] **Moderation:** `PATCH /admin/ads/:bookingId/review` (reject needs a written reason; decisions are compare-and-swap so only one wins).
- [x] **Charging:** the wallet is charged through the ledger **at approval** (`AD_FEE`, idempotent by booking number). Not enough funds, or store no longer in good standing: rejected with a reason and the dates released. Ledger unreachable: stays approved-but-unpaid, answers `503`, and the scheduler retries; an unpaid ad never goes live and is never charged twice.
- [x] **Scheduler** (every 60 s, `POST /admin/ads/tick`): auto-rejects requests nobody reviewed by their start date, retries charges, activates ads on their start day, expires them after their end day.
- [x] **Ads cache + `GET /ads/active`:** in-memory behind an interface (Redis can be dropped in). Every read re-checks the date window, so an expired ad is never served even if the scheduler is late. Filter by `slot` or `placement`.
- [x] **Store standing:** `PAUSED` / `DELISTED` / `SUSPENDED` / `BANNED` stores cannot book, and their live ads are suspended; they resume on recovery (out-of-order and duplicate events are safe).
- [x] **Events:** `AdBookingRequested`, `AdApproved`, `AdRejected`, `AdExpired`, `AdPushedToCache`. Notification templates already exist for the first four.

**Decisions I made that you may want to change**
- No refunds: once charged, an ad cannot be cancelled for money back, and days lost while a store is suspended are not extended. The ledger has no ad-fee reversal yet; adding one is a small follow-up if you want refunds.
- No post-approval takedown (an admin cannot pull a live ad for a policy violation) for the same reason; it needs the refund decision first.
- The cache is per-process memory. With more than one `ad-service` instance, switch to the Redis implementation so they agree.
- Event-driven changes (a store being paused) reach the cache within 3 seconds; changes made through the API are immediate.

**Left**
- [ ] Sponsored banner rendering on storefronts and the aggregator; replace the placeholder banners in the templates.
- [ ] Merchant (`/dashboard/ads`) and admin (`/admin/ads`) pages wired to the service (still hard-coded mock-ups).
- [ ] Creative image upload (the service takes an https URL; upload validation belongs in the web tier, see audit finding 13).
- [ ] Impression / click counting (not in the architecture doc; say if you want it).

---

## 4. Implementation Matrix

| Component | Service / Location | Backend | UI wired to new services | Notes |
| :--- | :--- | :---: | :---: | :--- |
| Auth & multi-role identity | `identity-service` | ✅ | ❌ | 2FA, social OAuth, JWT/JWKS not built |
| Tenant onboarding & settings | `identity-service` | ✅ | ❌ | |
| Catalog CRUD | `catalog-service` | ✅ | ❌ | Variants not built |
| Wholesale catalog (MOQ, tiers) | `catalog-service` | ✅ | ❌ | Free for sellers (no plan) |
| Stock reservation | `catalog-service` | ✅ | ❌ | |
| Checkout saga & orders | `order-service` | ✅ | ❌ | |
| COD wallet hold & settlement | `order-service` + `ledger-service` | ✅ | ❌ | Courier webhook pending |
| Double-entry ledger | `ledger-service` | ✅ | ❌ | |
| Store Status Enforcer | `ledger-service` | ✅ | ❌ | Needs ad/notification consumers |
| Payouts / withdrawals | `ledger-service` | ✅ | ❌ | |
| Retail / Wholesale Index | `aggregator-service` | ✅ | ❌ | No `/browse` UI yet |
| Pro paywall | `aggregator-service` | ✅ | ❌ | Reads real Pro status from billing |
| Online payments (SSLCommerz) | legacy `src/modules/payments` + order/ledger paths | 🟡 on hold | – | Ported into `payment-billing-service` behind the flag; monolith copy stays until cutover |
| Subscriptions & billing | `payment-billing-service` | ✅ | ❌ | Placeholder plan prices; billing/upgrade pages not built |
| Manual top-up approval | `payment-billing-service` | ✅ | ❌ | How wallets get funded while online is off; admin review page not built |
| Notifications (in-app / email / SMS) | `notification-service` | ✅ | ❌ | Bell-menu UI not built; email/SMS need provider credentials |
| Courier webhook | `notification-service` | ✅ | – | Generic signed adapter; vendor adapters pending |
| Ad Manager | `ad-service` | ✅ | ❌ | UI pages are still mock data; creative upload is a URL (upload handling is a web-tier job) |
| Edge gateway / CDN / WAF | `deploy/` | 🔴 | – | Infra |
| Broker (RabbitMQ / Redis Streams) | `packages/event-bus` | 🟡 interface only | – | HTTP transport works today |

---

## 5. Audit Findings (from the October analysis): Where They Stand

These were found in the legacy monolith. "Fixed" means fixed *in the new services*; the live monolith still has them until the cutover.

| # | Finding | New services | Legacy monolith |
| :-: | :--- | :--- | :--- |
| 1 | Withdrawal race (read-then-write) lets balance be overdrawn | ✅ Fixed: per-store lock, guarded atomic update, unique index, CAS review | ⚠️ Present |
| 2 | Online orders oversell (stock only taken after payment) | ✅ Fixed: reserve at checkout, 15-min TTL | ⚠️ Present |
| 3 | IPN signature check always returns `true` | ✅ Fixed: `verify_sign` really verified, outcome re-validated with the gateway | ⚠️ Present |
| 4 | `fail` / `cancel` endpoints mutate payments from unauthenticated GET | ✅ Fixed: redirects only trigger a gateway re-check (`/reconcile`); state follows the gateway's answer | ⚠️ Present |
| 5 | A failed validation permanently blocks a later valid IPN | ✅ Fixed: a mismatch records the attempt, never changes status; verified money captures even from FAILED | ⚠️ Present |
| 6 | Platform fee never credited anywhere; "double-entry" was single-sided | ✅ Fixed: real double-entry with `PLATFORM_FEE_REVENUE` | ⚠️ Present |
| 7 | Withdrawal approve/reject can race; approve does not settle | ✅ Fixed: compare-and-swap, clearing accounts | ⚠️ Present |
| 8 | Unauthenticated order creation has no rate limit (COD griefing) | ⏳ Pending: needs rate limiting at the web/BFF/gateway layer (idempotency keys and fee-hold checks help, but do not replace it) | ⚠️ Present |
| 9 | Order status endpoint has no state machine; cancelled paid orders never refund | ✅ Fixed: state machine, refund/reversal path in ledger (gateway refund itself pending in billing) | ⚠️ Present |
| 10 | Every new store starts with a free ৳4,850 wallet | ✅ Fixed: wallets start at ৳0 (**behavioural change**: a new seller needs a top-up before taking COD orders) | ⚠️ Present |
| 11 | Seeded demo admin credentials | ✅ N/A: no seed accounts in services; admin comes only from a role change | ⚠️ Present if `db:seed` was ever run on the live DB |
| 12 | RLS not enforced; Postgres published with default password | ✅ Replaced by database-per-service | ⚠️ Present |
| 13 | Product uploads trust the client's file extension (stored XSS) | ⏳ Pending: upload handling lives in the web tier | ⚠️ Present |
| 14 | Sessions: no login throttle, tokens stored in plain text | ✅ Fixed: hashed tokens, login/sign-up limits, expiry cleanup | ⚠️ Present |
| 15 | Order/withdrawal numbers can collide (`Date.now().slice(-5)`) | ✅ Fixed: random 8-hex order numbers; 8-hex withdrawal numbers | ⚠️ Present |

Also fixed along the way: the monolith's KYC toggle reset any store to `ACTIVE` (it re-activated suspended stores); in `identity-service` KYC is a separate field.

---

## 6. Remaining Roadmap (in order)

Work proceeds **one microservice at a time**, pausing after each.

1. ~~`ledger-service`~~ ✅ · ~~`identity-service`~~ ✅ · ~~`catalog-service`~~ ✅ · ~~`order-service`~~ ✅ · ~~`aggregator-service`~~ ✅ · ~~`notification-service`~~ ✅
2. ~~`ad-service`~~ ✅
3. ~~`payment-billing-service`~~ ✅ (2026-11-03)
4. **Web app rewiring:** a thin BFF in Next.js (session via identity, rate limiting, upload validation), then page by page: storefront/cart → merchant portal → admin → aggregator `/browse` → ads.
5. **Deploy files:** process-manager config (pm2) for all services, `docker-compose` + gateway config matching the architecture doc, `.env` template per service.
6. **Data migration** from the legacy Neon database into the per-service databases (users/stores → identity; wallets/ledger → ledger with opening-balance entries; products → catalog; orders → order), plus a catalog "re-publish all products" admin action to backfill the aggregator.
7. **Cutover** and retirement of the monolith's data layer.

---

## 7. Running It

Everything is local-only; nothing points at the live database.

```bash
npm run test:services        # all service suites (needs a local Postgres on :54329, see below)
npm run typecheck:services   # type-check packages + services
npm run svc:ledger           # also: svc:identity, svc:catalog, svc:order, svc:aggregator, svc:notification, svc:ad, svc:payment
npm run prisma:<name>        # generate a service's Prisma client (e.g. prisma:order)
npm run db:push:<name>       # create/update that service's tables (use on a database you own)
```

Tests start the real service in-process, create a fresh database (`<name>_test`), and **refuse to run against any non-local host**. The default admin connection is `postgresql://postgres:postgres@localhost:54329/postgres` (override with `TEST_PG_ADMIN_URL`).

**Required environment per service:** `INTERNAL_AUTH_SECRET` (shared by all services), `<NAME>_DATABASE_URL` (or `DATABASE_URL`), optional `PORT` / `HOST`. Service-to-service URLs default to `127.0.0.1:<port>`; override with `SERVICE_URL_<NAME>`.

**Tunables** (all optional):

| Variable | Default | Service |
| :--- | :---: | :--- |
| `ONLINE_PAYMENTS_ENABLED` | `false` | order **and** payment (SSLCommerz on hold; set it on both) |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` / `SSLCOMMERZ_IS_LIVE` | – / – / `false` | payment (live mode refuses to start without credentials) |
| `APP_URL` | `http://localhost:3000` | payment (browser return URLs `/api/payments/sslcommerz/{success,fail,cancel}`) |
| `BILLING_PUBLIC_URL` | – | payment (public base URL the gateway posts the IPN to; IPN is omitted if unset) |
| `PAYMENT_WINDOW_MINUTES` / `PAYMENT_SESSION_HOURS` | `15` / `1` | payment |
| `MIN_TOPUP` / `MAX_TOPUP` / `MAX_PENDING_MANUAL` | `10` / `500000` / `5` | payment |
| `RENEWAL_RETRY_MINUTES` / `BILLING_TICK_INTERVAL_MS` | `360` / `60000` | payment |
| `PAYMENT_DATABASE_URL` | – | payment |
| `ONLINE_FEE_PERCENTAGE` | `0` | order (commission on ONLINE-paid orders only; Cash on Delivery never carries a fee) |
| `STOCK_RESERVATION_MINUTES` | `15` | order |
| `WHOLESALE_COD_CAP` | `50000` | order |
| `ALLOW_SELLER_FINALIZE` | `true` | order (set `false` once couriers report outcomes) |
| `PLACING_TIMEOUT_SECONDS` | `120` | order |
| `MIN_WITHDRAWAL` / `WITHDRAWAL_FEE` | `500` / `0` | ledger (the soft/hard thresholds, grace periods and reserve bond were removed 2026-11-11) |
| `PLATFORM_DOMAINS` | – | identity (extra reserved domains) |
| `COURIER_WEBHOOK_SECRET` (or `_<COURIER>`) | – (webhook off) | notification |
| `RESEND_API_KEY` + `MAIL_FROM` | – (email skipped) | notification |
| `SMS_API_URL` / `SMS_API_KEY` / `SMS_SENDER` | – (SMS skipped) | notification |
| `DELIVERY_INTERVAL_MS` | `5000` | notification |

**Known design deviations from `MICROSERVICES_ARCHITECTURE.md`:** opaque hashed session tokens instead of JWT + refresh tokens (no JWKS yet); signed-HTTP event transport instead of RabbitMQ/Kafka; Postgres trigram search instead of Meilisearch/Elasticsearch; in-process caches instead of Redis; one Next.js app instead of four separate front-ends; services run under `tsx` rather than compiled images. Each is an isolated swap behind an existing interface.

---

## 8. Currency & Localization: Bangladeshi Taka (৳ BDT) & Bilingual (EN | বাংলা)

Applies to the **legacy web app** (unchanged). The new services work in BDT with two-decimal precision and return plain numbers.

| Feature | Status | Notes |
| :--- | :---: | :--- |
| No Dollar Policy ($) | 🟢 Complete | All `$` references removed from the web app and seeds |
| Bangladeshi Taka (৳ BDT) | 🟢 Complete | `formatTaka()` for prices, totals, wallet, ledger, ad fees |
| Global language switcher | 🟢 Complete | `[ EN \| বাংলা ]`, instant, cookie + localStorage |
| Reactive client & server i18n | 🟢 Complete | `LanguageContext`, `getServerLanguage()` |
| Eastern Bengali numerals | 🟢 Complete | Digits convert in `bn` mode |
| Full platform translations | 🟢 Complete | For the *existing* screens only |
| Translations for new screens | 🔴 Not started | `/browse`, billing, notifications, real ad manager, wholesale checkout need EN + BN strings when built |
