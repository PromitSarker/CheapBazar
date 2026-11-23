import { Router, createServer, HttpError, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { changeRole, cleanupSessions, deleteBuyerAccount, login, logout, register, toPublicUser, verifySession } from "./auth";
import { createStore, getPayDetails, listStores, resolveTenant, setKyc, setPayDetails, updateStore } from "./stores";

export function buildRouter(db: Db): Router {
  const r = new Router();

  // ------------------------------------------------------------------ auth
  r.post("/auth/register", ({ body }) => register(db, body));
  r.post("/auth/login", ({ body }) => login(db, body));
  r.post("/auth/session", ({ body }) => verifySession(db, String(body.token ?? "")));
  r.post("/auth/logout", ({ body }) => logout(db, String(body.token ?? "")));

  // ----------------------------------------------------------------- users
  r.get("/users", async ({ query }) => {
    const users = await db.user.findMany({
      where: query.role ? { role: query.role as any } : undefined,
      include: { store: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.limit) || 200, 1000),
    });
    return { users: users.map((u) => ({ ...toPublicUser(u), store: u.store })) };
  });
  r.get("/users/:id", async ({ params }) => {
    const u = await db.user.findUnique({ where: { id: params.id } });
    if (!u) throw new HttpError(404, "User not found", "NOT_FOUND");
    return toPublicUser(u);
  });
  r.get("/users/:id/roles", async ({ params }) => {
    const u = await db.user.findUnique({ where: { id: params.id }, select: { role: true } });
    if (!u) throw new HttpError(404, "User not found", "NOT_FOUND");
    return { roles: [u.role] };
  });
  r.post("/users/:id/delete", ({ params, body }) => deleteBuyerAccount(db, params.id, String(body.password ?? "")));
  r.patch("/users/:id/role", ({ params, body }) => {
    requireFields(body, ["role", "admin"]);
    return changeRole(db, params.id, String(body.role), String(body.admin));
  });

  // ---------------------------------------------------------------- stores
  r.post("/stores", ({ body }) => createStore(db, body));
  r.get("/stores", async ({ query }) => ({ stores: await listStores(db, query) }));
  r.get("/stores/by-owner/:ownerId", async ({ params }) => {
    const s = await db.store.findUnique({ where: { ownerId: params.ownerId } });
    if (!s) throw new HttpError(404, "Store not found", "NOT_FOUND");
    return resolveTenant(db, { slug: s.slug });
  });
  r.get("/stores/:id", async ({ params }) => {
    const s = await db.store.findUnique({ where: { id: params.id } });
    if (!s) throw new HttpError(404, "Store not found", "NOT_FOUND");
    return resolveTenant(db, { slug: s.slug });
  });
  r.patch("/stores/:id", ({ params, body }) => updateStore(db, params.id, body));
  // Direct-payment details (bKash/Nagad/Rocket numbers + Bangla QR). Internal only: the web tier decides who may read them.
  r.get("/stores/:id/pay", ({ params }) => getPayDetails(db, { id: params.id }));
  r.patch("/stores/:id/pay", ({ params, body }) => setPayDetails(db, params.id, body));
  r.get("/pay/by-slug/:slug", ({ params }) => getPayDetails(db, { slug: params.slug }));
  r.patch("/stores/:id/kyc", ({ params, body }) => {
    requireFields(body, ["admin"]);
    return setKyc(db, params.id, body.kycVerified === true, String(body.admin));
  });
  r.get("/tenants/resolve", ({ query }) => resolveTenant(db, query));

  // ----------------------------------------------------------------- admin
  r.get("/admin/stats", async () => {
    const [byRole, stores, verified] = await Promise.all([
      db.user.groupBy({ by: ["role"], _count: true }),
      db.store.count(),
      db.store.count({ where: { kycVerified: true } }),
    ]);
    const roles = Object.fromEntries(byRole.map((g) => [g.role, g._count]));
    return { users: byRole.reduce((a, g) => a + g._count, 0), roles, stores, kycVerified: verified };
  });
  r.post("/admin/sessions/cleanup", () => cleanupSessions(db));
  r.get("/admin/outbox", () => outboxStats(db as any));

  return r;
}

export interface IdentityServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  transport?: Transport;
}

export async function startIdentityService(opts: IdentityServiceOptions) {
  const db = createDb(opts.databaseUrl);
  const router = buildRouter(db);
  registerEventRoute(router, db as any, {}); // identity consumes no events (yet)

  const app = createServer({ name: "identity-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4001), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "identity"), name: "identity" }));
  const sweep = setInterval(() => cleanupSessions(db).catch(() => {}), 6 * 3_600_000);
  stops.push(() => clearInterval(sweep));

  return {
    db,
    app,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
