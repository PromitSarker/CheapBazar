#!/usr/bin/env bash
# Put the web app back on the monolith (Neon). Neon was never written to, so it is exactly as it was.
# Anything created since the cutover (orders, sign-ups, top-ups) lives only in the services' databases.
set -euo pipefail
cd "$(dirname "$0")/.."
LAST="$(ls -1d "$HOME"/cutover-backups/*/ 2>/dev/null | tail -1)"
[ -n "$LAST" ] && [ -f "${LAST}env.bak" ] || { echo "no cutover backup found in ~/cutover-backups"; exit 1; }
read -rp "Switch back to the monolith using ${LAST}env.bak? Type ROLLBACK: " ok
[ "$ok" = ROLLBACK ] || { echo "not confirmed"; exit 1; }
cp .env ".env.after-cutover.$(date +%s)"; chmod 600 .env.after-cutover.*
cp "${LAST}env.bak" .env; chmod 600 .env
pm2 restart cheapbazar --update-env
sleep 6; echo "site: HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)"
echo "Back on the monolith. The services keep running; their databases are untouched."
