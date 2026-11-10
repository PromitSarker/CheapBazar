import { startBillingService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[payment-billing-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startBillingService({
  secret,
  port: Number(process.env.PORT) || 4004,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.PAYMENT_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[payment-billing-service] listening on :${process.env.PORT || 4004}`));
