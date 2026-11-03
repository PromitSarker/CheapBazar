import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startCatalogService } from "../src/app";
import { wholesaleUnitPrice } from "../src/pricing";

const SECRET = "test-secret";
const PORT = 14002;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let svc: Awaited<ReturnType<typeof startCatalogService>>;
let api: ReturnType<typeof serviceClient>;
let planActive = true; // stub for payment-billing's seller-plan entitlement
let n = 0;
const store = () => `store_${++n}_${Math.random().toString(36).slice(2, 6)}`;
const ref = () => `ORD-${++n}-${Math.random().toString(36).slice(2, 7)}`;

async function expectErr(p: Promise<any>, code: string, status?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}
const mk = (storeId: string, extra: any = {}) =>
  api.post(`/stores/${storeId}/products`, { name: "Sourdough", price: 450, stock: 10, ...extra });
const stockOf = async (id: string) => (await api.get(`/products/${id}`)).stock;

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "catalog_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startCatalogService({
    secret: SECRET, port: PORT, databaseUrl: url, relay: false, janitor: false,
    entitlements: { sellerPlanActive: async () => planActive },
  });
  api = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

test("pure tier pricing picks the highest tier not above the quantity", () => {
  const tiers = [{ minQty: 50, unitPrice: 8 }, { minQty: 100, unitPrice: 6 }];
  assert.equal(wholesaleUnitPrice(10, tiers, 10), 10);
  assert.equal(wholesaleUnitPrice(10, tiers, 49), 10);
  assert.equal(wholesaleUnitPrice(10, tiers, 50), 8);
  assert.equal(wholesaleUnitPrice(10, tiers, 99), 8);
  assert.equal(wholesaleUnitPrice(10, tiers, 5000), 6);
});

test("product CRUD with validation, store scoping and events", async () => {
  const s = store();
  const p = await mk(s, { description: "Crusty", image: "/uploads/a.png" });
  assert.equal(p.channel, "RETAIL");
  assert.equal(p.price, 450);
  await expectErr(mk(s, { name: "" }), "VALIDATION", 400);
  await expectErr(mk(s, { price: -5 }), "VALIDATION", 400);
  await expectErr(mk(s, { stock: 1.5 }), "VALIDATION", 400);
  await expectErr(mk(s, { image: "javascript:alert(1)" }), "VALIDATION", 400);

  const upd = await api.patch(`/products/${p.productId}`, { storeId: s, price: 475.5, stock: 7 });
  assert.equal(upd.price, 475.5);
  assert.equal(upd.name, "Sourdough", "PATCH keeps unspecified fields");
  await expectErr(api.patch(`/products/${p.productId}`, { storeId: "someone-else", price: 1 }), "NOT_FOUND", 404);
  await expectErr(api.delete(`/products/${p.productId}?storeId=someone-else`), "NOT_FOUND", 404);

  assert.equal((await api.get(`/stores/${s}/products`)).products.length, 1);
  await api.delete(`/products/${p.productId}?storeId=${s}`);
  await expectErr(api.get(`/products/${p.productId}`), "NOT_FOUND", 404);

  const ev = await svc.db.$queryRawUnsafe<{ eventType: string; consumer: string }[]>(
    `SELECT "eventType","consumer" FROM "OutboxMessage" WHERE "envelope"->'data'->>'storeId' = $1 AND "eventType" LIKE 'Product%'`, s);
  for (const t of ["ProductCreated", "ProductUpdated", "ProductDeleted"]) assert.ok(ev.some((e) => e.eventType === t && e.consumer === "aggregator"), t);
});

test("wholesale listings: need a plan, a price, sane tiers; channels filter correctly", async () => {
  const s = store();
  planActive = false;
  await expectErr(mk(s, { channel: "WHOLESALE", wholesalePrice: 300, moq: 10 }), "PLAN_REQUIRED", 403);
  planActive = true;
  await expectErr(mk(s, { channel: "WHOLESALE", moq: 10 }), "VALIDATION", 400); // no wholesalePrice
  await expectErr(mk(s, { channel: "BOTH", wholesalePrice: 300, moq: 10, tiers: [{ minQty: 50, unitPrice: 320 }] }), "VALIDATION", 400); // dearer tier
  await expectErr(mk(s, { channel: "BOTH", wholesalePrice: 300, moq: 10, tiers: [{ minQty: 5, unitPrice: 250 }] }), "VALIDATION", 400); // tier below MOQ
  await expectErr(mk(s, { channel: "BOTH", wholesalePrice: 300, moq: 10, tiers: [{ minQty: 50, unitPrice: 250 }, { minQty: 50, unitPrice: 240 }] }), "VALIDATION", 400);

  const both = await mk(s, { name: "Bulk Bread", channel: "BOTH", wholesalePrice: 300, moq: 10, stock: 1000, tiers: [{ minQty: 100, unitPrice: 250 }, { minQty: 50, unitPrice: 280 }] });
  assert.deepEqual(both.tiers, [{ minQty: 50, unitPrice: 280 }, { minQty: 100, unitPrice: 250 }]);
  await mk(s, { name: "Retail Only" });
  const wsOnly = await mk(s, { name: "Pallet", channel: "WHOLESALE", wholesalePrice: 100, moq: 20 });

  const names = async (ch: string) => (await api.get(`/stores/${s}/products?channel=${ch}`)).products.map((p: any) => p.name).sort();
  assert.deepEqual(await names("RETAIL"), ["Bulk Bread", "Retail Only"]);
  assert.deepEqual(await names("WHOLESALE"), ["Bulk Bread", "Pallet"]);

  // plan lapse blocks turning a retail item wholesale, but not editing an existing wholesale item
  const retail = (await api.get(`/stores/${s}/products?q=retail%20only`)).products[0];
  planActive = false;
  await expectErr(api.patch(`/products/${retail.productId}`, { storeId: s, channel: "BOTH", wholesalePrice: 100, moq: 2 }), "PLAN_REQUIRED", 403);
  assert.equal((await api.patch(`/products/${wsOnly.productId}`, { storeId: s, stock: 5 })).stock, 5);
  planActive = true;
});

test("pricing quote: server-side retail/wholesale prices, MOQ, tiers, channel and stock rules", async () => {
  const s = store();
  const both = await mk(s, { name: "Bulk", price: 400, channel: "BOTH", wholesalePrice: 300, moq: 10, stock: 500, tiers: [{ minQty: 100, unitPrice: 250 }] });
  const retailOnly = await mk(s, { name: "Cake", price: 900, stock: 3 });
  const wsOnly = await mk(s, { name: "Pallet", price: 1, channel: "WHOLESALE", wholesalePrice: 100, moq: 5, stock: 50 });

  const r = await api.post("/pricing/quote", { storeId: s, orderType: "RETAIL", items: [{ productId: both.productId, quantity: 2 }, { productId: retailOnly.productId, quantity: 1 }] });
  assert.equal(r.subtotal, 1700);
  assert.deepEqual(r.lines.map((l: any) => l.unitPrice), [400, 900]);

  const w1 = await api.post("/pricing/quote", { storeId: s, orderType: "WHOLESALE", items: [{ productId: both.productId, quantity: 10 }] });
  assert.equal(w1.subtotal, 3000);
  const w2 = await api.post("/pricing/quote", { storeId: s, orderType: "WHOLESALE", items: [{ productId: both.productId, quantity: 100 }] });
  assert.equal(w2.lines[0].unitPrice, 250);
  assert.equal(w2.subtotal, 25000);

  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "WHOLESALE", items: [{ productId: both.productId, quantity: 9 }] }), "MOQ_NOT_MET", 400);
  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "WHOLESALE", items: [{ productId: retailOnly.productId, quantity: 20 }] }), "WRONG_CHANNEL", 400);
  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "RETAIL", items: [{ productId: wsOnly.productId, quantity: 1 }] }), "WRONG_CHANNEL", 400);
  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "RETAIL", items: [{ productId: retailOnly.productId, quantity: 4 }] }), "OUT_OF_STOCK", 409);
  await expectErr(api.post("/pricing/quote", { storeId: store(), orderType: "RETAIL", items: [{ productId: retailOnly.productId, quantity: 1 }] }), "INVALID_PRODUCT", 400); // other tenant's product
  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "RETAIL", items: [{ productId: retailOnly.productId, quantity: -1 }] }), "VALIDATION", 400);
  await expectErr(api.post("/pricing/quote", { storeId: s, orderType: "RETAIL", items: [] }), "VALIDATION", 400);
});

test("reserve is atomic, all-or-nothing, idempotent and never oversells under concurrency", async () => {
  const s = store();
  const hot = await mk(s, { name: "Hot", stock: 10 });
  const other = await mk(s, { name: "Other", stock: 5 });

  const results = await Promise.allSettled(
    Array.from({ length: 15 }, () => api.post("/inventory/reserve", { orderRef: ref(), storeId: s, items: [{ productId: hot.productId, quantity: 1 }] }))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10, "exactly the 10 units in stock are sold");
  assert.equal(await stockOf(hot.productId), 0);

  // second item short -> first item must NOT stay decremented
  const failRef = ref();
  await expectErr(
    api.post("/inventory/reserve", { orderRef: failRef, storeId: s, items: [{ productId: other.productId, quantity: 2 }, { productId: hot.productId, quantity: 1 }] }),
    "OUT_OF_STOCK", 409);
  assert.equal(await stockOf(other.productId), 5, "rolled back");

  // idempotent by orderRef
  const r1 = ref();
  const a = await api.post("/inventory/reserve", { orderRef: r1, storeId: s, items: [{ productId: other.productId, quantity: 2 }] });
  const b = await api.post("/inventory/reserve", { orderRef: r1, storeId: s, items: [{ productId: other.productId, quantity: 2 }] });
  assert.equal(b.duplicate, true);
  assert.equal(a.reservationId, b.reservationId);
  assert.equal(await stockOf(other.productId), 3);

  // merged duplicate lines, and cross-tenant protection
  const r2 = ref();
  await api.post("/inventory/reserve", { orderRef: r2, storeId: s, items: [{ productId: other.productId, quantity: 1 }, { productId: other.productId, quantity: 1 }] });
  assert.equal(await stockOf(other.productId), 1);
  await expectErr(api.post("/inventory/reserve", { orderRef: ref(), storeId: store(), items: [{ productId: other.productId, quantity: 1 }] }), "INVALID_PRODUCT", 400);
});

test("reservation lifecycle: release, commit, expiry, restock-after-commit", async () => {
  const s = store();
  const p = await mk(s, { stock: 10 });
  const item = (q: number) => [{ productId: p.productId, quantity: q }];

  // release returns the units exactly once
  const a = ref();
  await api.post("/inventory/reserve", { orderRef: a, storeId: s, items: item(4) });
  assert.equal(await stockOf(p.productId), 6);
  assert.equal((await api.post("/inventory/release", { orderRef: a })).released, true);
  assert.equal((await api.post("/inventory/release", { orderRef: a })).released, false);
  assert.equal(await stockOf(p.productId), 10);
  await expectErr(api.post("/inventory/commit", { orderRef: a }), "RESERVATION_EXPIRED", 409);

  // commit makes it permanent; release can no longer give it back, restock can
  const b = ref();
  await api.post("/inventory/reserve", { orderRef: b, storeId: s, items: item(3), ttlMinutes: 15 });
  assert.equal((await api.post("/inventory/commit", { orderRef: b })).committed, true);
  assert.equal((await api.post("/inventory/commit", { orderRef: b })).duplicate, true);
  assert.equal((await api.post("/inventory/release", { orderRef: b })).released, false);
  assert.equal(await stockOf(p.productId), 7);
  assert.equal((await api.post("/inventory/restock", { orderRef: b })).restocked, true);
  assert.equal((await api.post("/inventory/restock", { orderRef: b })).restocked, false);
  assert.equal(await stockOf(p.productId), 10);

  // COD style: reserve + commit in one call
  const c = ref();
  const rc = await api.post("/inventory/reserve", { orderRef: c, storeId: s, items: item(2), autoCommit: true });
  assert.equal(rc.status, "COMMITTED");

  // expiry janitor returns held stock, and a late commit is refused
  const d = ref();
  await api.post("/inventory/reserve", { orderRef: d, storeId: s, items: item(5), ttlMinutes: 15 });
  assert.equal(await stockOf(p.productId), 3); // 10 - 2 (COD) - 5 (held)
  await svc.db.stockReservation.update({ where: { orderRef: d }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expectErr(api.post("/inventory/commit", { orderRef: d }), "RESERVATION_EXPIRED", 409);
  const sweep = await api.post("/admin/reservations/expire");
  assert.ok(sweep.released >= 1);
  assert.equal(await stockOf(p.productId), 8, "the expired hold's 5 units are back; the committed COD order keeps its 2");
});

test("stock adjust, depletion events, and products used by orders cannot be deleted", async () => {
  const s = store();
  const p = await mk(s, { stock: 2 });
  assert.equal((await api.post(`/products/${p.productId}/stock-adjust`, { storeId: s, delta: 5 })).stock, 7);
  assert.equal((await api.post(`/products/${p.productId}/stock-adjust`, { storeId: s, delta: -100 })).stock, 0, "floors at zero");
  await expectErr(api.post(`/products/${p.productId}/stock-adjust`, { storeId: "other", delta: 1 }), "NOT_FOUND", 404);
  await expectErr(api.post(`/products/${p.productId}/stock-adjust`, { storeId: s, delta: 1.5 }), "VALIDATION", 400);

  await api.post(`/products/${p.productId}/stock-adjust`, { storeId: s, delta: 3 });
  const o = ref();
  await api.post("/inventory/reserve", { orderRef: o, storeId: s, items: [{ productId: p.productId, quantity: 3 }], autoCommit: true });
  const depleted = await svc.db.$queryRawUnsafe<{ consumer: string }[]>(
    `SELECT "consumer" FROM "OutboxMessage" WHERE "eventType" = 'StockDepleted' AND "envelope"->'data'->>'productId' = $1`, p.productId);
  assert.ok(depleted.some((d) => d.consumer === "notification"));
  await expectErr(api.delete(`/products/${p.productId}?storeId=${s}`), "IN_USE", 409);
});

test("event consumer: OrderCancelled / OrderRefused restock exactly once, duplicates ignored", async () => {
  const s = store();
  const p = await mk(s, { stock: 10 });
  const o1 = ref();
  const o2 = ref();
  await api.post("/inventory/reserve", { orderRef: o1, storeId: s, items: [{ productId: p.productId, quantity: 4 }], autoCommit: true });
  await api.post("/inventory/reserve", { orderRef: o2, storeId: s, items: [{ productId: p.productId, quantity: 2 }], autoCommit: true });
  assert.equal(await stockOf(p.productId), 4);

  const ev = (eventType: string, orderNumber: string, eventId: string) => ({ eventId, eventType, timestamp: new Date().toISOString(), producer: "order", data: { orderNumber, storeId: s } });
  const cancelled = ev("OrderCancelled", o1, `c-${o1}`);
  await api.post("/internal/events", cancelled);
  assert.equal((await api.post("/internal/events", cancelled)).duplicate, true);
  await api.post("/internal/events", ev("OrderCancelled", o1, `c2-${o1}`)); // different event, same order: CAS stops a double restock
  assert.equal(await stockOf(p.productId), 8);
  await api.post("/internal/events", ev("OrderRefused", o2, `r-${o2}`));
  assert.equal(await stockOf(p.productId), 10);
  const bogus = await api.post("/internal/events", ev("OrderCancelled", "ORD-NOPE", "x-1"));
  assert.equal(bogus.ok, true, "unknown orders are a no-op, not an error");
});
