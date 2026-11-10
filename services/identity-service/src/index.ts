import { startIdentityService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[identity-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startIdentityService({
  secret,
  port: Number(process.env.PORT) || 4001,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.IDENTITY_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[identity-service] listening on :${process.env.PORT || 4001}`));
