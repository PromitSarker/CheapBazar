import { Router, createServer, HttpError, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { httpLedger, type LedgerGateway } from "./ledger";
import { ActiveAds, MemoryAdsCache, type AdsCache } from "./cache";
import { defaultConfig, type AdConfig, createBooking, listBookings, getBooking, cancelBooking, reviewBooking } from "./bookings";
import { availability, seedDefaultSlots, shapeSlot, upsertSlot } from "./slots";
import { storeStatusHandler, tick } from "./lifecycle";

export function buildRouter(db: Db, ledger: LedgerGateway, ads: ActiveAds, cfg: AdConfig, clock: () => Date): Router {
  const r = new Router();
  const mutated = async <T>(p: Promise<T>) => { const v = await p; await ads.refresh(); return v; };

  // ---------------------------------------------------------------- public-ish reads
  r.get("/ads/slots", async () => ({
    slots: (await db.adSlot.findMany({ where: { active: true }, orderBy: { code: "asc" } })).map(shapeSlot),
  }));
  r.get("/ads/slots/:code/availability", ({ params, query }) => availability(db, params.code, query.from, query.to));
  // The fast path every storefront/aggregator page calls.
  r.get("/ads/active", async ({ query }) => ({ ads: await ads.list({ slot: query.slot, placement: query.placement }) }));

  // ---------------------------------------------------------------- merchant
  r.post("/ads/bookings", ({ body }) => createBooking(db, ledger, cfg, body, clock()));
  r.get("/ads/bookings", async ({ query }) => {
    if (!query.storeId) throw new HttpError(400, "storeId is required", "VALIDATION");
    return { bookings: await listBookings(db, { storeId: query.storeId, status: query.status, limit: Number(query.limit) || undefined }) };
  });
  r.get("/ads/bookings/:id", ({ params, query }) => {
    if (!query.storeId) throw new HttpError(400, "storeId is required", "VALIDATION");
    return getBooking(db, params.id, query.storeId);
  });
  r.post("/ads/bookings/:id/cancel", async ({ params, body }) => {
    requireFields(body, ["storeId"]);
    return cancelBooking(db, params.id, String(body.storeId));
  });

  // ------------------------------------------------------------------- admin
  r.get("/admin/ads/bookings", async ({ query }) => ({
    bookings: await listBookings(db, { status: query.status, storeId: query.storeId, limit: Number(query.limit) || undefined }),
  }));
  r.patch("/admin/ads/:bookingId/review", async ({ params, body }) => {
    requireFields(body, ["decision", "admin"]);
    return mutated(reviewBooking(db, ledger, { id: params.bookingId, decision: String(body.decision).toUpperCase(), admin: String(body.admin), note: body.note }, clock()));
  });
  r.post("/admin/ads/slots", async ({ body }) => upsertSlot(db, body));
  r.get("/admin/ads/slots", async () => ({ slots: (await db.adSlot.findMany({ orderBy: { code: "asc" } })).map(shapeSlot) }));
  r.post("/admin/ads/tick", () => tick(db, ledger, ads, clock()));
  r.get("/admin/outbox", () => outboxStats(db as any));
  return r;
}

export interface AdServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  worker?: boolean;
  seedSlots?: boolean;
  transport?: Transport;
  ledger?: LedgerGateway;
  cache?: AdsCache;
  config?: Partial<AdConfig>;
  cacheTtlMs?: number;
  /** Injectable time source (tests simulate days passing); defaults to the system clock. */
  clock?: () => Date;
}

export async function startAdService(opts: AdServiceOptions) {
  const db = createDb(opts.databaseUrl);
  const ledger = opts.ledger ?? httpLedger(opts.secret);
  const clock = opts.clock ?? (() => new Date());
  const ads = new ActiveAds(db, opts.cache ?? new MemoryAdsCache(), opts.cacheTtlMs, clock);
  const router = buildRouter(db, ledger, ads, { ...defaultConfig, ...opts.config }, clock);
  registerEventRoute(router, db as any, { StoreStatusChanged: storeStatusHandler(clock) });

  if (opts.seedSlots !== false) await seedDefaultSlots(db);
  await ads.refresh(); // warm the cache from the source of truth on boot

  const app = createServer({ name: "ad-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4006), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "ad"), name: "ad" }));
  if (opts.worker !== false) {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await tick(db, ledger, ads, clock()); } catch (e: any) { console.error("[ad] scheduler:", e?.message); } finally { busy = false; }
    }, envInt("AD_TICK_INTERVAL_MS", 60_000));
    stops.push(() => clearInterval(t));
  }
  return {
    db, app, ads,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
