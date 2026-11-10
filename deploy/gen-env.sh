#!/usr/bin/env bash
# Creates deploy/.env with random secrets. Refuses to overwrite an existing one.
set -euo pipefail
cd "$(dirname "$0")"
[ -e .env ] && { echo "deploy/.env already exists; not overwriting"; exit 0; }
rnd() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }
sed -e "s/^PG_PASSWORD=.*/PG_PASSWORD=$(rnd)/" \
    -e "s/^INTERNAL_AUTH_SECRET=.*/INTERNAL_AUTH_SECRET=$(rnd)/" \
    -e "s/^COURIER_WEBHOOK_SECRET=.*/COURIER_WEBHOOK_SECRET=$(rnd)/" env.example > .env
chmod 600 .env
echo "wrote deploy/.env"
