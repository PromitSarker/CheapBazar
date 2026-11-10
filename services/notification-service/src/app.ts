import { Router, createServer, HttpError, reply, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { httpDirectory, type Directory } from "./directory";
import { envProviders, type Providers } from "./providers";
import { buildHandlers } from "./consumers";
import { insertNotification } from "./dispatch";
import { processDeliveries } from "./deliveries";
import { handleCourierWebhook } from "./courier";

const shape = (n: any, lang?: string) => ({
  id: n.id, kind: n.kind, storeId: n.storeId, link: n.link, readAt: n.readAt, createdAt: n.createdAt,
  title: lang === "bn" && n.titleBn ? n.titleBn : n.title,
  body: lang === "bn" && n.bodyBn ? n.bodyBn : n.body,
  titleEn: n.title, bodyEn: n.body, titleBn: n.titleBn, bodyBn: n.bodyBn,
});

export function buildRouter(db: Db, dir: Directory, providers: Providers): Router {
  const r = new Router();

  // ------------------------------------------------------------ in-app inbox
  r.get("/notifications", async ({ query }) => {
    if (!query.userId) throw new HttpError(400, "userId is required", "VALIDATION");
    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: query.userId, readAt: query.unread === "true" ? null : undefined },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(query.limit) || 30, 100),
      }),
      db.notification.count({ where: { userId: query.userId, readAt: null } }),
    ]);
    return { notifications: rows.map((n) => shape(n, query.lang)), unreadCount: unread };
  });
  r.get("/notifications/unread-count", async ({ query }) => {
    if (!query.userId) throw new HttpError(400, "userId is required", "VALIDATION");
    return { unreadCount: await db.notification.count({ where: { userId: query.userId, readAt: null } }) };
  });
  // Always scoped by userId: one user can never mark another's notifications read.
  r.post("/notifications/read", async ({ body }) => {
    requireFields(body, ["userId"]);
    const where: any = { userId: String(body.userId), readAt: null };
    if (!body.all) {
      if (!Array.isArray(body.ids) || body.ids.length === 0) throw new HttpError(400, "ids or all:true is required", "VALIDATION");
      where.id = { in: body.ids.map(String) };
    }
    const r2 = await db.notification.updateMany({ where, data: { readAt: new Date() } });
    return { updated: r2.count };
  });

  // Direct notify for other services / the web tier (idempotent when an idempotencyKey is given).
  r.post("/notifications", async ({ body }) => {
    requireFields(body, ["userId", "kind", "title", "body"]);
    const key = body.idempotencyKey ? String(body.idempotencyKey) : `direct:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const created = await insertNotification(db, {
      userId: String(body.userId), storeId: body.storeId ?? null, kind: String(body.kind), title: String(body.title).slice(0, 200),
      body: String(body.body).slice(0, 2000), titleBn: body.titleBn, bodyBn: body.bodyBn, link: body.link ?? null,
      dedupeKey: `${key}|${body.userId}`, email: body.email === true,
    });
    return { created };
  });

  // -------------------------------------------------------- courier webhook
  // Public route: the only authentication is the HMAC signature verified inside.
  r.post("/courier/webhook/:courier", async ({ params, headers, rawBody }) => reply(202, await handleCourierWebhook(db, params.courier, headers, rawBody)), { auth: "none" });

  // ------------------------------------------------------------------ admin
  r.get("/admin/deliveries", async ({ query }) => ({
    deliveries: await db.delivery.findMany({ where: { status: (query.status as any) || undefined }, orderBy: { createdAt: "desc" }, take: Math.min(Number(query.limit) || 50, 200) }),
  }));
  r.post("/admin/deliveries/run", () => processDeliveries(db, providers, dir));
  r.get("/admin/stats", async () => {
    const [byStatus, unread, couriers] = await Promise.all([
      db.delivery.groupBy({ by: ["status"], _count: true }),
      db.notification.count({ where: { readAt: null } }),
      db.courierEvent.count(),
    ]);
    return { deliveries: Object.fromEntries(byStatus.map((g) => [g.status, g._count])), unreadNotifications: unread, courierEvents: couriers };
  });
  r.get("/admin/outbox", () => outboxStats(db as any));
  return r;
}

export interface NotificationServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  worker?: boolean;
  transport?: Transport;
  directory?: Directory;
  providers?: Providers;
}

export async function startNotificationService(opts: NotificationServiceOptions) {
  const db = createDb(opts.databaseUrl);
  const dir = opts.directory ?? httpDirectory(opts.secret);
  const providers = opts.providers ?? envProviders();
  const router = buildRouter(db, dir, providers);
  registerEventRoute(router, db as any, buildHandlers(dir));

  const app = createServer({ name: "notification-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4008), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "notification"), name: "notification" }));
  if (opts.worker !== false) {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await processDeliveries(db, providers, dir); } catch (e: any) { console.error("[notification] delivery worker:", e?.message); } finally { busy = false; }
    }, envInt("DELIVERY_INTERVAL_MS", 5000));
    stops.push(() => clearInterval(t));
  }
  return {
    db, app,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
