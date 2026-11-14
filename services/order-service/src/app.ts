import { Router, createServer, HttpError, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { config } from "./config";
import { createDb, num, type Db } from "./db";
import { httpDeps, type Deps } from "./deps";
import { createOrder, expireUnpaid, getOrder, listOrders, recoverStuckOrders } from "./orders";
import { transition } from "./transitions";
import { buildHandlers } from "./consumers";

export function buildRouter(db: Db, deps: Deps): Router {
  const r = new Router();

  r.post("/checkout/validate", async ({ body }) => {
    requireFields(body, ["items"]);
    const store = await deps.identity.getStore({ id: body.storeId, slug: body.storeSlug });
    if (!store) throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
    const orderType = body.orderType === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
    const q = await deps.catalog.quote({ storeId: store.id, orderType, items: body.items.map((i: any) => ({ productId: i.productId ?? i.id, quantity: i.quantity })) });
    const wallet = await deps.ledger.walletStatus(store.id);
    return {
      ...q,
      codAllowed: !(orderType === "WHOLESALE" && q.subtotal > config.wholesaleCodCap),
      acceptsOrders: wallet.acceptsOrders,
      onlinePaymentsEnabled: config.onlinePaymentsEnabled,
    };
  });

  r.post("/orders", ({ body }) => createOrder(db, deps, body));
  r.get("/orders/by-number/:orderNumber", ({ params }) => getOrder(db, { orderNumber: params.orderNumber }));
  r.get("/orders/:id", ({ params }) => getOrder(db, { id: params.id }));
  r.get("/stores/:storeId/orders", async ({ params, query }) => ({ orders: await listOrders(db, { storeId: params.storeId, status: query.status }, Number(query.limit) || 50) }));
  r.get("/buyers/:buyerId/orders", async ({ params, query }) => ({ orders: await listOrders(db, { buyerId: params.buyerId }, Number(query.limit) || 50) }));

  r.patch("/orders/:id/status", ({ params, body }) => {
    requireFields(body, ["to", "source"]);
    return transition(db, params.id, {
      to: body.to, source: body.source, actor: body.actor, storeId: body.storeId, note: body.note,
      trackingNumber: body.trackingNumber, courier: body.courier,
    });
  });

  r.get("/admin/stats", async () => {
    const [byStatus, gmv] = await Promise.all([
      db.order.groupBy({ by: ["status"], _count: true }),
      db.order.aggregate({ where: { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] } }, _sum: { totalAmount: true, platformFee: true } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])),
      grossMerchandiseValue: num(gmv._sum.totalAmount),
      platformFees: num(gmv._sum.platformFee),
    };
  });
  r.post("/admin/sweep", async () => ({ recovery: await recoverStuckOrders(db, deps), expiry: await expireUnpaid(db) }));
  r.get("/admin/outbox", () => outboxStats(db as any));

  return r;
}

export interface OrderServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  janitor?: boolean;
  transport?: Transport;
  deps?: Deps;
}

export async function startOrderService(opts: OrderServiceOptions) {
  const db = createDb(opts.databaseUrl);
  const deps = opts.deps ?? httpDeps(opts.secret);
  const router = buildRouter(db, deps);
  registerEventRoute(router, db as any, buildHandlers(db, deps));

  const app = createServer({ name: "order-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4003), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "order"), name: "order" }));
  if (opts.janitor !== false) {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await recoverStuckOrders(db, deps);
        await expireUnpaid(db);
      } catch (e: any) {
        console.error("[order] sweep failed:", e?.message);
      } finally {
        busy = false;
      }
    }, config.sweepIntervalMs);
    stops.push(() => clearInterval(t));
  }
  return {
    db, app, deps,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
