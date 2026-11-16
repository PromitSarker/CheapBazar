import { Router, createServer, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { httpEntitlements, type Entitlements } from "./entitlements";
import { handlers } from "./projection";
import { HttpError } from "../../../packages/service-kit";
import { search, storeDirectory, storeVisibility, suggest } from "./search";
import { getPolicy, setPolicy } from "./location";

export function buildRouter(db: Db, ent: Entitlements): Router {
  const r = new Router();
  r.get("/aggregator/retail/search", ({ query }) => search(db, ent, "retail", query));
  // `viewerId` is supplied by the web tier AFTER it verified the session with identity-service.
  r.get("/aggregator/wholesale/search", ({ query }) => search(db, ent, "wholesale", query));
  r.get("/aggregator/suggest", ({ query }) => suggest(db, query));
  // One product for its detail page: retail view when it is sold retail, else the wholesale view
  // (locked for anyone who may not see wholesale prices). Hidden/suspended stores are a plain 404.
  r.get("/aggregator/products/:id", async ({ params, query }) => {
    for (const tab of ["retail", "wholesale"] as const) {
      const res = await search(db, ent, tab, { productId: params.id, viewerId: query.viewerId, lat: query.lat, lng: query.lng, limit: "1" });
      if (res.location.required) throw new HttpError(403, "Set your location to see what is available near you.", "LOCATION_REQUIRED");
      if (res.items.length) return { tab, item: res.items[0], paywall: res.paywall };
    }
    throw new HttpError(404, "Product not found", "NOT_FOUND");
  });
  r.get("/aggregator/stores", ({ query }) => storeDirectory(db, query));
  r.get("/aggregator/stores/:slug/visibility", ({ params, query }) => storeVisibility(db, params.slug, query));

  // The admin's range limit (off by default). Read by the web tier / apps; written only from the admin screen.
  r.get("/settings/location", () => getPolicy(db));
  r.post("/admin/settings/location", ({ body }) => setPolicy(db, body));

  r.get("/admin/stats", async () => {
    const [row] = await db.$queryRawUnsafe<{ listings: bigint; retail: bigint; wholesale: bigint; stores: bigint; visibleStores: bigint }[]>(
      `SELECT (SELECT COUNT(*) FROM "ListingIndex" WHERE "deleted" = false)::bigint AS listings,
              (SELECT COUNT(*) FROM "ListingIndex" l JOIN "StoreProjection" s ON s."storeId"=l."storeId"
                WHERE l."deleted"=false AND s."slug"<>'' AND s."status" NOT IN ('SUSPENDED','BANNED') AND l."channel" IN ('RETAIL','BOTH'))::bigint AS retail,
              (SELECT COUNT(*) FROM "ListingIndex" l JOIN "StoreProjection" s ON s."storeId"=l."storeId"
                WHERE l."deleted"=false AND s."slug"<>'' AND s."status" NOT IN ('SUSPENDED','BANNED') AND l."channel" IN ('WHOLESALE','BOTH'))::bigint AS wholesale,
              (SELECT COUNT(*) FROM "StoreProjection")::bigint AS stores,
              (SELECT COUNT(*) FROM "StoreProjection" WHERE "slug"<>'' AND "status" NOT IN ('SUSPENDED','BANNED'))::bigint AS "visibleStores"`
    );
    return { listings: Number(row.listings), retailVisible: Number(row.retail), wholesaleVisible: Number(row.wholesale), stores: Number(row.stores), visibleStores: Number(row.visibleStores) };
  });
  r.get("/admin/outbox", () => outboxStats(db as any));
  return r;
}

export interface AggregatorOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  transport?: Transport;
  entitlements?: Entitlements;
}

export async function startAggregatorService(opts: AggregatorOptions) {
  const db = createDb(opts.databaseUrl);
  // Optional trigram index for fast substring search; harmless if the extension is unavailable.
  try {
    await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS listing_search_trgm ON "ListingIndex" USING gin ("searchText" gin_trgm_ops)`);
  } catch (e: any) {
    console.warn("[aggregator] pg_trgm unavailable, search uses sequential scans:", e?.message?.slice(0, 80));
  }
  const router = buildRouter(db, opts.entitlements ?? httpEntitlements(opts.secret));
  registerEventRoute(router, db as any, handlers);

  const app = createServer({ name: "aggregator-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4007), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "aggregator"), name: "aggregator" }));
  return {
    db, app,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
