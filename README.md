# Cheap-Bazar — Phase 1: Store creation + inventory

A multi-tenant marketplace scaffold matching the system overview's **Core Platform** slice:
a user signs up, creates their own store by picking one of two built-in templates (no
customization), then manages products and stock from a dashboard. Every store gets a public
storefront at `/store/<slug>`.

```
Seller ──► Auth ──► Merchant Portal (dashboard)
                      ├─► Storefront (template: classic | modern)  ← public, /store/<slug>
                      └─► Catalog ──► Inventory                    ← products + stock
All data lives in one Postgres with RLS by tenant (sql/rls.sql).
```

## Stack
Next.js 14 (App Router, TypeScript) · Prisma · Postgres 16 · bcryptjs sessions (httpOnly cookie)

## Run it
```bash
cp .env.example .env
npm install
npm run db:up          # starts Postgres via Docker
npm run db:push        # creates schema
docker compose exec -T db psql -U postgres -d storeforge < sql/rls.sql   # enables tenant RLS
npm run db:seed        # demo seller + demo products
npm run dev            # http://localhost:3000
```

**Demo login:** `demo@storeforge.dev` / `demo1234` → store at `/store/demo-bakery` (classic template).
Sign up a second account and choose the *modern* template to compare.

## How multi-tenancy works here
- `Store.id` is the **tenant id**. `Product.storeId` tags every row.
- App code always queries with `where: { storeId: store.id }` (see `src/lib/tenant.ts`).
- `src/lib/rls.ts` (`withTenant`) additionally sets `app.tenant_id` inside a transaction so the
  Postgres RLS policies in `sql/rls.sql` block cross-tenant writes even if app code has a bug.
- Storefront reads (`/store/[slug]`) are intentionally public — storefronts are meant to be
  browsed by anyone.

## Deliberately deferred (next phases per the overview)
Payments/Orders/Ledger · checkout · Event Bus + projections (Retail/Wholesale Index, Ads Cache) ·
the buyer-facing aggregator app with Pro paywall · custom domains (Edge tenant resolver).
