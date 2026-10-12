-- Tenant isolation (matches the diagram: "Postgres / RLS by tenant")
-- Apply after `prisma db push`:
--   docker compose exec -T db psql -U postgres -d storeforge < sql/rls.sql

create or replace function current_tenant() returns text as $$
  select nullif(current_setting('app.tenant_id', true), '')
$$ language sql stable;

alter table "Store" enable row level security;
alter table "Product" enable row level security;

-- Store and Products can only be read/written by the owning tenant
create policy "store_tenant_all" on "Store"
  for all using ("id" = current_tenant()) with check ("id" = current_tenant());
create policy "product_tenant_select" on "Product"
  for select using ("storeId" = current_tenant());
create policy "product_tenant_insert" on "Product"
  for insert with check ("storeId" = current_tenant());
create policy "product_tenant_update" on "Product"
  for update using ("storeId" = current_tenant()) with check ("storeId" = current_tenant());
create policy "product_tenant_delete" on "Product"
  for delete using ("storeId" = current_tenant());

-- PRODUCTION NOTE: RLS is only enforced for non-owner roles.
-- Create an app role and connect the app as that role (leave the migration
-- user as table owner):
--   create role storeforge_app login password '...';
--   grant usage on schema public to storeforge_app;
--   grant select, insert, update, delete on all tables in schema public to storeforge_app;
-- Then point DATABASE_URL at storeforge_app. In dev, the single owner role
-- bypasses RLS, so the app code still filters by storeId everywhere.
