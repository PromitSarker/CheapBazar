#!/usr/bin/env bash
# Guided cutover: monolith (Neon) -> the 8 services.   See deploy/CUTOVER.md for what each step means.
#
#   deploy/cutover.sh --check     preflight + migration dry run. Changes nothing, asks nothing secret.
#   deploy/cutover.sh             the real thing. Run it in YOUR terminal (the admin password is typed there).
#
# Defaults (override with env): WALLETS=carry  SEED_ACCOUNTS=lock
# Neon is only ever READ. Until the very last step the site can be put back exactly as it was;
# any failure before that restores it automatically. After it, run deploy/rollback.sh to go back.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
MODE=run; [ "${1:-}" = "--check" ] && MODE=check
WALLETS="${WALLETS:-carry}"; SEEDS="${SEED_ACCOUNTS:-lock}"
say() { printf '\n== %s\n' "$*"; }
die() { echo "ABORT: $*" >&2; exit 1; }

set -a; . deploy/.env; . ./.env; set +a
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL (the live Neon database) is missing from .env"
SRC="$DATABASE_URL"; unset DATABASE_URL
PGP="postgresql://cheapbazar:${PG_PASSWORD}@127.0.0.1:${PG_PORT:-54330}"
PG="docker exec -i cheapbazar-services-pg"
SERVICES=(cb-identity cb-catalog cb-order cb-payment cb-ledger cb-ad cb-aggregator cb-notification)
DBS=(identity_db catalog_db orders_db payment_billing_db ledger_db ads_db search_db notifications_db)

# ------------------------------------------------------------------ helpers
# set or replace KEY="value" in .env. dotenv does not unescape \ or \", so backslashes are dropped,
# double quotes become single quotes, newlines become spaces, and $ is escaped (it would be expanded).
setenv() {
  local k="$1" v="$2"; v="${v//\\/}"; v="${v//\"/\'}"; v="${v//$'\n'/ }"; v="${v//\$/\\\$}"
  grep -v "^${k}=" .env > .env.tmp || true
  printf '%s="%s"\n' "$k" "$v" >> .env.tmp
  chmod 600 .env.tmp; mv .env.tmp .env
}
export_targets() {
  export SOURCE_DATABASE_URL="$SRC" IDENTITY_DATABASE_URL="$PGP/identity_db" CATALOG_DATABASE_URL="$PGP/catalog_db" \
         ORDER_DATABASE_URL="$PGP/orders_db" LEDGER_DATABASE_URL="$PGP/ledger_db" AGGREGATOR_DATABASE_URL="$PGP/search_db"
}
FLAGS=(--wallets="$WALLETS" --seed-accounts="$SEEDS")
healthy() { for p in 4001 4002 4003 4004 4005 4006 4007 4008; do curl -fsS -m 3 "http://127.0.0.1:$p/health" >/dev/null 2>&1 || return 1; done; }

# ------------------------------------------------------------------ preflight (both modes)
say "preflight"
grep -q '^USE_SERVICES="\?true' .env && die "USE_SERVICES is already true: this site has been cut over"
[ -n "${INTERNAL_AUTH_SECRET:-}" ] || die "INTERNAL_AUTH_SECRET missing in deploy/.env"
docker ps --format '{{.Names}}' | grep -qx cheapbazar-services-pg || die "the services Postgres container is not running"
pm2 jlist | python3 -c 'import sys,json; p={x["name"]:x["pm2_env"]["status"] for x in json.load(sys.stdin)}; sys.exit(0 if p.get("cheapbazar")=="online" else 1)' || die "pm2 app cheapbazar is not online"
healthy || die "not all 8 services answer /health (pm2 ls)"
n=$($PG env PGOPTIONS="-c default_transaction_read_only=on" psql "$SRC" -Atc 'select count(*) from "User"') || die "cannot read the live Neon database"
echo "services healthy; Neon readable ($n users); HEAD $(git rev-parse --short HEAD) $(git diff --quiet && echo clean || echo 'WITH UNCOMMITTED CHANGES')"
[ -f .next/BUILD_ID ] || die "no production build (npm run build)"
[ "$(stat -c %Y .next/BUILD_ID)" -ge "$(git log -1 --format=%ct)" ] || echo "WARN: the build is older than the last commit - run npm run build first"
echo "free disk: $(df -h --output=avail . | tail -1 | tr -d ' ')   wallets=$WALLETS  seed-accounts=$SEEDS"

if [ "$MODE" = check ]; then
  say "migration dry run (writes nothing)"
  export_targets; ADMIN_EMAIL="check@example.invalid" ADMIN_PASSWORD="check-only-123" npx tsx scripts/migrate/neon-to-services.ts "${FLAGS[@]}"
  echo; echo "CHECK OK. Run deploy/cutover.sh (without --check) in your own terminal when ready."
  exit 0
fi

# ------------------------------------------------------------------ questions
[ -t 0 ] || die "run this in an interactive terminal (the admin password is typed, never passed as an argument)"
say "questions"
read -rp "Real platform admin email: " ADMIN_EMAIL
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "that does not look like an email"
read -rp "Admin display name [Platform Admin]: " ADMIN_NAME; ADMIN_NAME="${ADMIN_NAME:-Platform Admin}"
read -rsp "Admin password (min 8): " ADMIN_PASSWORD; echo
read -rsp "Repeat password: " p2; echo
[ "$ADMIN_PASSWORD" = "$p2" ] && [ "${#ADMIN_PASSWORD}" -ge 8 ] || die "passwords differ or are shorter than 8 characters"
read -rp "Platform payment account text shown to sellers/buyers (TOPUP_INSTRUCTIONS) [empty]: " TOPUP
export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD
echo
echo "About to cut over: the site goes down for a few minutes, then runs on the services."
echo "  wallets=$WALLETS  seed-accounts=$SEEDS  admin=$ADMIN_EMAIL"
read -rp "Type CUTOVER to continue: " ok; [ "$ok" = "CUTOVER" ] || die "not confirmed"

# ------------------------------------------------------------------ safety net
TS="$(date +%Y%m%d-%H%M%S)"; BK="$HOME/cutover-backups/$TS"; mkdir -p -m 700 "$BK"
FLIPPED=0
rollback_local() {
  echo; echo "!! restoring the previous setup (Neon was never written to) ..."
  [ -f "$BK/env.bak" ] && cp "$BK/env.bak" .env && chmod 600 .env
  pm2 restart cheapbazar --update-env >/dev/null 2>&1 || pm2 start cheapbazar >/dev/null 2>&1 || true
  pm2 start "${SERVICES[@]}" >/dev/null 2>&1 || true
  echo "!! site restored on the monolith. Backups: $BK"
}
trap 'rc=$?; if [ $rc -ne 0 ] && [ $FLIPPED -eq 0 ]; then rollback_local; fi' EXIT

say "backups -> $BK"
cp .env "$BK/env.bak"; chmod 600 "$BK/env.bak"
for t in User Store Product Order OrderItem PaymentTransaction LedgerEntry StorePayoutMethod WithdrawalRequest Session; do
  $PG env PGOPTIONS="-c default_transaction_read_only=on" psql "$SRC" -qc "COPY (SELECT * FROM \"$t\") TO STDOUT WITH CSV HEADER" | gzip > "$BK/neon-$t.csv.gz"
done
for d in "${DBS[@]}"; do $PG pg_dump -U cheapbazar "$d" | gzip > "$BK/svc-$d.sql.gz"; done
chmod 600 "$BK"/*; echo "saved Neon tables as CSV and the current service databases"

say "rehearsal on a fresh copy with the exact flags"
npm run migrate:rehearse -- "${FLAGS[@]}" 2>&1 | tail -4

# ------------------------------------------------------------------ the window
say "FREEZE: stopping the site and the services"
pm2 stop cheapbazar >/dev/null; pm2 stop "${SERVICES[@]}" >/dev/null

say "fresh service databases"
for d in "${DBS[@]}"; do $PG psql -U cheapbazar -d postgres -qc "DROP DATABASE IF EXISTS $d WITH (FORCE)"; done
./deploy/setup.sh >/dev/null

say "migrate"
export_targets
npx tsx scripts/migrate/neon-to-services.ts "${FLAGS[@]}" | tail -4
npx tsx scripts/migrate/neon-to-services.ts --apply "${FLAGS[@]}" | tail -6

say "start the services"
pm2 delete "${SERVICES[@]}" >/dev/null 2>&1 || true
pm2 start deploy/ecosystem.config.cjs >/dev/null
for i in $(seq 1 60); do healthy && break; sleep 1; done
healthy || die "the services did not come up"
for i in $(seq 1 90); do
  left=0; for d in identity_db catalog_db ledger_db; do c=$($PG psql -U cheapbazar -d "$d" -Atc "select count(*) from \"OutboxMessage\" where \"deliveredAt\" is null and consumer <> 'notification'"); left=$((left+c)); done
  [ "$left" = 0 ] && break; sleep 1
done
say "verify"
npx tsx scripts/migrate/verify-migration.ts "${FLAGS[@]}" | tail -30 | tee "$BK/verify.txt"
grep -q "ALL CHECKS PASSED" "$BK/verify.txt" || die "verification failed"

say "switch the web app to the services"
setenv USE_SERVICES true
setenv INTERNAL_AUTH_SECRET "$INTERNAL_AUTH_SECRET"
setenv TOPUP_INSTRUCTIONS "$TOPUP"
case "${APP_URL:-}" in https://*) ;; *) setenv COOKIE_INSECURE true ;; esac
pm2 restart cheapbazar --update-env >/dev/null
code=000; for i in $(seq 1 40); do code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:3000/ || true); [ "$code" = 200 ] && break; sleep 1; done
[ "$code" = 200 ] || die "the web app did not come back (HTTP $code)"

say "smoke test"
H=(-H "authorization: Bearer $INTERNAL_AUTH_SECRET" -H "x-service-name: cutover" -H "content-type: application/json")
login=$(curl -fsS -m 10 "${H[@]}" -X POST http://127.0.0.1:4001/auth/login -d "$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["ADMIN_EMAIL"],"password":os.environ["ADMIN_PASSWORD"]}))')")
echo "$login" | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin)["user"]["role"]=="ADMIN" else 1)' || die "the new admin cannot log in as ADMIN"
echo "admin login ok"
for path in / /browse /login /signup; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:3000$path"); echo "$path -> $c"; [ "$c" = 200 ] || die "$path returned $c"
done
for slug in $(curl -fsS "${H[@]}" "http://127.0.0.1:4001/stores?limit=200" | python3 -c 'import sys,json; print(" ".join(s["slug"] for s in json.load(sys.stdin)["stores"]))'); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:3000/store/$slug"); echo "/store/$slug -> $c"; [ "$c" = 200 ] || die "storefront $slug returned $c"
done

FLIPPED=1
pm2 save >/dev/null
cat <<MSG

CUTOVER DONE.  The site now runs on the services. Backups: $BK  (Neon is untouched)
Next, in a browser:
  1. log in at /login as $ADMIN_EMAIL, open /admin/billing and set the real Buyer Pro and ad prices
  2. every user must log in again; migrated sellers keep their old passwords
  3. place a COD order on a storefront and check /dashboard/orders
To go back to the old setup:  deploy/rollback.sh   (anything created since the cutover lives only in the services)
Boot persistence still needs sudo once:  pm2 startup   (run the command it prints), then pm2 save
MSG
