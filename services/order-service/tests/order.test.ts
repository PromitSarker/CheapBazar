import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { HttpTransport, relayOnce, type Transport } from "../../../packages/event-bus";
import { startLedgerService } from "../../ledger-service/src/app";
import { createDb as createLedgerDb } from "../../ledger-service/src/db";
import { startCatalogService } from "../../catalog-service/src/app";
import { createDb as createCatalogDb } from "../../catalog-service/src/db";
import { createDb as createOrderDb } from "../src/db";
import { httpDeps, type Deps } from "../src/deps";
import { startOrderService } from "../src/app";

const SECRET = "test-secret";
const P = { catalog: 14102, order: 14103, ledger: 14105 };
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";
const base = (p: number) => `http://127.0.0.1:${p}`;

let ledger: Awaited<ReturnType<typeof startLedgerService>>;
let catalog: Awaited<ReturnType<typeof startCatalogService>>;
let orders: Awaited<ReturnType<typeof startOrderService>>;
let L: ReturnType<typeof serviceClient>, C: ReturnType<typeof serviceClient>, O: ReturnType<typeof serviceClient>;

// stubs for the two services not built/under test here
const stores = new Map<string, { id: string; slug: string; name: string; ownerId: string }>();
const proBuyers = new Set<string>();
const sellerPlans = new Set<string>();
let billingDown = false;

// deliver order events to the real ledger + catalog; drop everything else (notification etc.)
const router: Transport = {
  async deliver(consumer, env) {
    const port = consumer === "ledger" ? P.ledger : consumer === "catalog" ? P.catalog : null;
    if (!port) return;
    await new HttpTransport(SECRET, "order", () => base(port)).deliver(consumer, env);
  },
};
const pump = async () => { for (let i = 0; i < 3; i++) await relayOnce(orders.db as any, router, 200); };

let n = 0;
async function newStore(fund = 5000) {
  const id = `st_${++n}_${Math.random().toString(36).slice(2, 6)}`;
  const s = { id, slug: `shop-${id}`, name: `Shop ${id}`, ownerId: `owner_${id}` };
  stores.set(id, s);
  if (fund > 0) await L.post(`/wallets/${id}/topup`, { amount: fund, reference: `T-${id}` });
  return s;
}
const product = (storeId: string, extra: any = {}) => C.post(`/stores/${storeId}/products`, { name: "Sourdough", price: 450, stock: 10, ...extra });
const stock = async (id: string) => (await C.get(`/products/${id}`)).stock;
const wallet = (storeId: string) => L.get(`/wallets/${storeId}/status`);
const body = (s: { id: string }, items: any[], extra: any = {}) => ({
  storeId: s.id, paymentMethod: "COD", orderType: "RETAIL", items,
  buyer: { name: "Karim", phone: "01712345678" }, shipping: { address: "House 1, Road 2, Dhanmondi" }, ...extra,
});
async function expectErr(p: Promise<any>, code: string, status?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}

before(async () => {
  const lUrl = await resetDatabase(ADMIN_URL, "ledger_ord_test", path.join(__dirname, "../../ledger-service/prisma/schema.prisma"), createLedgerDb);
  const cUrl = await resetDatabase(ADMIN_URL, "catalog_ord_test", path.join(__dirname, "../../catalog-service/prisma/schema.prisma"), createCatalogDb);
  const oUrl = await resetDatabase(ADMIN_URL, "orders_ord_test", path.join(__dirname, "../prisma/schema.prisma"), createOrderDb);
  process.env.SERVICE_URL_CATALOG = base(P.catalog);
  process.env.SERVICE_URL_LEDGER = base(P.ledger);

  ledger = await startLedgerService({ secret: SECRET, port: P.ledger, databaseUrl: lUrl, relay: false, daemon: false });
  catalog = await startCatalogService({ secret: SECRET, port: P.catalog, databaseUrl: cUrl, relay: false, janitor: false, entitlements: { sellerPlanActive: async () => true } });

  const real = httpDeps(SECRET);
  const deps: Deps = {
    ...real,
    identity: {
      async getStore(ref) { return (ref.id ? stores.get(ref.id) : [...stores.values()].find((s) => s.slug === ref.slug)) ?? null; },
    },
    billing: {
      async buyerProActive(u) { if (billingDown) throw new ServiceError(503, "down", "UNREACHABLE"); return proBuyers.has(u); },
      async sellerPlanActive(s) { if (billingDown) throw new ServiceError(503, "down", "UNREACHABLE"); return sellerPlans.has(s); },
    },
  };
  orders = await startOrderService({ secret: SECRET, port: P.order, databaseUrl: oUrl, relay: false, janitor: false, deps });
  L = serviceClient({ baseUrl: base(P.ledger), secret: SECRET, caller: "test" });
  C = serviceClient({ baseUrl: base(P.catalog), secret: SECRET, caller: "test" });
  O = serviceClient({ baseUrl: base(P.order), secret: SECRET, caller: "test" });
});
after(async () => { await orders.stop(); await catalog.stop(); await ledger.stop(); });

test("COD checkout: server-side pricing, stock committed, fee hold placed, fee snapshot locked", async () => {
  const s = await newStore();
  const p = await product(s.id);
  const o = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 2, price: 1, unitPrice: 1 }])); // client price must be ignored
  assert.equal(o.status, "CONFIRMED");
  assert.equal(o.totalAmount, 900);
  assert.equal(o.platformFee, 45);
  assert.equal(o.sellerNet, 855);
  assert.equal(o.items[0].unitPrice, 450);
  assert.match(o.orderNumber, /^ORD-[0-9A-F]{8}$/);

  assert.equal(await stock(p.productId), 8);
  const w = await wallet(s.id);
  assert.equal(w.holds, 45);
  assert.equal(w.balance, 5000);

  const snap = await orders.db.orderFeeSnapshot.findFirstOrThrow({ where: { orderId: o.id } });
  assert.equal(Number(snap.codFeeHold), 45);
  assert.equal(Number(snap.feePercent), 5);
  const ev = await orders.db.$queryRawUnsafe<{ eventType: string; consumer: string }[]>(`SELECT "eventType","consumer" FROM "OutboxMessage" WHERE "envelope"->'data'->>'orderNumber' = $1`, o.orderNumber);
  assert.ok(ev.some((e) => e.eventType === "OrderCreated" && e.consumer === "notification"));
  assert.ok(ev.some((e) => e.eventType === "OrderConfirmed"));
});

test("idempotency key: a retried checkout returns the same order and reserves once", async () => {
  const s = await newStore();
  const p = await product(s.id);
  const req = body(s, [{ productId: p.productId, quantity: 1 }], { idempotencyKey: `idem-${s.id}` });
  const results = await Promise.all([O.post("/orders", req), O.post("/orders", req), O.post("/orders", req)]);
  assert.equal(new Set(results.map((r) => r.orderNumber)).size, 1);
  assert.equal(await stock(p.productId), 9, "stock taken exactly once");
  assert.equal((await wallet(s.id)).holds, 22.5);
});

test("validation and policy gates", async () => {
  const s = await newStore();
  const p = await product(s.id);
  const bad = (extra: any, items = [{ productId: p.productId, quantity: 1 }]) => O.post("/orders", body(s, items, extra));
  await expectErr(bad({ buyer: { name: "", phone: "017" } }), "VALIDATION", 400);
  await expectErr(bad({ buyer: { name: "A", phone: "abc" } }), "VALIDATION", 400);
  await expectErr(bad({ shipping: { address: "" } }), "VALIDATION", 400);
  await expectErr(bad({}, [{ productId: p.productId, quantity: 0 }]), "VALIDATION", 400);
  await expectErr(bad({}, [{ productId: p.productId, quantity: 1.5 }]), "VALIDATION", 400);
  await expectErr(bad({}, []), "VALIDATION", 400);
  await expectErr(bad({ paymentMethod: "BITCOIN" }), "VALIDATION", 400);
  await expectErr(O.post("/orders", { ...body(s, [{ productId: p.productId, quantity: 1 }]), storeId: "nope" }), "STORE_NOT_FOUND", 404);
  await expectErr(bad({ paymentMethod: "SSLCOMMERZ" }), "ONLINE_DISABLED", 400); // SSLCommerz is on hold
  await expectErr(bad({ buyer: { id: s.ownerId, name: "Owner", phone: "01712345678" } }), "SELF_PURCHASE", 403);
  await expectErr(O.post("/orders", body(s, [{ productId: p.productId, quantity: 11 }])), "OUT_OF_STOCK", 409);
  const other = await newStore();
  await expectErr(O.post("/orders", body(other, [{ productId: p.productId, quantity: 1 }])), "INVALID_PRODUCT", 400); // another tenant's product
});

test("store status gates: paused stores refuse orders, COD-blocked stores refuse COD", async () => {
  const paused = await newStore();
  const p1 = await product(paused.id);
  await L.post(`/wallets/${paused.id}/status`, { status: "PAUSED", admin: "root", reason: "test" });
  await expectErr(O.post("/orders", body(paused, [{ productId: p1.productId, quantity: 1 }])), "STORE_NOT_ACCEPTING", 403);

  const blocked = await newStore(50); // available 50 < hard 100 -> COD_BLOCKED
  const p2 = await product(blocked.id);
  assert.equal((await wallet(blocked.id)).status, "COD_BLOCKED");
  await expectErr(O.post("/orders", body(blocked, [{ productId: p2.productId, quantity: 1 }])), "COD_UNAVAILABLE", 409);
  assert.equal(await stock(p2.productId), 10, "nothing was reserved");
});

test("saga compensation: a fee hold the wallet cannot cover releases the reserved stock", async () => {
  const s = await newStore(120); // WARNING, COD still allowed, but a 300 fee will not fit
  const p = await product(s.id, { price: 3000, stock: 5 });
  await expectErr(O.post("/orders", body(s, [{ productId: p.productId, quantity: 2 }])), "COD_UNAVAILABLE", 409);
  assert.equal(await stock(p.productId), 5, "stock reservation compensated");
  assert.equal((await wallet(s.id)).holds, 0);
  const failed = await orders.db.order.findFirstOrThrow({ where: { storeId: s.id } });
  assert.equal(failed.status, "CANCELLED");
  const note = await orders.db.orderEvent.findFirstOrThrow({ where: { orderId: failed.id, toStatus: "CANCELLED" } });
  assert.match(note.note ?? "", /Checkout failed/);
});

test("two buyers racing for the last unit: exactly one order, no oversell, one hold", async () => {
  const s = await newStore();
  const p = await product(s.id, { stock: 1 });
  const res = await Promise.allSettled([1, 2, 3].map(() => O.post("/orders", body(s, [{ productId: p.productId, quantity: 1 }]))));
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await stock(p.productId), 0);
  assert.equal((await wallet(s.id)).holds, 22.5);
  const losers = res.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.ok(losers.every((l) => ["OUT_OF_STOCK"].includes(l.reason.code)));
});

test("COD lifecycle across services: ship -> deliver settles the fee; refuse/cancel release it and restock", async () => {
  const s = await newStore();
  const p = await product(s.id, { stock: 10 });
  const place = (q: number) => O.post("/orders", body(s, [{ productId: p.productId, quantity: q }]));
  const move = (id: string, to: string, extra: any = {}) => O.patch(`/orders/${id}/status`, { to, source: "SELLER", storeId: s.id, ...extra });

  // delivered: fee hold (45) becomes a confirmed debit
  const a = await place(2);
  await move(a.id, "SHIPPED", { courier: "Pathao", trackingNumber: "TRK1" });
  const delivered = await move(a.id, "DELIVERED");
  assert.equal(delivered.previousStatus, "SHIPPED");
  await pump();
  let w = await wallet(s.id);
  assert.equal(w.balance, 4955);
  assert.equal(w.holds, 0);
  const fee = (await L.get("/admin/platform-accounts")).accounts.find((x: any) => x.code === "PLATFORM_FEE_REVENUE");
  assert.ok(fee.net >= 45);

  // refused after shipping: hold released, seller not charged, stock back
  const before = await stock(p.productId);
  const b = await place(3);
  await move(b.id, "SHIPPED");
  await move(b.id, "REFUSED");
  await pump();
  w = await wallet(s.id);
  assert.equal(w.balance, 4955);
  assert.equal(w.holds, 0);
  assert.equal(await stock(p.productId), before);

  // cancelled before shipping: same
  const c = await place(1);
  assert.equal((await wallet(s.id)).holds, 22.5);
  await move(c.id, "CANCELLED");
  await pump();
  assert.equal((await wallet(s.id)).holds, 0);
  assert.equal(await stock(p.productId), before);

  // replaying the whole outbox changes nothing (consumers are idempotent)
  await orders.db.$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0, "availableAt" = now()`);
  await pump();
  w = await wallet(s.id);
  assert.equal(w.balance, 4955);
  assert.equal(w.holds, 0);
  assert.equal(await stock(p.productId), before);
  assert.deepEqual((await L.get("/admin/reconcile")).mismatches, []);
});

test("state machine: legal paths only, terminal states are final, sellers are tenant-scoped", async () => {
  const s = await newStore();
  const other = await newStore();
  const p = await product(s.id);
  const o = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 1 }]));
  const move = (to: string, extra: any = {}) => O.patch(`/orders/${o.id}/status`, { to, source: "SELLER", storeId: s.id, ...extra });

  await expectErr(move("DELIVERED"), "INVALID_TRANSITION", 409); // must ship first
  await expectErr(move("CONFIRMED"), "INVALID_TRANSITION", 409);
  await expectErr(O.patch(`/orders/${o.id}/status`, { to: "PROCESSING", source: "SELLER", storeId: other.id }), "NOT_FOUND", 404);
  await move("PROCESSING");
  await move("SHIPPED");
  await move("DELIVERED");
  await expectErr(move("CANCELLED"), "INVALID_TRANSITION", 409);
  assert.equal((await move("DELIVERED")).unchanged, true, "terminal replay is a no-op");
  const full = await O.get(`/orders/by-number/${o.orderNumber}`);
  assert.deepEqual(full.events.map((e: any) => e.to), ["PLACING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);

  // when couriers own delivery outcomes, sellers cannot self-report them
  process.env.ALLOW_SELLER_FINALIZE = "false";
  try {
    const o2 = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 1 }]));
    await O.patch(`/orders/${o2.id}/status`, { to: "SHIPPED", source: "SELLER", storeId: s.id });
    await expectErr(O.patch(`/orders/${o2.id}/status`, { to: "DELIVERED", source: "SELLER", storeId: s.id }), "INVALID_TRANSITION", 409);
    assert.equal((await O.patch(`/orders/${o2.id}/status`, { to: "DELIVERED", source: "COURIER", actor: "Pathao" })).status, "DELIVERED");
  } finally { delete process.env.ALLOW_SELLER_FINALIZE; }
});

test("buyers can cancel only their own orders; courier webhook events drive the machine", async () => {
  const s = await newStore();
  const p = await product(s.id);
  const o = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 1 }], { buyer: { id: "buyer_1", name: "Rina", phone: "01812345678" } }));
  await expectErr(O.patch(`/orders/${o.id}/status`, { to: "CANCELLED", source: "BUYER", actor: "buyer_2" }), "INVALID_TRANSITION", 409);
  await expectErr(O.patch(`/orders/${o.id}/status`, { to: "SHIPPED", source: "BUYER", actor: "buyer_1" }), "INVALID_TRANSITION", 409);

  const o2 = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 1 }]));
  const ev = (status: string, id: string) => ({ eventId: id, eventType: "ShipmentUpdated", timestamp: new Date().toISOString(), producer: "notification", data: { orderNumber: o2.orderNumber, status, courier: "RedX", trackingNumber: "RX9" } });
  await O.post("/internal/events", ev("SHIPPED", "s1"));
  await O.post("/internal/events", ev("DELIVERED", "s2"));
  await O.post("/internal/events", ev("SHIPPED", "s3")); // stale, out-of-order: ignored not failed
  const done = await O.get(`/orders/${o2.id}`);
  assert.equal(done.status, "DELIVERED");
  assert.equal(done.trackingNumber, "RX9");

  await O.patch(`/orders/${o.id}/status`, { to: "CANCELLED", source: "BUYER", actor: "buyer_1" });
  assert.equal((await O.get(`/orders/${o.id}`)).status, "CANCELLED");
  assert.equal((await O.get(`/buyers/buyer_1/orders`)).orders.length, 1);
  assert.equal((await O.get(`/stores/${s.id}/orders`)).orders.length, 2);
});

test("wholesale: login + Buyer Pro + Seller plan + MOQ + tier pricing + COD cap + no self-purchase", async () => {
  const s = await newStore(50000);
  const p = await product(s.id, { name: "Bulk", price: 400, channel: "BOTH", wholesalePrice: 300, moq: 10, stock: 5000, tiers: [{ minQty: 100, unitPrice: 250 }] });
  const W = (qty: number, buyer: any, extra: any = {}) => O.post("/orders", body(s, [{ productId: p.productId, quantity: qty }], { orderType: "WHOLESALE", buyer: { name: "Trader", phone: "01912345678", ...buyer }, ...extra }));

  await expectErr(W(10, {}), "LOGIN_REQUIRED", 401);
  await expectErr(W(10, { id: "trader_1" }), "PRO_REQUIRED", 403);
  proBuyers.add("trader_1");
  await expectErr(W(10, { id: "trader_1" }), "SELLER_PLAN_REQUIRED", 403);
  sellerPlans.add(s.id);
  await expectErr(W(9, { id: "trader_1" }), "MOQ_NOT_MET", 400);
  await expectErr(W(10, { id: s.ownerId }), "SELF_PURCHASE", 403);

  const ok = await W(100, { id: "trader_1" }); // tier price 250 x 100 = 25,000
  assert.equal(ok.orderType, "WHOLESALE");
  assert.equal(ok.totalAmount, 25000);
  assert.equal(ok.platformFee, 1250);
  assert.equal(ok.status, "CONFIRMED");

  await expectErr(W(300, { id: "trader_1" }), "PREPAID_REQUIRED", 409); // 75,000 > 50,000 COD cap
  billingDown = true;
  await expectErr(W(10, { id: "trader_1" }), "SERVICE_UNAVAILABLE", 503); // fails closed with an honest error
  billingDown = false;
  // a retail order for the same product still prices at the retail price
  const retail = await O.post("/orders", body(s, [{ productId: p.productId, quantity: 2 }]));
  assert.equal(retail.totalAmount, 800);
});

test("online orders (SSLCommerz on hold, flag on): stock held 15 min, no fee hold, paid -> confirmed, unpaid -> cancelled + restocked", async () => {
  process.env.ONLINE_PAYMENTS_ENABLED = "true";
  try {
    const s = await newStore();
    const p = await product(s.id, { stock: 10 });
    const place = (q: number) => O.post("/orders", body(s, [{ productId: p.productId, quantity: q }], { paymentMethod: "SSLCOMMERZ" }));

    const a = await place(2);
    assert.equal(a.status, "PENDING_PAYMENT");
    assert.ok(a.reservationExpiresAt);
    assert.equal(await stock(p.productId), 8);
    assert.equal((await wallet(s.id)).holds, 0, "no COD fee hold for prepaid orders");

    const paid = { eventId: `pay-${a.orderNumber}`, eventType: "PaymentCaptured", timestamp: new Date().toISOString(), producer: "payment", data: { purpose: "STORE_ORDER", orderNumber: a.orderNumber, tranId: "TR-1", storeId: s.id } };
    await O.post("/internal/events", paid);
    const confirmed = await O.get(`/orders/${a.id}`);
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.paymentRef, "TR-1");
    assert.equal((await C.post("/inventory/commit", { orderRef: a.orderNumber })).duplicate, true, "stock was committed on payment");

    // unpaid: window expires -> cancelled -> stock returns (via the OrderCancelled event)
    const b = await place(3);
    assert.equal(await stock(p.productId), 5);
    await orders.db.order.update({ where: { id: b.id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    const sweep = await O.post("/admin/sweep");
    assert.ok(sweep.expiry.cancelled >= 1);
    await pump();
    assert.equal((await O.get(`/orders/${b.id}`)).status, "CANCELLED");
    assert.equal(await stock(p.productId), 8);

    // gateway failure cancels too
    const c = await place(1);
    await O.post("/internal/events", { eventId: `fail-${c.orderNumber}`, eventType: "PaymentFailed", timestamp: new Date().toISOString(), producer: "payment", data: { orderNumber: c.orderNumber, reason: "declined" } });
    assert.equal((await O.get(`/orders/${c.id}`)).status, "CANCELLED");
    await pump();
    assert.equal(await stock(p.productId), 8);
  } finally { delete process.env.ONLINE_PAYMENTS_ENABLED; }
});

test("saga recovery: an order stuck in PLACING (crash mid-checkout) is rolled back", async () => {
  const s = await newStore();
  const p = await product(s.id, { stock: 10 });
  const orderNumber = "ORD-STUCK001";
  // simulate a crash after reserve + hold but before finalisation
  await C.post("/inventory/reserve", { orderRef: orderNumber, storeId: s.id, items: [{ productId: p.productId, quantity: 4 }], ttlMinutes: 15 });
  await L.post(`/wallets/${s.id}/holds`, { reference: orderNumber, amount: 90 });
  const stuck = await orders.db.order.create({
    data: {
      orderNumber, storeId: s.id, storeSlug: s.slug, storeName: s.name, ownerId: s.ownerId, buyerName: "X", buyerEmail: "x@y.z", buyerPhone: "01712345678",
      shippingAddress: "addr", paymentMethod: "COD", status: "PLACING", totalAmount: 1800, platformFee: 90, sellerNet: 1710,
      createdAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  assert.equal(await stock(p.productId), 6);
  assert.equal((await wallet(s.id)).holds, 90);

  const sweep = await O.post("/admin/sweep");
  assert.ok(sweep.recovery.recovered >= 1);
  assert.equal((await orders.db.order.findUniqueOrThrow({ where: { id: stuck.id } })).status, "CANCELLED");
  assert.equal(await stock(p.productId), 10);
  assert.equal((await wallet(s.id)).holds, 0);
  assert.equal((await O.get("/admin/stats")).byStatus.PLACING ?? 0, 0);
});

test("checkout/validate previews prices and what the buyer may choose", async () => {
  const s = await newStore();
  const p = await product(s.id, { price: 1000 });
  const v = await O.post("/checkout/validate", { storeId: s.id, items: [{ id: p.productId, quantity: 3 }] });
  assert.equal(v.subtotal, 3000);
  assert.equal(v.fee, 150);
  assert.equal(v.codAllowed, true);
  assert.equal(v.onlinePaymentsEnabled, false);
  assert.equal(await stock(p.productId), 10, "validation reserves nothing");
});
