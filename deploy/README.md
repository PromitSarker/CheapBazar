# Deploying the microservices

Everything runs on one host: 8 Node services under pm2 plus one Postgres container (database-per-service).
Services listen on 127.0.0.1 only and are called by the web tier with the shared `INTERNAL_AUTH_SECRET`.
Nothing here touches the live Neon database used by the monolith.

```
./deploy/setup.sh                      # creates deploy/.env (random secrets), starts Postgres, creates 8 DBs, pushes schemas
pm2 start deploy/ecosystem.config.cjs  # identity 4001 catalog 4002 order 4003 payment 4004 ledger 4005 ad 4006 aggregator 4007 notification 4008
pm2 save
```

Tests (need the Postgres from setup.sh; they create and drop their own throwaway databases):
```
set -a; . deploy/.env; set +a
TEST_PG_ADMIN_URL="postgresql://cheapbazar:$PG_PASSWORD@127.0.0.1:$PG_PORT/postgres" npm run test:services
```

Health: `curl localhost:4001/health` (and 4002-4008). `deploy/.env` is gitignored; keep it that way.
