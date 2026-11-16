#!/usr/bin/env bash
# Runs scripts/e2e-location.mjs against a THROWAWAY copy of the stack: its own databases (loc_*) in the local Postgres container,
# services on ports 5001-5008 and the web app on :3100. The live services, their databases and Neon are never touched.
#   ./scripts/e2e-location.sh            (needs deploy/.env: set DEPLOY_ENV=path/to/.env when running from a worktree)
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOY_ENV="${DEPLOY_ENV:-deploy/.env}"
set -a; . "$DEPLOY_ENV"; set +a
SECRET=loc-e2e-secret
PGP="${PG_PORT:-54330}"
LOG="${TMPDIR:-/tmp}/e2e-location-logs"; mkdir -p "$LOG"; : > "$LOG/pids"
psqlc() { docker exec cheapbazar-services-pg psql -U cheapbazar -d postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db() { echo "postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PGP}/$1"; }

cleanup() {
  [ -s "$LOG/pids" ] && xargs -r kill < "$LOG/pids" 2>/dev/null || true
  sleep 1
  for d in loc_identity loc_catalog loc_ledger loc_search loc_notifications loc_ads; do psqlc "DROP DATABASE IF EXISTS $d WITH (FORCE)" || true; done
}
trap cleanup EXIT

declare -A SCHEMA=( [loc_identity]=identity [loc_catalog]=catalog [loc_ledger]=ledger [loc_search]=aggregator [loc_notifications]=notification [loc_ads]=ad )
for d in "${!SCHEMA[@]}"; do
  psqlc "DROP DATABASE IF EXISTS $d WITH (FORCE)"; psqlc "CREATE DATABASE $d"
  DATABASE_URL="$(db $d)" npx prisma db push --skip-generate --schema "services/${SCHEMA[$d]}-service/prisma/schema.prisma" >/dev/null
done

export INTERNAL_AUTH_SECRET=$SECRET HOST=127.0.0.1 NODE_ENV=production
for n in IDENTITY:5001 CATALOG:5002 ORDER:5003 PAYMENT:5004 LEDGER:5005 AD:5006 AGGREGATOR:5007 NOTIFICATION:5008; do
  export "SERVICE_URL_${n%%:*}=http://127.0.0.1:${n##*:}"
done
env PORT=5001 IDENTITY_DATABASE_URL="$(db loc_identity)" npx tsx services/identity-service/src/index.ts > "$LOG/identity.log" 2>&1 & echo $! >> "$LOG/pids"
env PORT=5002 CATALOG_DATABASE_URL="$(db loc_catalog)" npx tsx services/catalog-service/src/index.ts > "$LOG/catalog.log" 2>&1 & echo $! >> "$LOG/pids"
env PORT=5005 LEDGER_DATABASE_URL="$(db loc_ledger)" npx tsx services/ledger-service/src/index.ts > "$LOG/ledger.log" 2>&1 & echo $! >> "$LOG/pids"
env PORT=5006 ADS_DATABASE_URL="$(db loc_ads)" npx tsx services/ad-service/src/index.ts > "$LOG/ad.log" 2>&1 & echo $! >> "$LOG/pids"
env PORT=5007 AGGREGATOR_DATABASE_URL="$(db loc_search)" npx tsx services/aggregator-service/src/index.ts > "$LOG/aggregator.log" 2>&1 & echo $! >> "$LOG/pids"
env PORT=5008 NOTIFICATION_DATABASE_URL="$(db loc_notifications)" npx tsx services/notification-service/src/index.ts > "$LOG/notification.log" 2>&1 & echo $! >> "$LOG/pids"

for p in 5001 5002 5005 5006 5007 5008; do
  for i in $(seq 1 60); do curl -fs "http://127.0.0.1:$p/health" >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fs "http://127.0.0.1:$p/health" >/dev/null 2>&1 || { echo "service on :$p did not start"; tail -5 "$LOG"/*.log; exit 1; }
done

# the web tier: a dummy DATABASE_URL guarantees it can never reach Neon or the live databases
env USE_SERVICES=true COOKIE_INSECURE=true DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" npx next start -p 3100 > "$LOG/web.log" 2>&1 & echo $! >> "$LOG/pids"
for i in $(seq 1 60); do curl -fs -o /dev/null "http://127.0.0.1:3100/login" && break; sleep 0.5; done

WEB_URL=http://127.0.0.1:3100 node scripts/e2e-location.mjs
