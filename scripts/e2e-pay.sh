#!/usr/bin/env bash
# Runs scripts/e2e-pay.mjs against a THROWAWAY identity service (its own database `pay_identity`, port 4101) and a dev web
# server on :3200. Every other service URL points at a dead port and DATABASE_URL is a dummy, so the live services, their
# databases and Neon are never touched.
#   ./scripts/e2e-pay.sh        (needs deploy/.env: set DEPLOY_ENV=path/to/.env when running from a worktree)
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOY_ENV="${DEPLOY_ENV:-deploy/.env}"
set -a; . "$DEPLOY_ENV"; set +a
SECRET=pay-e2e-secret
PGP="${PG_PORT:-54330}"
LOG="${TMPDIR:-/tmp}/e2e-pay-logs"; mkdir -p "$LOG"; : > "$LOG/pids"
psqlc() { docker exec cheapbazar-services-pg psql -U cheapbazar -d postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
DB="postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PGP}/pay_identity"

cleanup() {
  [ -s "$LOG/pids" ] && xargs -r kill < "$LOG/pids" 2>/dev/null || true
  # `npx` runs the real server as a child that outlives the wrapper: stop whatever still listens on our two test ports
  for port in 4101 3200; do
    ss -tlnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r kill 2>/dev/null || true
  done
  sleep 1
  psqlc "DROP DATABASE IF EXISTS pay_identity WITH (FORCE)" || true
}
trap cleanup EXIT

psqlc "DROP DATABASE IF EXISTS pay_identity WITH (FORCE)"; psqlc "CREATE DATABASE pay_identity"
DATABASE_URL="$DB" npx prisma db push --skip-generate --schema services/identity-service/prisma/schema.prisma >/dev/null

env INTERNAL_AUTH_SECRET=$SECRET HOST=127.0.0.1 PORT=4101 IDENTITY_DATABASE_URL="$DB" npx tsx services/identity-service/src/index.ts > "$LOG/identity.log" 2>&1 & echo $! >> "$LOG/pids"
for i in $(seq 1 60); do curl -fs "http://127.0.0.1:4101/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fs "http://127.0.0.1:4101/health" >/dev/null 2>&1 || { echo "identity did not start"; tail -5 "$LOG/identity.log"; exit 1; }

DEAD=http://127.0.0.1:1
env USE_SERVICES=true COOKIE_INSECURE=true INTERNAL_AUTH_SECRET=$SECRET \
  SERVICE_URL_IDENTITY=http://127.0.0.1:4101 SERVICE_URL_CATALOG=$DEAD SERVICE_URL_ORDER=$DEAD SERVICE_URL_PAYMENT=$DEAD \
  SERVICE_URL_LEDGER=$DEAD SERVICE_URL_AD=$DEAD SERVICE_URL_AGGREGATOR=$DEAD SERVICE_URL_NOTIFICATION=$DEAD \
  DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" npx next dev -p 3200 > "$LOG/web.log" 2>&1 & echo $! >> "$LOG/pids"
for i in $(seq 1 120); do curl -fs -o /dev/null "http://127.0.0.1:3200/login" && break; sleep 1; done

WEB_URL=http://127.0.0.1:3200 node scripts/e2e-pay.mjs
