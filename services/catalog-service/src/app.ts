import { Router, createServer, HttpError, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { adjustStock, adminListProducts, createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./products";
import { commit, expireReservations, quote, release, reserve, restock } from "./inventory";
import { handlers } from "./consumers";
import { categoryTree, createCategory, deleteCategory, ensureDefaultCategories, updateCategory } from "./categories";

export function buildRouter(db: Db): Router {
  const r = new Router();

  // ---------------------------------------------------------------- products
  r.get("/products/:id", ({ params }) => getProduct(db, params.id));
  r.get("/stores/:storeId/products", async ({ params, query }) => ({ products: await listProducts(db, params.storeId, query) }));
  r.post("/stores/:storeId/products", ({ params, body }) => createProduct(db, params.storeId, body));
  r.patch("/products/:id", ({ params, body }) => {
    requireFields(body, ["storeId"]);
    return updateProduct(db, params.id, body);
  });
  r.delete("/products/:id", ({ params, query }) => {
    if (!query.storeId) throw new HttpError(400, "storeId is required", "VALIDATION");
    return deleteProduct(db, params.id, query.storeId);
  });
  r.post("/products/:id/stock-adjust", ({ params, body }) => {
    requireFields(body, ["storeId", "delta"]);
    return adjustStock(db, params.id, String(body.storeId), Number(body.delta));
  });

  // -------------------------------------------------------------- categories
  r.get("/categories", async () => ({ categories: await categoryTree(db) }));
  r.get("/admin/products", async ({ query }) => ({ products: await adminListProducts(db, query) }));
  r.get("/admin/categories", async () => ({ categories: await categoryTree(db, { includeInactive: true }) }));
  r.post("/admin/categories", ({ body }) => createCategory(db, body));
  r.patch("/admin/categories/:id", ({ params, body }) => updateCategory(db, params.id, body));
  r.delete("/admin/categories/:id", ({ params }) => deleteCategory(db, params.id));

  // ------------------------------------------------------- inventory (saga)
  r.post("/pricing/quote", ({ body }) => {
    requireFields(body, ["storeId", "items"]);
    const orderType = body.orderType === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
    return quote(db, { storeId: String(body.storeId), orderType, items: body.items });
  });
  r.post("/inventory/reserve", ({ body }) => {
    requireFields(body, ["orderRef", "storeId", "items"]);
    return reserve(db, { orderRef: String(body.orderRef), storeId: String(body.storeId), items: body.items, ttlMinutes: body.ttlMinutes, autoCommit: body.autoCommit === true });
  });
  r.post("/inventory/commit", ({ body }) => {
    requireFields(body, ["orderRef"]);
    return commit(db, String(body.orderRef));
  });
  r.post("/inventory/release", ({ body }) => {
    requireFields(body, ["orderRef"]);
    return release(db, String(body.orderRef));
  });
  r.post("/inventory/restock", ({ body }) => {
    requireFields(body, ["orderRef"]);
    return restock(db, String(body.orderRef));
  });

  // ------------------------------------------------------------------ admin
  r.get("/admin/stats", async () => {
    const [products, wholesale, outOfStock, held] = await Promise.all([
      db.product.count(),
      db.product.count({ where: { channel: { in: ["WHOLESALE", "BOTH"] } } }),
      db.product.count({ where: { stock: 0 } }),
      db.stockReservation.count({ where: { status: "HELD" } }),
    ]);
    return { products, wholesale, outOfStock, heldReservations: held };
  });
  r.post("/admin/reservations/expire", () => expireReservations(db));
  r.get("/admin/outbox", () => outboxStats(db as any));

  return r;
}

export interface CatalogServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  janitor?: boolean;
  /** Seed the starter category tree when the table is empty (default true). */
  seedCategories?: boolean;
  transport?: Transport;
}

export async function startCatalogService(opts: CatalogServiceOptions) {
  const db = createDb(opts.databaseUrl);
  if (opts.seedCategories !== false) await ensureDefaultCategories(db);
  const router = buildRouter(db);
  registerEventRoute(router, db as any, handlers);

  const app = createServer({ name: "catalog-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4002), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "catalog"), name: "catalog" }));
  if (opts.janitor !== false) {
    const t = setInterval(() => expireReservations(db).catch((e) => console.error("[catalog] expiry failed:", e?.message)), envInt("RESERVATION_SWEEP_MS", 30_000));
    stops.push(() => clearInterval(t));
  }
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
