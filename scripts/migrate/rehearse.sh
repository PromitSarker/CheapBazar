#!/usr/bin/env bash
# Full rehearsal of the Neon -> services migration on a COPY. Never writes to Neon.
#   1. read-only snapshot of live Neon into local DB legacy_copy (+ synthetic fixture, skip with NO_FIXTURE=1)
#   2. fresh throwaway service DBs rh_* in the LOCAL services Postgres
#   3. dry run, apply, services drain the outboxes (pm2 rh-* on :41xx), verify, login + storefront smoke test
#   4. clean up (KEEP=1 leaves rh_* DBs and processes for poking around)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . deploy/.env; . ./.env; set +a          # PG_PASSWORD, INTERNAL_AUTH_SECRET; DATABASE_URL = live Neon (read only)
NEON="$DATABASE_URL"; unset DATABASE_URL
PG="docker exec -i cheapbazar-services-pg"
PGP="postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PG_PORT:-54330}"
tables=(User Store Product Order OrderItem PaymentTransaction LedgerEntry StorePayoutMethod WithdrawalRequest)
# the copy holds real customer data + password hashes: it never outlives the run unless KEEP=1
cleanup() {
  [ -n "${KEEP:-}" ] && return 0
  pm2 delete rh-identity rh-catalog rh-order rh-ledger rh-aggregator rh-ad >/dev/null 2>&1 || true
  for d in legacy_copy rh_identity rh_catalog rh_orders rh_ledger rh_search rh_ads; do
    $PG psql -U cheapbazar -d postgres -qc "DROP DATABASE IF EXISTS $d WITH (FORCE)" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT
mk() { $PG psql -U cheapbazar -d postgres -qc "DROP DATABASE IF EXISTS $1 WITH (FORCE)" -c "CREATE DATABASE $1"; }

echo "== 1. snapshot Neon (read-only) -> legacy_copy"
mk legacy_copy
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | $PG psql -q -U cheapbazar -d legacy_copy -v ON_ERROR_STOP=1 >/dev/null
for t in "${tables[@]}" Session; do
  cols=$($PG psql -U cheapbazar -d legacy_copy -Atc "select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_name='$t' and table_schema='public'")
  $PG env PGOPTIONS="-c default_transaction_read_only=on" psql "$NEON" -qc "COPY (SELECT $cols FROM \"$t\") TO STDOUT" \
    | $PG psql -q -U cheapbazar -d legacy_copy -v ON_ERROR_STOP=1 -c "COPY \"$t\"($cols) FROM STDIN"
  echo "   $t: $($PG psql -U cheapbazar -d legacy_copy -Atc "select count(*) from \"$t\"") rows"
done
# a known password for one copied seller so the smoke test can log in (copy only)
HASH=$(node -e "console.log(require('bcryptjs').hashSync('rehearsal-pass-1',10))")
$PG psql -q -U cheapbazar -d legacy_copy -c "UPDATE \"User\" SET \"passwordHash\"='$HASH' WHERE email='rahatkhan@unifiedit.xyz'"
if [ -z "${NO_FIXTURE:-}" ]; then
  $PG psql -q -U cheapbazar -d legacy_copy -v ON_ERROR_STOP=1 < scripts/migrate/rehearsal-fixture.sql
  echo "   fixture applied to the copy"
fi

echo "== 2. fresh rehearsal service DBs"
declare -A DIRS=([identity]=identity-service [catalog]=catalog-service [orders]=order-service [ledger]=ledger-service [search]=aggregator-service [ads]=ad-service)
for db in identity catalog orders ledger search ads; do mk rh_$db; DATABASE_URL="$PGP/rh_$db" npx prisma db push --schema services/${DIRS[$db]}/prisma/schema.prisma --skip-generate >/dev/null; done

export SOURCE_DATABASE_URL="$PGP/legacy_copy" IDENTITY_DATABASE_URL="$PGP/rh_identity" CATALOG_DATABASE_URL="$PGP/rh_catalog" \
       ORDER_DATABASE_URL="$PGP/rh_orders" LEDGER_DATABASE_URL="$PGP/rh_ledger" AGGREGATOR_DATABASE_URL="$PGP/rh_search"
export ADMIN_EMAIL="${ADMIN_EMAIL:-owner@rehearsal.test}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-rehearsal-admin-1}"
OPTS=("$@")

echo "== 3a. dry run"
npx tsx scripts/migrate/neon-to-services.ts "${OPTS[@]}"
echo "== 3b. apply"
npx tsx scripts/migrate/neon-to-services.ts --apply "${OPTS[@]}"
echo "== 3c. refuses to run twice"
npx tsx scripts/migrate/neon-to-services.ts --apply "${OPTS[@]}" && { echo "ERROR: second apply should have been refused"; exit 1; } || echo "   (refused, as intended)"

echo "== 3d. start rehearsal services (pm2 rh-*), let the outboxes drain"
base=(INTERNAL_AUTH_SECRET="$INTERNAL_AUTH_SECRET" HOST=127.0.0.1 NODE_ENV=production
  SERVICE_URL_IDENTITY=http://127.0.0.1:4101 SERVICE_URL_CATALOG=http://127.0.0.1:4102 SERVICE_URL_ORDER=http://127.0.0.1:4103
  SERVICE_URL_LEDGER=http://127.0.0.1:4105 SERVICE_URL_AGGREGATOR=http://127.0.0.1:4107 SERVICE_URL_AD=http://127.0.0.1:4106
  SERVICE_URL_PAYMENT=http://127.0.0.1:4199 SERVICE_URL_NOTIFICATION=http://127.0.0.1:4199)  # 4199 = nothing: rehearsal events must never reach the real services
start() { env "${base[@]}" "$@" pm2 start node_modules/.bin/tsx --name "$NAME" --cwd "$PWD" -- "services/$DIR/src/index.ts" >/dev/null; }
NAME=rh-identity DIR=identity-service start PORT=4101 IDENTITY_DATABASE_URL="$PGP/rh_identity"
NAME=rh-catalog DIR=catalog-service start PORT=4102 CATALOG_DATABASE_URL="$PGP/rh_catalog"
NAME=rh-order DIR=order-service start PORT=4103 ORDER_DATABASE_URL="$PGP/rh_orders"
NAME=rh-ledger DIR=ledger-service start PORT=4105 LEDGER_DATABASE_URL="$PGP/rh_ledger"
NAME=rh-aggregator DIR=aggregator-service start PORT=4107 AGGREGATOR_DATABASE_URL="$PGP/rh_search"
NAME=rh-ad DIR=ad-service start PORT=4106 ADS_DATABASE_URL="$PGP/rh_ads"
for i in $(seq 1 60); do
  undelivered=0
  for db in identity catalog ledger; do u=$($PG psql -U cheapbazar -d rh_$db -Atc "select count(*) from \"OutboxMessage\" where \"deliveredAt\" is null"); undelivered=$((undelivered+u)); done
  [ "$undelivered" = 0 ] && { echo "   drained after ${i}s"; break; }; sleep 1
done

echo "== 4. verify"
npx tsx scripts/migrate/verify-migration.ts "${OPTS[@]}"
echo "== 5. smoke test through the real services"
node scripts/migrate/smoke.mjs
echo "REHEARSAL OK"
