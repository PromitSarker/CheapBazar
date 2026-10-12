# Cheap-Bazar: Microservices Architecture Blueprint & Transition Guide

> **Target Platform:** Multi-Tenant Marketplace with Retail & Pro Wholesale Tiers, Immutable Ledger, Dynamic Store Status Enforcing, and Sponsored Ad Network.  
> **Source Documents:** System Architecture Map (Diagram 1), Store Lifecycle State Machine (Diagram 2), Wholesale & Billing Rules (Diagram 3), Order & Double-Entry Ledger Pipeline (Diagram 4), and Ad Manager Workflow (Diagram 5).  
> **File Location:** `m:/storeforge/MICROSERVICES_ARCHITECTURE.md`

---

## 1. Architectural Vision & Topology

The target architecture decouples the current monolithic Next.js application into a distributed, event-driven ecosystem. It implements:
- **Database-per-Service Pattern**: Services own their persistence layer to prevent coupling.
- **CQRS (Command Query Responsibility Segregation)**: High-write transactional systems (Orders, Ledger) emit events to asynchronous workers that populate high-read caches and search projections (**Retail Index**, **Wholesale Index**, **Ads Cache**).
- **Asynchronous Event-Driven Coordination**: Business workflows crossing service boundaries use an Event Bus (e.g., Redis Streams, RabbitMQ, or Apache Kafka) with the **Transactional Outbox Pattern**.
- **Saga Pattern for Distributed Transactions**: Checkout flows (Stock Reservation &rarr; COD Wallet Holds &rarr; Gateway Charges &rarr; Ledger Entries) use compensating transactions to guarantee eventual consistency.

```
                                  [ INTERNET ]
                                        │
                         ┌──────────────▼──────────────┐
                         │   CDN & Web Application     │
                         │      Firewall (WAF)         │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   Edge API Gateway / Envoy  │
                         │ (Domain Router & Tenant Res)│
                         └──────┬───────────────┬──────┘
                                │               │
        ┌───────────────────────┴──────┐ ┌──────┴──────────────────────┐
        │     PUBLIC WEB APPS          │ │     INTERNAL APIS & RPCS    │
        │ ├── Storefronts (Next.js)    │ │ (Reverse Proxy / Routing)   │
        │ ├── Merchant Portal (Next.js)│ └──────────────┬──────────────┘
        │ ├── Aggregator (Next.js)     │                │
        │ └── Admin Back-Office(React) │                │
        └──────────────────────────────┘                │
                                                        │
 ┌──────────────────────────────────────────────────────┴──────────────────────────────────────────────────────┐
 │                                           MICROSERVICES CORE                                                │
 │                                                                                                             │
 │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌────────────┐ │
 │  │ 1. Identity &   │    │ 2. Catalog &    │    │ 3. Orders &     │    │ 4. Payments &   │    │ 5. Ledger &│ │
 │  │    Auth Service │    │    Inventory    │    │    Checkout     │    │    Billing      │    │    Wallet  │ │
 │  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    └──────┬─────┘ │
 │           │                      │                      │                      │                    │       │
 │      Postgres (Auth)       Postgres (Catalog)      Postgres (Orders)      Postgres (Pay/Bill)  Postgres(Ledger) │
 │                                                                                                             │
 │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐                                          │
 │  │ 6. Ad Manager   │    │ 7. Notifications│    │ 8. Search &     │                                          │
 │  │    Service      │    │    & Courier    │    │    Projections  │                                          │
 │  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘                                          │
 │      Postgres (Ads)         Redis / Jobs           Elastic/Meili                                            │
 └──────────────────────────────────────┬──────────────────────────────────────────────────────────────────────┘
                                        │
                 ┌──────────────────────▼──────────────────────┐
                 │       MESSAGE BROKER / EVENT BUS            │
                 │     (RabbitMQ / Kafka / Redis Streams)      │
                 └─────────────────────────────────────────────┘
```

---

## 2. Service Decomposition & Domain Boundaries

### Service 1: Identity & Tenant Service (`identity-service`)
- **Domain Responsibilities:**
  - User authentication and session lifecycle (JWT + Refresh Tokens).
  - Multi-role identity: `Seller`, `Buyer`, `Admin`, `Pro Wholesale Buyer`.
  - Store entity management & tenant metadata (store ID, slug, custom domain mappings).
  - Public signing key distribution (JWKS) for stateless token verification at the API Gateway.
- **Storage:** Dedicated PostgreSQL (`identity_db`).
- **APIs:**
  - `POST /auth/register` (Buyer/Seller)
  - `POST /auth/login` & `POST /auth/refresh`
  - `GET /tenants/resolve?domain=xyz.com` (Used by Edge Gateway for tenant routing)
  - `GET /users/:id/roles`
- **Events Published:**
  - `UserRegistered`, `StoreCreated`, `StoreDomainUpdated`.

---

### Service 2: Catalog & Inventory Service (`catalog-service`)
- **Domain Responsibilities:**
  - Product catalog CRUD, image galleries, variants, categories.
  - Retail price definition and stock inventory tracking.
  - **Wholesale Catalog Specification (Diagram 3):**
    - `moq` (Minimum Order Quantity).
    - Volume tier pricing structure (e.g., 50–100 units @ $10/ea, 100+ units @ $8.50/ea).
  - Time-limited stock reservation hold engine (e.g., locking 5 units for 15 minutes during checkout).
- **Storage:** Dedicated PostgreSQL (`catalog_db`) with Row-Level Security for multi-tenancy.
- **APIs:**
  - `GET /products/:id`
  - `GET /tenants/:tenantId/products`
  - `POST /inventory/reserve` (Request stock hold; returns `reservationId` or out-of-stock error)
  - `POST /inventory/release` (Compensating action on checkout cancellation/timeout)
  - `POST /inventory/commit` (Permanently decrement stock upon confirmed payment)
- **Events Published:**
  - `ProductCreated`, `ProductUpdated`, `StockReserved`, `StockReleased`, `StockDepleted`.

---

### Service 3: Orders & Checkout Service (`order-service`)
- **Domain Responsibilities:**
  - Shopping cart orchestration (Retail & Wholesale).
  - Server-side pre-checkout validation:
    - Verify product prices & volume discount tiers against `catalog-service`.
    - Verify buyer & seller subscription status against `billing-service`.
    - **Anti-Fraud (Diagram 3):** Enforce `buyerId !== sellerId` (block self-purchases).
    - Check wholesale COD caps.
  - Order state machine (`PENDING`, `RESERVED`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUSED`).
  - Locking the immutable `OrderFeeSnapshot` at creation time.
- **Storage:** Dedicated PostgreSQL (`order_db`).
- **APIs:**
  - `POST /checkout/validate`
  - `POST /orders` (Initiates Saga checkout)
  - `GET /orders/:id`
  - `PATCH /orders/:id/status` (Updated by courier/merchant)
- **Events Published:**
  - `OrderCreated`, `OrderStockReserved`, `OrderPaymentPending`, `OrderCompleted`, `OrderCancelled`, `OrderRefused`.

---

### Service 4: Payments & Billing Service (`payment-billing-service`)
- **Domain Responsibilities:**
  - Payment gateway abstraction (Stripe, bKash, SSLCommerz).
  - Idempotency key tracking to guarantee zero duplicate charges.
  - **Split Settlement Engine (Diagram 4):** Splits gross order total into Platform Fee vs. Net Seller Balance.
  - **Subscription & Billing Lifecycle (Diagram 3):**
    - Buyer Pro Plan & Seller Wholesale Plan management.
    - Automated renewal cycles, retries, and state transitions:
      $$\text{Active} \xrightarrow{\text{renew fails}} \text{Grace} \xrightarrow{\text{retries fail}} \text{Lapsed}$$
- **Storage:** Dedicated PostgreSQL (`payment_billing_db`).
- **APIs:**
  - `POST /payments/charge` (Online credit card / mobile wallet charge with idempotency key)
  - `POST /payments/webhooks/:gateway` (Idempotent gateway callback receiver)
  - `GET /subscriptions/:userId/status` (Check if buyer has active Pro plan)
  - `POST /subscriptions/subscribe`
- **Events Published:**
  - `PaymentCaptured`, `PaymentFailed`, `SubscriptionActivated`, `SubscriptionEnteredGrace`, `SubscriptionLapsed`.

---

### Service 5: Ledger & Wallet Service (`ledger-service`)
- **Domain Responsibilities:**
  - **Double-Entry Immutable Accounting (Diagram 4):**
    - Every movement of money must exist as matched Debit and Credit entries across accounts (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`).
    - Entries are append-only; mistakes require explicit reversal transactions.
  - **Seller Wallet Balances:**
    - Tracks `total_balance` and `held_balance`.
    - Calculates $$\text{available\_balance} = \text{total\_balance} - \text{held\_balance}$$.
  - **COD Platform Fee Protection:**
    - Places a wallet hold for the platform fee upon COD checkout.
    - On delivery: settles hold into confirmed fee debit.
    - On refusal: releases hold back to available balance.
  - **Store Status Enforcer State Machine (Diagram 2):**
    - Monitors available balances against `softThreshold` and `hardThreshold`.
    - Emits state triggers: `Active` &rarr; `Warning` &rarr; `CodBlocked` &rarr; `Paused` &rarr; `Delisted`.
    - Handles seller top-up reconciliations and admin approvals.
- **Storage:** Dedicated PostgreSQL (`ledger_db`) with append-only tables, cryptographic checksums, and strict tenant isolation.
- **APIs:**
  - `POST /wallets/:sellerId/holds` (Hold platform fee for COD)
  - `POST /wallets/:sellerId/release-hold`
  - `POST /wallets/:sellerId/settle-hold`
  - `GET /wallets/:sellerId/status` (Returns state: `ACTIVE`, `WARNING`, `COD_BLOCKED`, etc.)
  - `POST /wallets/:sellerId/topup`
- **Events Published:**
  - `WalletHoldCreated`, `WalletHoldSettled`, `StoreStatusChanged` (`ACTIVE`, `WARNING`, `COD_BLOCKED`, `PAUSED`, `DELISTED`), `PayoutGenerated`.

---

### Service 6: Ad Manager Service (`ad-service`)
- **Domain Responsibilities:**
  - Ad inventory management (slots across storefronts and aggregator).
  - Slot availability engine enforcing **no-overlap date constraints (Diagram 5)**.
  - Merchant ad booking workflow & creative uploads.
  - Admin moderation interface (approve / reject policy violations).
  - Synchronizing active approved ads into high-speed memory (**Ads Cache**).
  - Cron worker to auto-expire bookings at their end date.
- **Storage:** Dedicated PostgreSQL (`ads_db`) + Redis (`ads_cache`).
- **APIs:**
  - `GET /ads/slots`
  - `POST /ads/bookings` (Merchant submits ad request)
  - `PATCH /admin/ads/:bookingId/review` (Admin approves/rejects)
  - `GET /ads/active` (Fast endpoint querying Redis `Ads Cache`)
- **Events Published:**
  - `AdBookingRequested`, `AdApproved`, `AdRejected`, `AdPushedToCache`, `AdExpired`.

---

### Service 7: Search, Projections & Aggregator Service (`aggregator-service`)
- **Domain Responsibilities:**
  - Consumes domain events from the Event Bus to build query-optimized read models:
    - **Retail Index**: Full-text search and faceted filtering across all active retail stores.
    - **Wholesale Index (Pro Only)**: Wholesale catalog with MOQ and volume discount calculators.
  - **Pro Paywall Enforcement**:
    - Serves preview mode (blurred prices, hidden MOQs) for public visitors.
    - Serves unlocked catalog for authenticated buyers with active Pro plans.
- **Storage:** Elasticsearch or Meilisearch + Redis.
- **APIs:**
  - `GET /aggregator/retail/search`
  - `GET /aggregator/wholesale/search` (Validates buyer Pro JWT claim before returning pricing)

---

### Service 8: Notifications & Courier Integration Service (`notification-service`)
- **Domain Responsibilities:**
  - Listens to system events and dispatches alerts via Email (SendGrid/Resend) and SMS (Twilio).
  - Alerts sellers when their wallet balance dips below the soft threshold.
  - Informs merchants of ad review outcomes (Approved vs. Rejected).
  - Integrates with third-party Courier APIs to poll or receive webhooks for shipment delivery status (`Delivered` vs `Refused`).
- **Storage:** Redis (BullMQ queue storage) or PostgreSQL job log.
- **Events Consumed:**
  - `StoreStatusChanged`, `AdApproved`, `AdRejected`, `OrderShipped`, `PaymentFailed`.

---

## 3. Communication Architecture & Event-Driven Backbone

```
              ┌────────────────────────────────────────────────────────┐
              │                    EVENT PRODUCERS                     │
              │  [catalog-service]  [order-service]  [payment-service] │
              └───────────────────────────┬────────────────────────────┘
                                          │
                            (Outbox Pattern / Transactional)
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    EVENT BUS (RabbitMQ / Kafka)       │
                      │                                       │
                      │  TOPICS:                              │
                      │  - store.status.events                │
                      │  - catalog.inventory.events           │
                      │  - order.lifecycle.events             │
                      │  - payment.settlement.events          │
                      │  - ads.moderation.events              │
                      └───────────────────┬───────────────────┘
                                          │
              ┌───────────────────────────┴────────────────────────────┐
              │                    EVENT CONSUMERS                     │
              │  [ledger-service]  [aggregator-service]  [notification]│
              └────────────────────────────────────────────────────────┘
```

### Communication Protocols
1. **Synchronous RPC (Internal):**
   - Use **gRPC (Protocol Buffers)** for high-throughput, low-latency inter-service calls (e.g., `order-service` calling `catalog-service` to hold inventory, or `order-service` checking `ledger-service` wallet balance).
   - Alternatively, lightweight internal JSON-REST over private VPC / Docker network.
2. **Asynchronous Events (Cross-Domain):**
   - Use **RabbitMQ** (AMQP) or **Redis Streams** for reliable pub/sub.
   - All events adhere to a structured CloudEvents-compliant JSON envelope:
     ```json
     {
       "eventId": "evt_987654321",
       "eventType": "order.payment.settled",
       "timestamp": "2026-10-11T16:00:00Z",
       "producer": "payment-billing-service",
       "tenantId": "store_demo_bakery",
       "data": {
         "orderId": "ord_12345",
         "grossAmount": 150.00,
         "platformFee": 15.00,
         "sellerNetAmount": 135.00,
         "paymentModel": "ONLINE"
       }
     }
     ```

---

## 4. Distributed Saga Pattern: Order & Checkout Flow (Diagram 4)

Because each service has its own database, placing an order requires coordinating across **Order**, **Catalog**, **Payment**, and **Ledger** services.

### Online Checkout Saga
```mermaid
sequenceDiagram
    autonumber
    actor Buyer
    participant GW as API Gateway
    participant Order as Order Service
    participant Catalog as Catalog Service
    participant Payment as Payment Service
    participant Ledger as Ledger Service

    Buyer->>GW: POST /checkout (Items, Address, Online)
    GW->>Order: CreateOrderSaga()
    Order->>Order: Validate prices, tiers, plans
    Order->>Catalog: ReserveStock(items, ttl=15m)
    alt Stock Unavailable
        Catalog-->>Order: ReservationFailed
        Order-->>Buyer: Error: Out of stock
    else Stock Reserved
        Catalog-->>Order: ReservationOK (res_id)
        Order->>Payment: ChargeGateway(amount, idempotencyKey)
        alt Payment Fails / Timeouts
            Payment-->>Order: ChargeFailed
            Order->>Catalog: Compensate: ReleaseStock(res_id)
            Order-->>Buyer: Error: Payment declined
        else Payment OK
            Payment-->>Order: ChargeSuccess
            Order->>Catalog: CommitStock(res_id)
            Order->>Ledger: RecordSplitSettlement(gross, fee, net)
            Order-->>Buyer: Order Confirmed
        end
    end
```

### Cash On Delivery (COD) Saga
```mermaid
sequenceDiagram
    autonumber
    actor Buyer
    participant Order as Order Service
    participant Ledger as Ledger Service
    participant Catalog as Catalog Service
    participant Courier as Notification/Courier

    Buyer->>Order: POST /checkout (Items, COD)
    Order->>Order: Check Wholesale COD Cap
    Order->>Ledger: CheckCODAllowed(sellerId, feeAmount)
    alt Balance - Holds < Fee
        Ledger-->>Order: Blocked (Seller below hard threshold)
        Order-->>Buyer: Error: COD unavailable for this store. Please pay online.
    else Wallet Balance OK
        Ledger->>Ledger: PlaceHold(sellerId, feeAmount)
        Order->>Catalog: Reserve & Commit Stock
        Order-->>Buyer: Order Placed (Cash on Delivery)
        Courier->>Courier: Ship order via courier
        alt Package Delivered
            Courier->>Ledger: Emit: OrderDelivered
            Ledger->>Ledger: SettleHoldIntoFeeDebit(sellerId, feeAmount)
        else Package Refused / Returned
            Courier->>Ledger: Emit: OrderRefused
            Ledger->>Ledger: ReleaseHold(sellerId, feeAmount)
            Courier->>Catalog: Emit: RestockItems
        end
    end
```

---

## 5. Double-Entry Accounting & Store Status Enforcer (Diagrams 2 & 4)

In `ledger-service`, financial integrity is maintained using double-entry bookkeeping principles.

### Ledger Schema Design
```sql
-- Chart of accounts
CREATE TABLE ledger_accounts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64), -- NULL for platform global accounts
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
);

-- Immutable transaction headers
CREATE TABLE ledger_transactions (
    id VARCHAR(64) PRIMARY KEY,
    reference_type VARCHAR(64) NOT NULL, -- 'ORDER_SETTLEMENT', 'COD_FEE_HOLD', 'TOP_UP'
    reference_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Balanced double entries
CREATE TABLE ledger_entries (
    id VARCHAR(64) PRIMARY KEY,
    transaction_id VARCHAR(64) REFERENCES ledger_transactions(id),
    account_id VARCHAR(64) REFERENCES ledger_accounts(id),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Store Status State Machine Daemon
A background cron job runs inside `ledger-service` every 60 seconds:
1. Calculates for every seller:
   $$\text{AvailableBalance} = \text{WalletBalance} - \text{ActiveHolds}$$
2. Checks threshold rules:
   - If $\text{AvailableBalance} < \text{SoftThreshold}$ and $\text{Status} == \text{ACTIVE}$:
     - Transition to **`WARNING`**.
     - Publish `StoreStatusChanged(WARNING)` &rarr; Alert seller.
   - If $\text{AvailableBalance} < \text{HardThreshold}$:
     - Transition to **`COD_BLOCKED`**.
     - Publish `StoreStatusChanged(COD_BLOCKED)` &rarr; Storefront disables COD option.
     - Start Grace Period Timer (e.g., 72 hours).
   - If Grace Period expires without top-up:
     - Transition to **`PAUSED`** &rarr; Storefront offline, active ads paused.
     - Start Second Grace Period Timer (e.g., 7 days).
   - If Second Grace Period expires:
     - Transition to **`DELISTED`** &rarr; Removed from Aggregator; debt netted against payouts.
3. On Seller Top-Up:
   - Credits seller wallet & recalculates.
   - Transitions back to **`ACTIVE`** (requires admin approval if previously `DELISTED` or `SUSPENDED`).

---

## 6. Monorepo Directory Structure

To maintain full type-safety while developing microservices, a **Turborepo** or **pnpm workspace** monorepo structure is recommended:

```
cheap-bazar/
├── apps/
│   ├── storefront/             # Next.js 14 App: Merchant storefronts (/store/[slug])
│   ├── merchant-portal/        # Next.js 14 App: Seller dashboard, products, ads, wallet
│   ├── aggregator/             # Next.js 14 App: Public marketplace, Retail & Wholesale tabs
│   └── admin-backoffice/       # React/Vite App: Platform admin moderation & KYC
│
├── services/
│   ├── identity-service/       # Node.js/Fastify: Auth, tenants, JWT
│   ├── catalog-service/        # Node.js/Fastify: Products, stock holds, wholesale pricing
│   ├── order-service/          # Node.js/Fastify: Cart, checkout, saga coordinator
│   ├── payment-service/        # Node.js/Fastify: Gateway charges, subscriptions, webhooks
│   ├── ledger-service/         # Go or Node.js: Double-entry ledger, wallets, Status Enforcer
│   ├── ad-service/             # Node.js/Fastify: Ad bookings, slot conflicts, Redis cache
│   └── notification-service/   # Node.js worker: Email, SMS, courier webhooks
│
├── packages/
│   ├── database/               # Shared Prisma schemas / DB migration scripts
│   ├── event-bus/              # Shared RabbitMQ/Kafka client & typed event envelopes
│   ├── tsconfig/               # Shared TypeScript configurations
│   └── ui-kit/                 # Shared design tokens & template components
│
├── deploy/
│   ├── docker-compose.yml      # Local orchestration of all 7 services + DBs + RabbitMQ
│   ├── gateway/                # Envoy or Nginx reverse proxy configuration
│   └── k8s/                    # Helm charts / Kubernetes deployment manifests
│
├── package.json
└── turbo.json
```

---

## 7. Local Development Orchestration (`docker-compose.yml`)

Developers run the entire distributed environment with a single command:

```yaml
version: '3.8'

services:
  # Edge Gateway & Reverse Proxy
  api-gateway:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080" # Dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  # Message Broker
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"   # AMQP protocol
      - "15672:15672" # RabbitMQ UI
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest

  # In-Memory Cache (Ads Cache & Projections)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Databases (One per service domain)
  postgres-identity:
    image: postgres:16
    environment:
      POSTGRES_DB: identity_db
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5433:5432"

  postgres-catalog:
    image: postgres:16
    environment:
      POSTGRES_DB: catalog_db
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5434:5432"

  postgres-orders:
    image: postgres:16
    environment:
      POSTGRES_DB: orders_db
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5435:5432"

  postgres-ledger:
    image: postgres:16
    environment:
      POSTGRES_DB: ledger_db
      POSTGRES_PASSWORD: secretpassword
    ports:
      - "5436:5432"

  # Core Services
  identity-service:
    build: ./services/identity-service
    environment:
      DATABASE_URL: postgresql://postgres:secretpassword@postgres-identity:5432/identity_db
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    labels:
      - "traefik.http.routers.identity.rule=PathPrefix(`/api/auth`)"

  catalog-service:
    build: ./services/catalog-service
    environment:
      DATABASE_URL: postgresql://postgres:secretpassword@postgres-catalog:5432/catalog_db
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    labels:
      - "traefik.http.routers.catalog.rule=PathPrefix(`/api/catalog`)"

  order-service:
    build: ./services/order-service
    environment:
      DATABASE_URL: postgresql://postgres:secretpassword@postgres-orders:5432/orders_db
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    labels:
      - "traefik.http.routers.orders.rule=PathPrefix(`/api/orders`)"

  ledger-service:
    build: ./services/ledger-service
    environment:
      DATABASE_URL: postgresql://postgres:secretpassword@postgres-ledger:5432/ledger_db
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    labels:
      - "traefik.http.routers.ledger.rule=PathPrefix(`/api/ledger`)"
```

---

## 8. Step-by-Step Transition Roadmap (From Monolith to Microservices)

To avoid getting bogged down in distributed systems complexity before shipping features, execute the transition using the **Strangler Fig Pattern**:

### Step 1: Modularize the Current Next.js Codebase (1–2 Weeks)
- Group files into domain folders inside `src/modules/` instead of general `/lib`:
  - `src/modules/catalog/`
  - `src/modules/orders/`
  - `src/modules/ledger/`
  - `src/modules/ads/`
- Ensure each module only accesses its own tables and communicates through defined TypeScript service interfaces rather than raw cross-table SQL joins.

### Step 2: Introduce the Event Bus (RabbitMQ or Redis Streams) (1 Week)
- Spin up RabbitMQ or Redis via Docker Compose.
- When an action happens (e.g., product created, store status changed), publish a strongly-typed domain event to the broker.

### Step 3: Extract the First Standalone Service: `ledger-service` (2 Weeks)
- Move double-entry accounting, wallet balances, and the Store Status Enforcer state machine out of Next.js into an isolated Fastify/Go service.
- The Next.js app communicates with `ledger-service` via REST/gRPC and consumes status updates via events.

### Step 4: Extract `catalog-service` & `order-service` (2–3 Weeks)
- Implement the distributed checkout saga (stock reservation &rarr; wallet hold &rarr; payment).
- Introduce the API Gateway (Traefik or Kong) to route `/store/[slug]` to Next.js and `/api/*` to the appropriate backend microservices.

### Step 5: Implement the Search & Aggregator Projections (2 Weeks)
- Build the `aggregator-service` listening to `catalog.events` and `ads.events` to maintain the **Retail Index**, **Wholesale Index**, and **Ads Cache**.
- Launch the public buyer Aggregator portal with Pro paywall enforcement.
