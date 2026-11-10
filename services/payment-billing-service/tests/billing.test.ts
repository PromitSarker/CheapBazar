import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startBillingService } from "../src/app";
import { SSLCommerzGateway, verifySslcommerzSignature } from "../src/gateway";
import { FakeGateway, FakeLedger, FakeOrders, STORE_PASSWORD, ipnBody } from "./helpers";

const SECRET = "test-secret";
const PORT = 14104;
const OFF_PORT = 14204;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";
const DAY = 86_400_000;

let svc: Awaited<ReturnType<typeof startBillingService>>;
let off: Awaited<ReturnType<typeof startBillingService>>;
let B: ReturnType<typeof serviceClient>;
let OFF: ReturnType<typeof serviceClient>;
const gw = new FakeGateway();
const ledger = new FakeLedger();
const orders = new FakeOrders();

let now = new Date(); // simulated clock: starts at the real time, only moves forward
const clock = () => now;
const advance = (ms: number) => { now = new Date(now.getTime() + ms); };

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "payment_billing_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startBillingService({ secret: SECRET, port: PORT, databaseUrl: url, relay: false, worker: false, gateway: gw, ledger, orders, clock, config: { onlinePaymentsEnabled: true, appUrl: "https://shop.example.com" } });
  off = await startBillingService({ secret: SECRET, port: OFF_PORT, databaseUrl: url, relay: false, worker: false, seedPlans: false, gateway: gw, ledger, orders, clock, config: { onlinePaymentsEnabled: false } });
  B = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
  OFF = serviceClient({ baseUrl: `http://127.0.0.1:${OFF_PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await off.stop(); await svc.stop(); });

let n = 0;
const uid = (p: string) => `${p}${++n}_${Math.random().toString(36).slice(2, 6)}`;

/** Unique events of a type (the outbox holds one row per consumer). */
async function events(type: string, match?: (d: any) => boolean) {
  const rows = await svc.db.outboxMessage.findMany({ where: { eventType: type }, orderBy: { createdAt: "asc" } });
  const byId = new Map<string, any>();
  for (const r of rows) byId.set(r.eventId, r.envelope);
  return [...byId.values()].filter((e) => !match || match(e.data));
}
const newOrder = (storeId: string, extra: any = {}) => orders.add({ orderNumber: uid("ORD"), storeId, ...extra });
const charge = (body: any) => B.post<any>("/payments/charge", { idempotencyKey: uid("k"), ...body });
const expectCode = (p: Promise<any>, code: string) => assert.rejects(p, (e: any) => e.code === code);
const webhook = (raw: string) =>
  fetch(`http://127.0.0.1:${PORT}/payments/webhooks/sslcommerz`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: raw });
const json = async (r: Response): Promise<any> => r.json();
const status = async (tranId: string) => (await B.get<any>(`/payments/${tranId}`)).status;

// ------------------------------------------------------------------ basics

test("plans are seeded and an unknown subject has no entitlement (fails closed)", async () => {
  const { plans } = await B.get<any>("/plans");
  assert.deepEqual(plans.map((p: any) => p.code), ["BUYER_PRO"]);
  assert.equal((await B.get<any>("/subscriptions/buyer/nobody/status")).active, false);
});

test("internal auth is required except on the gateway webhook", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/plans`);
  assert.equal(r.status, 401);
  const w = await webhook("tran_id=x");
  assert.equal(w.status, 401); // reaches the handler (no bearer needed) and fails on the signature, not on auth
  assert.equal((await json(w)).code, "BAD_SIGNATURE");
});

test("while ONLINE_PAYMENTS_ENABLED=false nothing can start a gateway session, but wallets and plans still work", async () => {
  await expectCode(OFF.post("/payments/charge", { purpose: "WALLET_TOPUP", storeId: "x", amount: 100, idempotencyKey: "z" }), "ONLINE_DISABLED");
  const w = await fetch(`http://127.0.0.1:${OFF_PORT}/payments/webhooks/sslcommerz`, { method: "POST", body: "tran_id=x" });
  assert.equal(w.status, 503);
  assert.equal((await OFF.get<any>("/subscriptions/buyer/b/status")).active, false);
  // a buyer can still pay for Pro by hand, and the admin can still approve it
  const u = uid("user");
  const { payment } = await OFF.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", userId: u, trxId: uid("TRX").replace(/_/g, "").toUpperCase(), idempotencyKey: uid("k") });
  await OFF.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a" });
  assert.equal((await OFF.get<any>(`/subscriptions/buyer/${u}/status`)).active, true);
});

// ------------------------------------------------------- online order payments

test("order payment: the amount comes from the order, never the caller; capture publishes PaymentCaptured once", async () => {
  const store = ledger.addStore(uid("st"));
  const o = newOrder(store, { totalAmount: 2400, platformFee: 120, sellerNet: 2280 });
  const key = uid("k");
  const r = await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber, amount: 1, idempotencyKey: key });
  assert.equal(r.payment.amount, 2400);
  assert.match(r.payment.tranId, /^SF-ORD-[0-9A-F]{12}$/);
  assert.match(r.payment.gatewayUrl, /fake-gw/);

  // same key again: the same payment, no second gateway session
  const inits = gw.initCalls;
  const again = await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber, idempotencyKey: key });
  assert.equal(again.duplicate, true);
  assert.equal(again.payment.tranId, r.payment.tranId);
  assert.equal(gw.initCalls, inits);
  // a different order under the same key is refused
  const o2 = newOrder(store);
  await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: o2.orderNumber, idempotencyKey: key }), "IDEMPOTENCY_MISMATCH");
  // a new key for the same order reuses the open session
  const reuse = await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber });
  assert.equal(reuse.payment.tranId, r.payment.tranId);

  const valId = gw.pay(r.payment.tranId);
  const c = await B.post<any>(`/payments/${r.payment.tranId}/reconcile`);
  assert.equal(c.status, "CAPTURED");
  assert.equal((await B.post<any>(`/payments/${r.payment.tranId}/reconcile`)).status, "CAPTURED");
  const ev = await events("PaymentCaptured", (d) => d.orderNumber === o.orderNumber);
  assert.equal(ev.length, 1);
  assert.deepEqual(
    { purpose: ev[0].data.purpose, total: ev[0].data.total, fee: ev[0].data.fee, net: ev[0].data.net, tranId: ev[0].data.tranId, storeId: ev[0].data.storeId },
    { purpose: "STORE_ORDER", total: 2400, fee: 120, net: 2280, tranId: r.payment.tranId, storeId: store }
  );
  assert.ok(valId);
  await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber }), "ALREADY_PAID");
});

test("order payment: COD orders, unpayable orders and unknown orders are refused", async () => {
  const store = ledger.addStore(uid("st"));
  await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: newOrder(store, { paymentMethod: "COD", status: "CONFIRMED" }).orderNumber }), "NOT_ONLINE");
  await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: newOrder(store, { status: "CANCELLED" }).orderNumber }), "ORDER_NOT_PAYABLE");
  await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: "NOPE-1" }), "ORDER_NOT_FOUND");
  await expectCode(charge({ purpose: "BOGUS" }), "VALIDATION");
});

test("audit #5: a validation that does not match never blocks the later valid one", async () => {
  const o = newOrder(ledger.addStore(uid("st")), { totalAmount: 1000 });
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;

  const underpaid = gw.pay(p.tranId, { amount: 100 });                   // right tran id, wrong amount
  const wrongCurrency = gw.pay(p.tranId, { currency: "USD" });
  const wrongTran = gw.pay(p.tranId, { tranId: "SF-ORD-SOMEONEELSE" });  // val_id belongs to a different transaction
  for (const v of [underpaid, wrongCurrency, wrongTran]) {
    const r = await webhook(ipnBody({ tran_id: p.tranId, val_id: v, status: "VALID" }));
    assert.equal(r.status, 200);
    assert.equal((await json(r)).result, "REJECTED");
  }
  assert.equal(await status(p.tranId), "PENDING"); // nothing changed...
  const row = await svc.db.payment.findUniqueOrThrow({ where: { tranId: p.tranId } });
  assert.equal(row.validationFailures, 3);          // ...but the attempts are recorded
  assert.equal((await events("PaymentCaptured", (d) => d.tranId === p.tranId)).length, 0);

  const good = gw.pay(p.tranId);
  const r = await webhook(ipnBody({ tran_id: p.tranId, val_id: good, status: "VALID" }));
  assert.equal((await json(r)).result, "CAPTURED");
  assert.equal(await status(p.tranId), "CAPTURED");
});

test("audit #3: an IPN without a valid signature is rejected and changes nothing", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  const val = gw.pay(p.tranId);
  const fields = { tran_id: p.tranId, val_id: val, status: "VALID" };
  const validations = gw.validateCalls;

  const bad = [
    new URLSearchParams(fields).toString(),                                                        // unsigned
    ipnBody(fields, "wrong-password"),                                                             // signed by someone without our secret
    ipnBody(fields, STORE_PASSWORD, (f) => { f.tran_id = "SF-ORD-OTHER"; }),                       // tampered after signing
    ipnBody(fields, STORE_PASSWORD, (f) => { f.verify_key = "tran_id"; }),                         // trimmed signed-field list
    ipnBody(fields, STORE_PASSWORD, (f) => { delete f.val_id; }),                                  // a signed field removed
  ];
  for (const raw of bad) {
    const r = await webhook(raw);
    assert.equal(r.status, 401, raw);
  }
  assert.equal(await status(p.tranId), "PENDING");
  assert.equal(gw.validateCalls, validations); // none of the forged IPNs even reached the gateway
  // the genuine one works
  assert.equal((await json(await webhook(ipnBody(fields)))).result, "CAPTURED");
});

test("audit #4: redirects and failure notices never mutate state; only the gateway's answer does", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;

  // the browser lands on the "cancel" page, but the gateway says the buyer is still mid-payment
  await B.post(`/payments/${p.tranId}/reconcile`);
  assert.equal(await status(p.tranId), "PENDING");

  // a (signed) FAILED IPN while the gateway says it was actually paid: the payment is captured, not failed
  gw.pay(p.tranId);
  const r = await webhook(ipnBody({ tran_id: p.tranId, status: "FAILED" }));
  assert.equal((await json(r)).result, "CAPTURED");
  assert.equal((await events("PaymentFailed", (d) => d.tranId === p.tranId)).length, 0);
});

test("a payment the gateway reports failed/cancelled is closed once, and order-service is told", async () => {
  const store = ledger.addStore(uid("st"));
  const o = newOrder(store, { buyerPhone: "01711111111" });
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  gw.set(p.tranId, "CANCELLED");
  assert.equal((await B.post<any>(`/payments/${p.tranId}/reconcile`)).status, "CANCELLED");
  await B.post(`/payments/${p.tranId}/reconcile`);
  const ev = await events("PaymentFailed", (d) => d.tranId === p.tranId);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].data.orderNumber, o.orderNumber);
  assert.equal(ev[0].data.buyerPhone, "01711111111");
});

test("late money wins: a verified payment captures even after the session was marked failed or expired", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  gw.set(p.tranId, "FAILED");
  assert.equal((await B.post<any>(`/payments/${p.tranId}/reconcile`)).status, "FAILED");
  const val = gw.pay(p.tranId);
  assert.equal((await json(await webhook(ipnBody({ tran_id: p.tranId, val_id: val, status: "VALID" })))).result, "CAPTURED");
  const ev = await events("PaymentCaptured", (d) => d.tranId === p.tranId);
  assert.equal(ev.length, 1); // order-service logs "late payment, refund required" if it had already cancelled
});

test("IPN and browser return racing produce exactly one capture", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  const val = gw.pay(p.tranId);
  const results = await Promise.all([
    webhook(ipnBody({ tran_id: p.tranId, val_id: val, status: "VALID" })),
    B.post(`/payments/${p.tranId}/reconcile`),
    webhook(ipnBody({ tran_id: p.tranId, val_id: val, status: "VALID" })),
    B.post(`/payments/${p.tranId}/reconcile`),
  ]);
  assert.ok(results.length === 4);
  assert.equal(await status(p.tranId), "CAPTURED");
  assert.equal((await events("PaymentCaptured", (d) => d.tranId === p.tranId)).length, 1);
});

test("gateway unreachable: verification answers 503 and leaves the payment untouched, so it can be retried", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  const val = gw.pay(p.tranId);
  gw.down = true;
  try {
    assert.equal((await webhook(ipnBody({ tran_id: p.tranId, val_id: val, status: "VALID" }))).status, 503);
    await expectCode(B.post(`/payments/${p.tranId}/reconcile`), "GATEWAY_UNREACHABLE");
    assert.equal(await status(p.tranId), "PENDING");
    assert.equal((await svc.db.payment.findUniqueOrThrow({ where: { tranId: p.tranId } })).validationFailures, 0); // an outage is not a fraud signal
  } finally { gw.down = false; }
  assert.equal((await B.post<any>(`/payments/${p.tranId}/reconcile`)).status, "CAPTURED");
});

test("gateway refusing to start a session: 502, payment closed without an order event, retry works", async () => {
  const o = newOrder(ledger.addStore(uid("st")));
  gw.failInit = true;
  try { await expectCode(charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber }), "GATEWAY_ERROR"); } finally { gw.failInit = false; }
  const [failed] = (await B.get<any>(`/payments?orderNumber=${o.orderNumber}`)).payments;
  assert.equal(failed.status, "FAILED");
  assert.equal((await events("PaymentFailed", (d) => d.orderNumber === o.orderNumber)).length, 0);
  const retry = await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber });
  assert.equal(retry.payment.status, "PENDING");
  assert.notEqual(retry.payment.tranId, failed.tranId);
});

test("payments are only visible to the store or user they belong to", async () => {
  const store = ledger.addStore(uid("st"));
  const o = newOrder(store);
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  assert.equal((await B.get<any>(`/payments/${p.tranId}?storeId=${store}`)).tranId, p.tranId);
  await expectCode(B.get(`/payments/${p.tranId}?storeId=someone-else`), "NOT_FOUND");
});

// ------------------------------------------------------------- wallet top-ups

test("gateway top-up: validated amount, wallet must exist, capture publishes PaymentCaptured for the ledger", async () => {
  const store = ledger.addStore(uid("st"));
  await expectCode(charge({ purpose: "WALLET_TOPUP", storeId: store, amount: 5 }), "VALIDATION");
  await expectCode(charge({ purpose: "WALLET_TOPUP", storeId: store, amount: 9_999_999 }), "VALIDATION");
  await expectCode(charge({ purpose: "WALLET_TOPUP", storeId: "no-such-store", amount: 500 }), "STORE_NOT_FOUND");
  const p = (await charge({ purpose: "WALLET_TOPUP", storeId: store, amount: 750 })).payment;
  gw.pay(p.tranId);
  await B.post(`/payments/${p.tranId}/reconcile`);
  const ev = await events("PaymentCaptured", (d) => d.tranId === p.tranId);
  assert.equal(ev.length, 1);
  assert.deepEqual({ purpose: ev[0].data.purpose, total: ev[0].data.total, storeId: ev[0].data.storeId }, { purpose: "WALLET_TOPUP", total: 750, storeId: store });
});

// ---------------------------------------------------------------- manual payments

test("manual top-up: validation, one transfer claimed once, idempotency, pending cap", async () => {
  const store = ledger.addStore(uid("st"));
  const body = (extra: any = {}) => ({ storeId: store, amount: 1000, method: "BKASH", trxId: uid("TRX").toUpperCase().replace(/_/g, ""), idempotencyKey: uid("k"), ...extra });
  await expectCode(B.post("/topups/manual", body({ method: "PAYPAL" })), "VALIDATION");
  await expectCode(B.post("/topups/manual", body({ trxId: "x" })), "VALIDATION");
  await expectCode(B.post("/topups/manual", body({ amount: 2 })), "VALIDATION");
  await expectCode(B.post("/topups/manual", body({ storeId: "ghost" })), "STORE_NOT_FOUND");

  const a = body();
  const r = await B.post<any>("/topups/manual", a);
  assert.equal(r.payment.status, "PENDING");
  assert.match(r.payment.reference, /^MP-[0-9A-F]{8}$/);
  assert.equal((await B.post<any>("/topups/manual", a)).duplicate, true); // same key: same payment
  await expectCode(B.post("/topups/manual", body({ trxId: a.trxId })), "DUPLICATE_TRX"); // same bKash trx, new key
  await expectCode(B.post("/topups/manual", { ...a, amount: 5000 }), "IDEMPOTENCY_MISMATCH");
  // the same trx id on a different method is a different transfer
  assert.equal((await B.post<any>("/topups/manual", body({ trxId: a.trxId, method: "NAGAD" }))).success, true);

  for (let i = 0; i < 3; i++) await B.post("/topups/manual", body()); // 5 pending now
  await expectCode(B.post("/topups/manual", body()), "TOO_MANY_PENDING");
});

test("manual top-up approval publishes TopUpApproved + ManualPaymentReviewed once; two admins cannot both approve", async () => {
  const store = ledger.addStore(uid("st"));
  const { payment } = await B.post<any>("/topups/manual", { storeId: store, userId: "u1", amount: 1500, method: "BKASH", trxId: uid("TRX").replace(/_/g, "").toUpperCase(), idempotencyKey: uid("k") });
  const review = (admin: string) => B.patch<any>(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin });
  const results = await Promise.allSettled([review("a1"), review("a2"), review("a3")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.equal((r.reason as any).code, "NOT_PENDING");

  const up = await events("TopUpApproved", (d) => d.paymentRef === payment.reference);
  assert.equal(up.length, 1);
  assert.deepEqual({ storeId: up[0].data.storeId, amount: up[0].data.amount }, { storeId: store, amount: 1500 });
  const rev = await events("ManualPaymentReviewed", (d) => d.reference === payment.reference);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].data.status, "APPROVED");
  await expectCode(review("a4"), "NOT_PENDING");
});

test("manual payment rejection needs a reason, and a rejected payment moves no money", async () => {
  const store = ledger.addStore(uid("st"));
  const { payment } = await B.post<any>("/topups/manual", { storeId: store, amount: 500, method: "BANK", trxId: uid("TRX").replace(/_/g, "").toUpperCase(), idempotencyKey: uid("k") });
  await expectCode(B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "REJECT", admin: "a" }), "VALIDATION");
  await expectCode(B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "MAYBE", admin: "a" }), "VALIDATION");
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "REJECT", admin: "a", note: "No such transfer in the statement" });
  assert.equal((await events("TopUpApproved", (d) => d.paymentRef === payment.reference)).length, 0);
  const rev = await events("ManualPaymentReviewed", (d) => d.reference === payment.reference);
  assert.deepEqual({ status: rev[0].data.status, note: rev[0].data.note }, { status: "REJECTED", note: "No such transfer in the statement" });
  const { payments } = await B.get<any>(`/topups/manual?storeId=${store}`);
  assert.equal(payments[0].status, "REJECTED");
});

// ----------------------------------------------------------------- subscriptions

const trx = () => uid("TRX").replace(/_/g, "").toUpperCase();
/** A buyer submits a manual Buyer Pro payment (the amount is always the server's price). */
const submitPro = (userId: string, extra: any = {}) =>
  B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "NAGAD", userId, trxId: trx(), idempotencyKey: uid("k"), ...extra });
const approve = (id: string) => B.patch<any>(`/admin/manual-payments/${id}/review`, { decision: "APPROVE", admin: "a1" });
const buyerStatus = (u: string) => B.get<any>(`/subscriptions/buyer/${u}/status`);
const invoices = async (u: string) => (await B.get<any>(`/subscriptions/invoices?userId=${u}`)).invoices;
const revenue = (ref: string) => events("PlatformRevenueReceived", (d) => d.reference === ref);

test("Buyer Pro is the only plan: sellers pay nothing, there is no seller entitlement and no wallet payment", async () => {
  await expectCode(B.post("/subscriptions/subscribe", { plan: "SELLER_PRO", method: "MANUAL", transferMethod: "BKASH", storeId: "s", trxId: "TRX00009", idempotencyKey: uid("k") }), "VALIDATION");
  await expectCode(B.post("/admin/plans", { code: "SELLER_PRO", name: "x", price: 10 }), "VALIDATION");
  await expectCode(B.get("/subscriptions/seller/some-store/status"), "NOT_FOUND");
  await expectCode(B.post("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "WALLET", userId: "u", idempotencyKey: uid("k") }), "VALIDATION"); // buyers have no wallet
  assert.deepEqual((await B.get<any>("/plans")).plans.map((p: any) => p.code), ["BUYER_PRO"]);
});

test("plan price is decided by the server: a buyer cannot underpay for Pro; it needs a buyer account", async () => {
  const user = uid("user");
  await expectCode(submitPro(user, { amount: 1 }), "AMOUNT_MISMATCH");
  await expectCode(B.post("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", trxId: "TRX00002", idempotencyKey: uid("k") }), "VALIDATION"); // no userId
});

test("Buyer Pro paid manually: pending grants nothing; approval activates it and sends the fee to the PLATFORM (admin) account", async () => {
  const user = uid("user");
  const { payment } = await submitPro(user);
  assert.equal(payment.amount, 499);
  assert.equal((await buyerStatus(user)).active, false);
  assert.equal((await revenue(payment.reference)).length, 0); // not received until an admin verifies it

  await approve(payment.id);
  const st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: true, status: "ACTIVE" });
  assert.equal((await events("SubscriptionActivated", (d) => d.userId === user)).length, 1);

  const rev = await revenue(payment.reference);
  assert.equal(rev.length, 1);
  assert.deepEqual(
    { source: rev[0].data.source, amount: rev[0].data.amount, method: rev[0].data.method, userId: rev[0].data.userId },
    { source: "BUYER_PRO", amount: 499, method: "MANUAL", userId: user }
  );
  const inv = await invoices(user);
  assert.deepEqual({ n: inv.length, amount: inv[0].amount, method: inv[0].method }, { n: 1, amount: 499, method: "MANUAL" });
});

test("Buyer Pro through the gateway: capture activates it and books GATEWAY revenue, exactly once even when the callbacks race", async () => {
  const user = uid("user");
  const r = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "GATEWAY", userId: user, idempotencyKey: uid("k"), buyer: { name: "Rafi", email: "r@example.com", phone: "01712345678" } });
  assert.equal(r.payment.amount, 499);
  gw.pay(r.payment.tranId);
  await Promise.all([B.post(`/payments/${r.payment.tranId}/reconcile`), B.post(`/payments/${r.payment.tranId}/reconcile`), B.post(`/payments/${r.payment.tranId}/reconcile`)]);
  assert.equal((await buyerStatus(user)).active, true);
  assert.equal((await invoices(user)).length, 1);
  assert.equal((await events("SubscriptionActivated", (d) => d.userId === user)).length, 1);
  const rev = await revenue(r.payment.tranId);
  assert.equal(rev.length, 1);
  assert.deepEqual({ amount: rev[0].data.amount, method: rev[0].data.method }, { amount: 499, method: "GATEWAY" });
});

test("a rejected manual payment grants no access and earns nothing", async () => {
  const user = uid("user");
  const { payment } = await submitPro(user);
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "REJECT", admin: "a1", note: "Transfer not found" });
  assert.equal((await buyerStatus(user)).active, false);
  assert.equal((await revenue(payment.reference)).length, 0);
  assert.equal((await events("SubscriptionActivated", (d) => d.userId === user)).length, 0);
});

test("the platform books what the buyer ACTUALLY paid, even if the list price changed before approval", async () => {
  const user = uid("user");
  const { payment } = await submitPro(user); // 499
  try {
    await B.post("/admin/plans", { code: "BUYER_PRO", price: 800 });
    await approve(payment.id);
    assert.equal((await invoices(user))[0].amount, 499);
    assert.equal((await revenue(payment.reference))[0].data.amount, 499);
    // new payments use the new price; old invoices are untouched
    const next = await submitPro(user);
    assert.equal(next.payment.amount, 800);
    await B.post("/admin/plans", { code: "BUYER_PRO", active: false });
    await expectCode(submitPro(uid("user")), "PLAN_UNAVAILABLE");
    await expectCode(B.post("/admin/plans", { code: "BUYER_PRO", price: -5 }), "VALIDATION");
  } finally {
    await B.post("/admin/plans", { code: "BUYER_PRO", price: 499, active: true });
  }
});

test("paying early stacks on the remaining time, and every paid month is its own invoice and its own platform revenue", async () => {
  const user = uid("user");
  const first = (await submitPro(user)).payment;
  await approve(first.id);
  advance(10 * DAY);
  const second = (await submitPro(user)).payment;
  await approve(second.id);
  const st = await buyerStatus(user);
  assert.ok(new Date(st.currentPeriodEnd).getTime() - now.getTime() > 49 * DAY); // 20 days left + a new 30
  assert.equal((await invoices(user)).length, 2);
  assert.equal((await revenue(first.reference)).length + (await revenue(second.reference)).length, 2);
});

test("lifecycle: Active -> Grace (still has access) -> Lapsed; nobody is charged automatically; paying again restores it", async () => {
  const user = uid("user");
  await approve((await submitPro(user)).payment.id);
  advance(30 * DAY + 3_600_000);
  await svc.runTick();
  let st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: true, status: "GRACE" }); // still inside the 3 day grace
  assert.equal((await events("SubscriptionEnteredGrace", (d) => d.userId === user)).length, 1);
  assert.equal((await events("SubscriptionLapsed", (d) => d.userId === user)).length, 0);

  advance(2 * DAY);
  await svc.runTick();
  assert.equal((await buyerStatus(user)).status, "GRACE");

  advance(2 * DAY);
  await svc.runTick();
  await svc.runTick(); // a second run changes nothing
  st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: false, status: "LAPSED" });
  assert.equal((await events("SubscriptionLapsed", (d) => d.userId === user)).length, 1);

  await approve((await submitPro(user)).payment.id); // pays again
  st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: true, status: "ACTIVE" });
  assert.equal((await invoices(user)).length, 2);
});

test("paying during grace restores access without waiting for the scheduler", async () => {
  const user = uid("user");
  await approve((await submitPro(user)).payment.id);
  advance(31 * DAY);
  await svc.runTick(); // GRACE
  await approve((await submitPro(user)).payment.id);
  const st = await buyerStatus(user);
  assert.deepEqual({ status: st.status, graceEndsAt: st.graceEndsAt }, { status: "ACTIVE", graceEndsAt: null });
});

test("entitlement is checked against the clock on every read, even if the scheduler never ran", async () => {
  const user = uid("user");
  await approve((await submitPro(user)).payment.id);
  advance(31 * DAY); // month over, tick never ran
  let st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: true, status: "GRACE" });
  advance(10 * DAY);
  st = await buyerStatus(user);
  assert.deepEqual({ active: st.active, status: st.status }, { active: false, status: "LAPSED" });
});

test("admin revenue view: gross, charged-back and net Buyer Pro earnings", async () => {
  const before = await B.get<any>("/admin/revenue");
  const user = uid("user");
  const r = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "GATEWAY", userId: user, idempotencyKey: uid("k") });
  gw.pay(r.payment.tranId);
  await B.post(`/payments/${r.payment.tranId}/reconcile`);
  const mid = await B.get<any>("/admin/revenue");
  assert.equal(mid.gross - before.gross, 499);
  assert.equal(mid.net - before.net, 499);
  await B.post(`/admin/payments/${r.payment.tranId}/chargeback`, { admin: "a", note: "dispute" });
  const after = await B.get<any>("/admin/revenue");
  assert.equal(after.chargedBack - before.chargedBack, 499);
  assert.equal(after.net, before.net);
});

// -------------------------------------------------------------- refunds / disputes

async function capturedOrderPayment(amount = 1000) {
  const store = ledger.addStore(uid("st"));
  const o = newOrder(store, { totalAmount: amount, platformFee: amount * 0.05, sellerNet: amount * 0.95 });
  const p = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  gw.pay(p.tranId);
  await B.post(`/payments/${p.tranId}/reconcile`);
  return { store, order: o, tranId: p.tranId };
}

test("refund: needs a reason, asks the gateway once, reverses the ledger, and repeating it never refunds twice", async () => {
  const { tranId } = await capturedOrderPayment();
  await expectCode(B.post(`/admin/payments/${tranId}/refund`, { admin: "a", reason: " " }), "VALIDATION");
  const calls = gw.refundCalls.length;
  const r = await B.post<any>(`/admin/payments/${tranId}/refund`, { admin: "a1", reason: "Item out of stock" });
  assert.deepEqual({ ok: r.success, led: r.ledger, dup: r.duplicate }, { ok: true, led: "REVERSED", dup: false });
  assert.equal(gw.refundCalls.length, calls + 1);
  assert.equal(gw.refundCalls[calls].amount, 1000);
  assert.equal(await status(tranId), "REFUNDED");
  assert.deepEqual(ledger.reversals.filter((t) => t === tranId), [tranId]);

  const again = await B.post<any>(`/admin/payments/${tranId}/refund`, { admin: "a2", reason: "Item out of stock" });
  assert.equal(again.duplicate, true);
  assert.equal(gw.refundCalls.length, calls + 1); // the gateway was NOT asked a second time
  // concurrent refund requests on a fresh payment: one wins
  const second = await capturedOrderPayment();
  const rs = await Promise.allSettled([1, 2, 3].map((i) => B.post<any>(`/admin/payments/${second.tranId}/refund`, { admin: `a${i}`, reason: "dup" })));
  assert.equal(gw.refundCalls.filter((c) => c.bankTranId).length, calls + 2);
  assert.ok(rs.some((x) => x.status === "fulfilled"));
});

test("refund refused by the gateway: the payment goes back to CAPTURED, nothing is reversed", async () => {
  const { tranId } = await capturedOrderPayment();
  gw.refuseRefund = true;
  try { await expectCode(B.post(`/admin/payments/${tranId}/refund`, { admin: "a", reason: "r" }), "REFUND_REFUSED"); } finally { gw.refuseRefund = false; }
  assert.equal(await status(tranId), "CAPTURED");
  assert.equal(ledger.reversals.includes(tranId), false);
  assert.equal((await B.post<any>(`/admin/payments/${tranId}/refund`, { admin: "a", reason: "r" })).success, true); // can be retried
});

test("refund with the ledger down: the gateway refund stands, repeating the call retries only the ledger step", async () => {
  const { tranId } = await capturedOrderPayment();
  const calls = gw.refundCalls.length;
  ledger.down = true;
  let r: any;
  try { r = await B.post<any>(`/admin/payments/${tranId}/refund`, { admin: "a", reason: "r" }); } finally { ledger.down = false; }
  assert.equal(r.ledger, "RETRY_NEEDED");
  assert.equal(ledger.reversals.includes(tranId), false);
  const retry = await B.post<any>(`/admin/payments/${tranId}/refund`, { admin: "a", reason: "r" });
  assert.deepEqual({ dup: retry.duplicate, led: retry.ledger }, { dup: true, led: "REVERSED" });
  assert.equal(gw.refundCalls.length, calls + 1);
});

test("refund is limited to captured order payments", async () => {
  const store = ledger.addStore(uid("st"));
  const top = (await charge({ purpose: "WALLET_TOPUP", storeId: store, amount: 100 })).payment;
  gw.pay(top.tranId);
  await B.post(`/payments/${top.tranId}/reconcile`);
  await expectCode(B.post(`/admin/payments/${top.tranId}/refund`, { admin: "a", reason: "r" }), "UNSUPPORTED");
  const o = newOrder(store);
  const pending = (await charge({ purpose: "STORE_ORDER", orderNumber: o.orderNumber })).payment;
  await expectCode(B.post(`/admin/payments/${pending.tranId}/refund`, { admin: "a", reason: "r" }), "NOT_REFUNDABLE");
  await expectCode(B.post(`/admin/payments/NOPE/refund`, { admin: "a", reason: "r" }), "NOT_FOUND");
});

test("chargeback: an order payment is reversed in the ledger; it is idempotent and does not ask the gateway for anything", async () => {
  const { tranId } = await capturedOrderPayment();
  const calls = gw.refundCalls.length;
  const r = await B.post<any>(`/admin/payments/${tranId}/chargeback`, { admin: "a", note: "Bank dispute #1" });
  assert.deepEqual({ ok: r.success, led: r.ledger }, { ok: true, led: "REVERSED" });
  assert.equal(await status(tranId), "CHARGEBACK");
  assert.equal(gw.refundCalls.length, calls);
  assert.equal((await B.post<any>(`/admin/payments/${tranId}/chargeback`, { admin: "a" })).duplicate, true);
  await expectCode(B.post(`/admin/payments/${tranId}/refund`, { admin: "a", reason: "r" }), "NOT_REFUNDABLE");
});

test("chargeback on a Pro plan payment revokes the plan; on a top-up it is refused honestly", async () => {
  const user = uid("user");
  const r = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "GATEWAY", userId: user, idempotencyKey: uid("k") });
  gw.pay(r.payment.tranId);
  await B.post(`/payments/${r.payment.tranId}/reconcile`);
  assert.equal((await B.get<any>(`/subscriptions/buyer/${user}/status`)).active, true);
  await B.post(`/admin/payments/${r.payment.tranId}/chargeback`, { admin: "a" });
  assert.equal((await B.get<any>(`/subscriptions/buyer/${user}/status`)).active, false);
  assert.equal((await events("SubscriptionLapsed", (d) => d.userId === user)).length, 1);
  const rev = await events("PlatformRevenueReversed", (d) => d.reference === r.payment.tranId); // the platform's revenue posting is taken back
  assert.equal(rev.length, 1);
  assert.equal((await B.post<any>(`/admin/payments/${r.payment.tranId}/chargeback`, { admin: "a" })).duplicate, true);
  assert.equal((await events("PlatformRevenueReversed", (d) => d.reference === r.payment.tranId)).length, 1);

  const store = ledger.addStore(uid("st"));
  const top = (await charge({ purpose: "WALLET_TOPUP", storeId: store, amount: 100 })).payment;
  gw.pay(top.tranId);
  await B.post(`/payments/${top.tranId}/reconcile`);
  await expectCode(B.post(`/admin/payments/${top.tranId}/chargeback`, { admin: "a" }), "UNSUPPORTED");
});

// ------------------------------------------------------------------- housekeeping

test("sweep: an unpaid session is expired only once the gateway session is over; a payment that actually arrived is captured", async () => {
  const store = ledger.addStore(uid("st"));
  const o1 = newOrder(store), o2 = newOrder(store);
  const p1 = (await charge({ purpose: "STORE_ORDER", orderNumber: o1.orderNumber })).payment; // never paid
  const p2 = (await charge({ purpose: "STORE_ORDER", orderNumber: o2.orderNumber })).payment; // paid, buyer closed the tab
  gw.pay(p2.tranId);

  advance(20 * 60_000); // past the 15 min window, inside the 1 h session
  let out = await svc.runTick();
  assert.equal(await status(p2.tranId), "CAPTURED");
  assert.equal(await status(p1.tranId), "PENDING");
  assert.ok(out.payments!.captured >= 1);

  advance(60 * 60_000);
  out = await svc.runTick();
  assert.equal(await status(p1.tranId), "EXPIRED");
  assert.equal((await events("PaymentFailed", (d) => d.tranId === p1.tranId)).length, 0); // order-service expires its own reservation
});

// ------------------------------------------------------------------ gateway unit

test("verify_sign: matches SSLCommerz's scheme and detects any tampering", () => {
  const raw = ipnBody({ tran_id: "T1", val_id: "V1", amount: "100.00", status: "VALID" });
  const f = Object.fromEntries(new URLSearchParams(raw));
  assert.equal(verifySslcommerzSignature(f, STORE_PASSWORD), true);
  assert.equal(verifySslcommerzSignature(f, "other"), false);
  assert.equal(verifySslcommerzSignature({ ...f, amount: "1.00" }, STORE_PASSWORD), false);
  assert.equal(verifySslcommerzSignature({ ...f, verify_sign: "" }, STORE_PASSWORD), false);
  const { verify_key, ...noKey } = f;
  assert.ok(verify_key);
  assert.equal(verifySslcommerzSignature(noKey as any, STORE_PASSWORD), false);
});

test("SSLCommerzGateway: refuses live mode without credentials; maps gateway answers; never calls the network in tests", async () => {
  assert.throws(() => new SSLCommerzGateway({ live: true, storeId: "", storePassword: "" }), /LIVE/);
  const calls: string[] = [];
  const respond = (json: any) => (async (url: any, init?: any) => { calls.push(String(url) + (init?.body ? `?${init.body}` : "")); return new Response(JSON.stringify(json), { status: 200 }); }) as typeof fetch;

  let g = new SSLCommerzGateway({ live: false, fetchFn: respond({ status: "SUCCESS", GatewayPageURL: "https://sandbox.sslcommerz.com/x", sessionkey: "S" }) });
  const init = await g.init({ tranId: "T9", amount: 12.5, currency: "BDT", purpose: "WALLET_TOPUP", productName: "p", successUrl: "s", failUrl: "f", cancelUrl: "c", customer: { name: "n", email: "e@x.com", phone: "01700000000", address: "a", city: "c" } });
  assert.deepEqual({ ok: init.ok, url: init.gatewayUrl }, { ok: true, url: "https://sandbox.sslcommerz.com/x" });
  assert.match(calls[0], /total_amount=12.50/);
  assert.match(calls[0], /tran_id=T9/);

  g = new SSLCommerzGateway({ live: false, fetchFn: respond({ status: "VALID", tran_id: "T9", amount: "12.50", currency: "BDT", bank_tran_id: "B1" }) });
  const v = await g.validate("V");
  assert.deepEqual({ valid: v.valid, tranId: v.tranId, amount: v.amount, currency: v.currency }, { valid: true, tranId: "T9", amount: 12.5, currency: "BDT" });

  g = new SSLCommerzGateway({ live: false, fetchFn: respond({ element: [{ status: "FAILED" }, { status: "VALID", val_id: "VV" }] }) });
  assert.deepEqual(await g.query("T9").then((q) => ({ s: q.status, v: q.valId })), { s: "PAID", v: "VV" }); // a paid attempt wins
  g = new SSLCommerzGateway({ live: false, fetchFn: respond({ element: [{ status: "CANCELLED" }] }) });
  assert.equal((await g.query("T9")).status, "CANCELLED");
  g = new SSLCommerzGateway({ live: false, fetchFn: respond({ element: [] }) });
  assert.equal((await g.query("T9")).found, false);

  g = new SSLCommerzGateway({ live: false, fetchFn: (async () => { throw new Error("network down"); }) as any });
  assert.equal((await g.validate("V")).status, "ERROR");
  assert.equal((await g.init({ tranId: "T", amount: 1, currency: "BDT", purpose: "WALLET_TOPUP", productName: "p", successUrl: "s", failUrl: "f", cancelUrl: "c", customer: { name: "n", email: "e", phone: "p", address: "a", city: "c" } })).ok, false);
  await assert.rejects(g.query("T")); // unknown, not "failed": callers must not mark payments failed on an outage
});
