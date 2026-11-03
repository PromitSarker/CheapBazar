import { startAdService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[ad-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startAdService({
  secret,
  port: Number(process.env.PORT) || 4006,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.ADS_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[ad-service] listening on :${process.env.PORT || 4006}`));
