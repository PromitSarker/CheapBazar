#!/usr/bin/env bash
# One-shot, idempotent bring-up of the services' Postgres + schemas.
# Safe by construction: it only ever talks to the local services Postgres (127.0.0.1:$PG_PORT).
set -euo pipefail
cd "$(dirname "$0")"
./gen-env.sh
set -a; . ./.env; set +a
ROOT="$(cd .. && pwd)"
PG_PORT="${PG_PORT:-54330}"

docker compose --env-file .env -f docker-compose.yml up -d
echo -n "waiting for postgres"
for _ in $(seq 1 30); do
  docker exec cheapbazar-services-pg pg_isready -U cheapbazar >/dev/null 2>&1 && break
  echo -n "."; sleep 1
done; echo

declare -A DBS=(
  [identity]=identity_db [catalog]=catalog_db [order]=orders_db [payment]=payment_billing_db
  [ledger]=ledger_db [ad]=ads_db [aggregator]=search_db [notification]=notifications_db
)
declare -A DIRS=(
  [identity]=identity-service [catalog]=catalog-service [order]=order-service
  [payment]=payment-billing-service [ledger]=ledger-service [ad]=ad-service
  [aggregator]=aggregator-service [notification]=notification-service
)
cd "$ROOT"
for svc in identity catalog order payment ledger ad aggregator notification; do
  db="${DBS[$svc]}"
  docker exec cheapbazar-services-pg psql -U cheapbazar -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
    || docker exec cheapbazar-services-pg psql -U cheapbazar -d postgres -c "CREATE DATABASE $db" >/dev/null
  url="postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${db}"
  schema="services/${DIRS[$svc]}/prisma/schema.prisma"
  echo "== $svc -> $db"
  DATABASE_URL="$url" npx prisma generate --schema "$schema" >/dev/null
  DATABASE_URL="$url" npx prisma db push --schema "$schema" --skip-generate >/dev/null
done
echo "done. Start the services with: pm2 start deploy/ecosystem.config.cjs"
