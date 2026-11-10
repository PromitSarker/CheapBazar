// Contract tests: payment-billing-service against the REAL ledger-service over HTTP (no fake ledger),
// and the real entitlement clients that catalog / aggregator / order use against the real billing API.
// Only the payment gateway and order-service lookups are fakes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { HttpTransport, relayOnce, type Transport } from "../../../packages/event-bus";
import { createDb as createLedgerDb } from "../../ledger-service/src/db";
import { startLedgerService } from "../../ledger-service/src/app";
import { httpEntitlements as aggregatorEntitlements } from "../../aggregator-service/src/entitlements";
import { httpDeps as orderDeps } from "../../order-service/src/deps";
import { createDb } from "../src/db";
import { startBillingService } from "../src/app";
import { FakeGateway, FakeOrders } from "./helpers";

const SECRET = "test-secret";
const BILLING_PORT = 14304;
const LEDGER_PORT = 14906;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let ledgerSvc: Awaited<ReturnType<typeof startLedgerService>>;
let billing: Awaited<ReturnType<typeof startBillingService>>;
let L: ReturnType<typeof serviceClient>;
let B: ReturnType<typeof serviceClient>;
const gw = new FakeGateway();
const orders = new FakeOrders();

let now = new Date();
const clock = () => now;
const advance = (ms: number) => { now = new Date(now.getTime() + ms); };
const DAY = 86_400_000;

// deliver billing's events to the real ledger; every other consumer is out of scope here
const toLedger: Transport = {
  async deliver(consumer, env) {
    if (consumer !== "ledger") return;
    await new HttpTransport(SECRET, "payment", () => `http://127.0.0.1:${LEDGER_PORT}`).deliver(consumer, env);
  },
};
const pump = async () => { for (let i = 0; i < 3; i++) await relayOnce(billing.db as any, toLedger, 200); };

before(async () => {
  process.env.SERVICE_URL_LEDGER = `http://127.0.0.1:${LEDGER_PORT}`;
  process.env.SERVICE_URL_PAYMENT = `http://127.0.0.1:${BILLING_PORT}`;
  const ledgerUrl = await resetDatabase(ADMIN_URL, "ledger_for_billing_test", path.join(__dirname, "../../ledger-service/prisma/schema.prisma"), createLedgerDb);
  ledgerSvc = await startLedgerService({ secret: SECRET, port: LEDGER_PORT, databaseUrl: ledgerUrl, relay: false, daemon: false });
  const billUrl = await resetDatabase(ADMIN_URL, "billing_contract_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  // default HTTP ledger gateway: the real thing
  billing = await startBillingService({ secret: SECRET, port: BILLING_PORT, databaseUrl: billUrl, relay: false, worker: false, gateway: gw, orders, clock, config: { onlinePaymentsEnabled: true } });
  L = serviceClient({ baseUrl: `http://127.0.0.1:${LEDGER_PORT}`, secret: SECRET, caller: "test" });
  B = serviceClient({ baseUrl: `http://127.0.0.1:${BILLING_PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await billing.stop(); await ledgerSvc.stop(); });

let n = 0;
async function mkStore(funds = 0) {
  const storeId = `bstore${++n}_${Math.random().toString(36).slice(2, 6)}`;
  await L.post("/internal/events", { eventId: `se-${storeId}`, eventType: "StoreCreated", timestamp: new Date().toISOString(), producer: "identity", data: { storeId, ownerId: `owner-${storeId}` } });
  if (funds) await L.post(`/wallets/${storeId}/topup`, { amount: funds, reference: `seed-${storeId}` });
  return storeId;
}
const avail = async (s: string) => (await L.get<any>(`/wallets/${s}/status`)).available;
const expectNotFound = (p: Promise<any>) => assert.rejects(p, (e: any) => e.code === "NOT_FOUND");
const key = () => `k${++n}_${Math.random().toString(36).slice(2, 7)}`;

test("online order payment: captured payment settles in the real ledger (net to seller, fee to platform); replays change nothing", async () => {
  const store = await mkStore();
  const o = orders.add({ orderNumber: `ORD-C${++n}`, storeId: store, totalAmount: 2000, platformFee: 100, sellerNet: 1900 });
  const p = (await B.post<any>("/payments/charge", { purpose: "STORE_ORDER", orderNumber: o.orderNumber, idempotencyKey: key() })).payment;
  gw.pay(p.tranId);
  assert.equal((await B.post<any>(`/payments/${p.tranId}/reconcile`)).status, "CAPTURED");
  await pump();
  assert.equal(await avail(store), 1900);
  await pump(); // nothing left to deliver
  const ob = billing.db as any;
  await ob.$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0 WHERE "consumer" = 'ledger'`); // force a full replay
  await pump();
  assert.equal(await avail(store), 1900);
});

test("refund and chargeback reverse the real ledger settlement (idempotent, no double reversal)", async () => {
  const mk = async () => {
    const store = await mkStore();
    const o = orders.add({ orderNumber: `ORD-C${++n}`, storeId: store, totalAmount: 1000, platformFee: 50, sellerNet: 950 });
    const p = (await B.post<any>("/payments/charge", { purpose: "STORE_ORDER", orderNumber: o.orderNumber, idempotencyKey: key() })).payment;
    gw.pay(p.tranId);
    await B.post(`/payments/${p.tranId}/reconcile`);
    await pump();
    assert.equal(await avail(store), 950);
    return { store, tranId: p.tranId };
  };
  const a = await mk();
  const r = await B.post<any>(`/admin/payments/${a.tranId}/refund`, { admin: "a", reason: "Out of stock" });
  assert.equal(r.ledger, "REVERSED");
  assert.equal(await avail(a.store), 0);
  assert.equal((await B.post<any>(`/admin/payments/${a.tranId}/refund`, { admin: "a", reason: "Out of stock" })).duplicate, true);
  assert.equal(await avail(a.store), 0); // not reversed twice

  const b = await mk();
  assert.equal((await B.post<any>(`/admin/payments/${b.tranId}/chargeback`, { admin: "a", note: "dispute" })).ledger, "REVERSED");
  assert.equal(await avail(b.store), 0);
});

test("manual top-up approval reaches the real wallet exactly once, even if the event is replayed", async () => {
  const store = await mkStore();
  const { payment } = await B.post<any>("/topups/manual", { storeId: store, amount: 2500, method: "BKASH", trxId: `TRX${Date.now()}${++n}`, idempotencyKey: key() });
  await pump();
  assert.equal(await avail(store), 0); // pending: no money yet
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a1" });
  await pump();
  assert.equal(await avail(store), 2500);
  await (billing.db as any).$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0 WHERE "consumer" = 'ledger'`);
  await pump();
  assert.equal(await avail(store), 2500);
});

test("gateway top-up credits the real wallet", async () => {
  const store = await mkStore();
  const p = (await B.post<any>("/payments/charge", { purpose: "WALLET_TOPUP", storeId: store, amount: 800, idempotencyKey: key() })).payment;
  gw.pay(p.tranId);
  await B.post(`/payments/${p.tranId}/reconcile`);
  await pump();
  assert.equal(await avail(store), 800);
});

const platform = async (code: string) => {
  const { accounts } = await L.get<any>("/admin/platform-accounts");
  const a = accounts.find((x: any) => x.code === code);
  return { debit: a?.debit ?? 0, credit: a?.credit ?? 0, net: (a?.credit ?? 0) - (a?.debit ?? 0) };
};
const trx = () => `TRX${Date.now()}${++n}`;

test("Buyer Pro fee lands in the PLATFORM (admin) account of the real ledger: manual -> cash, gateway -> clearing; replays book nothing twice", async () => {
  const rev0 = await platform("PLATFORM_SUBSCRIPTION_REVENUE");
  const cash0 = await platform("PLATFORM_CASH");
  const clr0 = await platform("GATEWAY_CLEARING");

  const user = `buyer${++n}`;
  const { payment } = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", userId: user, trxId: trx(), idempotencyKey: key() });
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net, rev0.net); // pending: the platform has earned nothing yet
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a1" });
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - rev0.net, 499);
  assert.equal((await platform("PLATFORM_CASH")).debit - cash0.debit, 499); // the money sits in the platform's bank/MFS account

  const g = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "GATEWAY", userId: `buyer${++n}`, idempotencyKey: key() });
  gw.pay(g.payment.tranId);
  await B.post(`/payments/${g.payment.tranId}/reconcile`);
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - rev0.net, 998);
  assert.equal((await platform("GATEWAY_CLEARING")).debit - clr0.debit, 499);

  await (billing.db as any).$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0 WHERE "consumer" = 'ledger'`); // replay everything
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - rev0.net, 998);
  assert.equal((await B.get<any>("/admin/revenue")).net >= 998, true);
});

test("a chargeback takes the platform's revenue back out of the real ledger (once)", async () => {
  const before = await platform("PLATFORM_SUBSCRIPTION_REVENUE");
  const g = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "GATEWAY", userId: `buyer${++n}`, idempotencyKey: key() });
  gw.pay(g.payment.tranId);
  await B.post(`/payments/${g.payment.tranId}/reconcile`);
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 499);
  await B.post(`/admin/payments/${g.payment.tranId}/chargeback`, { admin: "a", note: "dispute" });
  await B.post(`/admin/payments/${g.payment.tranId}/chargeback`, { admin: "a", note: "dispute" });
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 0);
  await (billing.db as any).$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0 WHERE "consumer" = 'ledger'`);
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 0); // replay does not reverse twice
});

test("sellers are never charged: a store with a wallet and Pro-less listings has nothing taken for wholesale", async () => {
  const store = await mkStore(1000);
  await pump();
  assert.equal(await avail(store), 1000);
  await expectNotFound(B.get(`/subscriptions/seller/${store}/status`));
  assert.equal(await avail(store), 1000);
});

test("the entitlement clients of aggregator and order read billing's real Buyer Pro answers (and fail closed when it is down)", async () => {
  const user = `buyer${++n}`;
  const agg = aggregatorEntitlements(SECRET);
  const ord = orderDeps(SECRET).billing;
  assert.deepEqual([await agg.buyerProActive(user), await ord.buyerProActive(user)], [false, false]);
  assert.equal("sellerPlanActive" in ord, false); // order-service no longer asks about sellers

  const { payment } = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", userId: user, trxId: trx(), idempotencyKey: key() });
  assert.equal(await agg.buyerProActive(user), false); // a pending manual payment grants nothing
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a1" });
  assert.deepEqual([await agg.buyerProActive(user), await ord.buyerProActive(user)], [true, true]);

  // billing unreachable: the aggregator fails closed (locked preview), order-service surfaces the error (503 to the buyer)
  process.env.SERVICE_URL_PAYMENT = "http://127.0.0.1:1";
  try {
    assert.equal(await agg.buyerProActive(user), false);
    await assert.rejects(ord.buyerProActive(user));
  } finally {
    process.env.SERVICE_URL_PAYMENT = `http://127.0.0.1:${BILLING_PORT}`;
  }
});

test("after all of that the real ledger still balances, wallets reconcile, and the platform earned the fee and the Buyer Pro revenue", async () => {
  const tb = await L.get<any>("/admin/trial-balance");
  assert.equal(tb.balanced, true);
  assert.ok(tb.debit > 0);
  const rec = await L.get<any>("/admin/reconcile");
  assert.deepEqual(rec.mismatches, []);
  assert.ok(rec.checked >= 5);
  const { accounts } = await L.get<any>("/admin/platform-accounts");
  const credit = (code: string) => accounts.find((a: any) => a.code === code)?.credit ?? 0;
  assert.ok(credit("PLATFORM_FEE_REVENUE") >= 150);                  // 100 + 50 + 50 from the settled orders
  assert.ok(credit("PLATFORM_SUBSCRIPTION_REVENUE") >= 3 * 499);     // two manual/gateway fees + the charged-back one
});

test("revoking an approved Buyer Pro payment ends access, voids the invoice and takes the revenue back out of the real ledger (once)", async () => {
  await pump();
  const before = await platform("PLATFORM_SUBSCRIPTION_REVENUE");
  const user = `buyer${++n}`;
  const { payment } = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", userId: user, trxId: trx(), idempotencyKey: key() });
  await assert.rejects(B.post(`/admin/manual-payments/${payment.id}/revoke`, { admin: "a", reason: "x" }), /approved/i); // pending cannot be revoked
  await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a1" });
  await pump();
  assert.equal((await B.get<any>(`/subscriptions/buyer/${user}/status`)).active, true);
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 499);

  await assert.rejects(B.post(`/admin/manual-payments/${payment.id}/revoke`, { admin: "a", reason: " " }), /reason/i);
  const r1 = await B.post<any>(`/admin/manual-payments/${payment.id}/revoke`, { admin: "a", reason: "trx id not in the bKash statement" });
  assert.equal(r1.payment.status, "REVOKED");
  assert.equal(r1.access, "ended");
  const r2 = await B.post<any>(`/admin/manual-payments/${payment.id}/revoke`, { admin: "a", reason: "again" });
  assert.equal(r2.duplicate, true);
  await pump();
  assert.equal((await B.get<any>(`/subscriptions/buyer/${user}/status`)).active, false);
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 0);
  const inv = (await B.get<any>(`/subscriptions/invoices?userId=${user}`)).invoices;
  assert.equal(inv[0].status, "VOID");
  // the same transaction id can never be claimed again
  await assert.rejects(B.post("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", userId: `buyer${++n}`, trxId: payment.trxId, idempotencyKey: key() }));
  await (billing.db as any).$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = NULL, "attempts" = 0 WHERE "consumer" = 'ledger'`);
  await pump();
  assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")).net - before.net, 0); // replay does not reverse twice
});

test("revoking one of two stacked Buyer Pro payments only shortens access; a wallet top-up cannot be revoked", async () => {
  const user = `buyer${++n}`;
  const pay = async () => {
    const { payment } = await B.post<any>("/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "NAGAD", userId: user, trxId: trx(), idempotencyKey: key() });
    await B.patch(`/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "a1" });
    return payment;
  };
  const p1 = await pay(), p2 = await pay();
  const end2 = (await B.get<any>("/admin/subscriptions")).subscriptions.find((s: any) => s.userId === user).currentPeriodEnd;
  const r = await B.post<any>(`/admin/manual-payments/${p2.id}/revoke`, { admin: "a", reason: "bad" });
  assert.equal(r.access, "shortened");
  const sub = (await B.get<any>("/admin/subscriptions")).subscriptions.find((s: any) => s.userId === user);
  assert.equal(sub.status, "ACTIVE");
  assert.ok(new Date(sub.currentPeriodEnd).getTime() < new Date(end2).getTime());
  assert.equal((await B.get<any>(`/subscriptions/buyer/${user}/status`)).active, true);
  void p1;

  const store = await mkStore();
  const { payment: tp } = await B.post<any>("/topups/manual", { storeId: store, amount: 700, method: "BKASH", trxId: trx(), idempotencyKey: key() });
  await B.patch(`/admin/manual-payments/${tp.id}/review`, { decision: "APPROVE", admin: "a1" });
  await assert.rejects(B.post(`/admin/manual-payments/${tp.id}/revoke`, { admin: "a", reason: "bad" }), /clawback|revoked/i);
});
