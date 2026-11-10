import { startCatalogService } from "./app";

const secret = process.env.INTERNAL_AUTH_SECRET || "";
if (!secret) {
  console.error("[catalog-service] INTERNAL_AUTH_SECRET is required");
  process.exit(1);
}
startCatalogService({
  secret,
  port: Number(process.env.PORT) || 4002,
  host: process.env.HOST || "127.0.0.1",
  databaseUrl: process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL,
}).then(() => console.log(`[catalog-service] listening on :${process.env.PORT || 4002}`));
