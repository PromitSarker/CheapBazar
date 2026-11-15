#!/usr/bin/env bash
# Nightly backup of everything that is not in git: the 8 service databases, uploaded images, and the two .env files.
# Output: ~/backups/cheapbazar/<timestamp>/ (private, 7 days kept). Cron entry: see STATUS.md.
# Restore one DB:  docker exec -i cheapbazar-services-pg pg_restore -U cheapbazar -d <db> --clean --if-exists --no-owner < <db>.dump
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HOME/backups/cheapbazar"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$OUT/$STAMP"
umask 077
mkdir -p "$DEST"
for db in identity_db catalog_db orders_db payment_billing_db ledger_db ads_db search_db notifications_db; do
  docker exec cheapbazar-services-pg pg_dump -U cheapbazar -Fc --no-owner "$db" > "$DEST/$db.dump"
done
tar czf "$DEST/uploads.tgz" -C "$HOME" cheapbazar-data -C "$ROOT" public/uploads 2>/dev/null || true
tar czf "$DEST/env.tgz" -C "$ROOT" .env deploy/.env
# sanity: every dump must be non-trivial, otherwise fail loudly and keep older backups
for f in "$DEST"/*.dump; do [ "$(stat -c %s "$f")" -gt 1000 ] || { echo "backup too small: $f" >&2; exit 1; }; done
# keep the newest 7
ls -1dt "$OUT"/*/ | tail -n +8 | xargs -r rm -rf
echo "backup ok: $DEST ($(du -sh "$DEST" | cut -f1))"
