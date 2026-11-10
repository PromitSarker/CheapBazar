import { startNotificationService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[notification-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startNotificationService({
  secret,
  port: Number(process.env.PORT) || 4008,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.NOTIFICATION_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[notification-service] listening on :${process.env.PORT || 4008}`));
