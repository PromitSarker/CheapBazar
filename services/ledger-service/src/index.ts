import { startLedgerService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[ledger-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startLedgerService({
  secret,
  port: Number(process.env.PORT) || 4005,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.LEDGER_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[ledger-service] listening on :${process.env.PORT || 4005}`));
