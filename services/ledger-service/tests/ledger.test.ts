import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { relayOnce, type EventEnvelope, type Transport } from "../../../packages/event-bus";
import { createDb } from "../src/db";
import { startLedgerService } from "../src/app";

const SECRET = "test-secret";
const PORT = 14005;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let svc: Awaited<ReturnType<typeof startLedgerService>>;
let api: ReturnType<typeof serviceClient>;
let n = 0;
const newStore = () => `store_${++n}_${Math.random().toString(36).slice(2, 6)}`;
const iso = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const status = (s: string) => api.get(`/wallets/${s}/status`);
const fund = (s: string, amount: number) => api.post(`/wallets/${s}/topup`, { amount, reference: `T-${s}-${Math.random()}` });
async function expectErr(p: Promise<any>, code: string, httpStatus?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (httpStatus) assert.equal(e.status, httpStatus);
    return true;
  });
}

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "ledger_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startLedgerService({ secret: SECRET, port: PORT, databaseUrl: url, relay: false });
  api = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

test("rejects calls without the internal token", async () => {
  const bad = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: "wrong", caller: "x" });
  await expectErr(bad.get("/wallets/s/status"), "UNAUTHORIZED", 401);
});

test("top-up credits the wallet once (idempotent) and the ledger balances", async () => {
  const s = newStore();
  await api.post(`/wallets/${s}/topup`, { amount: 5000, reference: "MP-1", idempotencyKey: "k1" });
  await api.post(`/wallets/${s}/topup`, { amount: 5000, reference: "MP-1", idempotencyKey: "k1" });
  const st = await status(s);
  assert.equal(st.balance, 5000);
  assert.equal(st.available, 5000);
  assert.equal(st.status, "ACTIVE");
  assert.equal((await api.get("/admin/trial-balance")).balanced, true);
  assert.deepEqual((await api.get("/admin/reconcile")).mismatches, []);
});

test("ledger rows are immutable and unbalanced transactions cannot commit", async () => {
  const s = newStore();
  await fund(s, 1000);
  await assert.rejects(svc.db.$executeRawUnsafe(`UPDATE "LedgerPosting" SET "debit" = 1 WHERE "debit" = 0`), /immutable/);
  await assert.rejects(svc.db.$executeRawUnsafe(`DELETE FROM "LedgerPosting"`), /immutable/);
  await assert.rejects(svc.db.$executeRawUnsafe(`DELETE FROM "StatementEntry"`), /immutable/);
  const acct = await svc.db.ledgerAccount.findFirstOrThrow();
  await assert.rejects(
    svc.db.$transaction(async (tx) => {
      const t = await tx.ledgerTransaction.create({ data: { kind: "X", description: "unbalanced", idempotencyKey: `u-${Math.random()}` } });
      await tx.ledgerPosting.create({ data: { transactionId: t.id, accountId: acct.id, debit: 10 } });
      await tx.$executeRaw`SET CONSTRAINTS ledger_posting_balanced IMMEDIATE`; // the DB itself rejects it
    }),
    /unbalanced/
  );
  // ...and the service-level engine refuses before it ever reaches the DB
  const { postTransaction } = await import("../src/ledger");
  await assert.rejects(
    svc.db.$transaction((tx) =>
      postTransaction(tx, {
        kind: "X", description: "bad", idempotencyKey: `bad-${Math.random()}`,
        postings: [{ account: { type: "PLATFORM_CASH" }, debit: 10 }, { account: { type: "PLATFORM_EQUITY" }, credit: 9 }],
      })
    ),
    /Unbalanced/
  );
  await assert.rejects(
    svc.db.ledgerPosting.create({ data: { transactionId: "x", accountId: acct.id, debit: 5, credit: 5 } })
  );
});

test("withdrawals: no reserve bond, single active request, concurrency, approve and reject", async () => {
  const s = newStore();
  await fund(s, 5000);
  const m = await api.post(`/wallets/${s}/payout-methods`, { type: "BKASH", phoneNumber: "01712345678" });
  await expectErr(api.post(`/wallets/${s}/payout-methods`, { type: "BKASH", phoneNumber: "123" }), "VALIDATION", 400);
  // new destinations are locked for 24h
  await expectErr(api.post(`/wallets/${s}/withdrawals`, { payoutMethodId: m.method.id, amount: 1000 }), "COOLING", 403);
  await svc.db.payoutMethod.update({ where: { id: m.method.id }, data: { coolingUntil: new Date(Date.now() - 1000) } });

  await expectErr(api.post(`/wallets/${s}/withdrawals`, { payoutMethodId: m.method.id, amount: 100 }), "VALIDATION", 400);
  await expectErr(api.post(`/wallets/${s}/withdrawals`, { payoutMethodId: m.method.id, amount: 5100 }), "INSUFFICIENT_FUNDS", 409); // only 5000 in the wallet

  const race = await Promise.allSettled([1, 2, 3].map(() => api.post(`/wallets/${s}/withdrawals`, { payoutMethodId: m.method.id, amount: 1000 })));
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1, "only one active withdrawal may exist");
  assert.equal((await status(s)).balance, 4000);

  const w = (await api.get(`/wallets/${s}/withdrawals`)).withdrawals[0];
  await expectErr(api.post(`/admin/withdrawals/${w.id}/review`, { action: "APPROVE", admin: "a@x" }), "VALIDATION", 400);
  await api.post(`/admin/withdrawals/${w.id}/review`, { action: "APPROVE", admin: "a@x", disbursementTxId: "BK123" });
  await expectErr(api.post(`/admin/withdrawals/${w.id}/review`, { action: "REJECT", admin: "b@x" }), "ALREADY_PROCESSED", 409);
  const clearing = (await api.get("/admin/platform-accounts")).accounts.find((a: any) => a.code === "PAYOUT_CLEARING");
  assert.ok(clearing); // paid-out requests net to zero in clearing across the whole test db

  const w2 = await api.post(`/wallets/${s}/withdrawals`, { payoutMethodId: m.method.id, amount: 1500 });
  assert.equal((await status(s)).balance, 2500);
  await api.post(`/admin/withdrawals/${w2.withdrawal.id}/review`, { action: "REJECT", admin: "a@x", rejectionReason: "bad account" });
  assert.equal((await status(s)).balance, 4000, "rejected withdrawal is refunded in full");
  assert.deepEqual((await api.get("/admin/reconcile")).mismatches, []);
  assert.equal((await api.get("/admin/trial-balance")).balanced, true);
});

test("charging for ads/subscriptions needs available funds and is idempotent", async () => {
  const s = newStore();
  await fund(s, 1000);
  await api.post(`/wallets/${s}/charge`, { amount: 400, kind: "AD_FEE", reference: "AD-1", idempotencyKey: "ad-1" });
  await api.post(`/wallets/${s}/charge`, { amount: 400, kind: "AD_FEE", reference: "AD-1", idempotencyKey: "ad-1" });
  assert.equal((await status(s)).balance, 600);
  await expectErr(api.post(`/wallets/${s}/charge`, { amount: 900, kind: "SUBSCRIPTION", reference: "S-1", idempotencyKey: "s-1" }), "INSUFFICIENT_FUNDS", 402);
  assert.equal((await status(s)).balance, 600);
});

test("store status is admin-only: a low or empty balance never changes it, and there are no COD holds or thresholds", async () => {
  const s = newStore();
  await fund(s, 1000);
  await api.post(`/wallets/${s}/charge`, { amount: 990, kind: "AD_FEE", reference: "x1", idempotencyKey: `x1-${s}` });
  let st = await status(s);
  assert.equal(st.balance, 10);
  assert.equal(st.status, "ACTIVE", "a nearly empty wallet does not warn, block, pause or delist the store");
  assert.equal(st.acceptsOrders, true);
  assert.equal(st.withdrawable, 10, "no reserve bond: the whole balance is spendable");
  assert.equal("holds" in st, false);
  assert.equal("thresholds" in st, false);
  assert.equal("codAllowed" in st, false);

  // the old COD-fee and enforcer endpoints are gone
  await expectErr(api.post(`/wallets/${s}/holds`, { reference: `H-${s}`, amount: 10 }), "NOT_FOUND", 404);
  await expectErr(api.post("/admin/enforcer/run", {}), "NOT_FOUND", 404);

  // an empty wallet still cannot be overdrawn
  await expectErr(api.post(`/wallets/${s}/charge`, { amount: 50, kind: "AD_FEE", reference: "x2", idempotencyKey: `x2-${s}` }), "INSUFFICIENT_FUNDS", 402);

  // suspend / ban / reinstate are the only ways a status changes
  await expectErr(api.post(`/wallets/${s}/status`, { status: "PAUSED", admin: "root@x" }), "VALIDATION", 400);
  await api.post(`/wallets/${s}/status`, { status: "SUSPENDED", admin: "root@x", reason: "KYC" });
  st = await status(s);
  assert.equal(st.status, "SUSPENDED");
  assert.equal(st.acceptsOrders, false);
  await api.post(`/wallets/${s}/status`, { status: "ACTIVE", admin: "root@x", reason: "KYC passed" });
  assert.equal((await status(s)).status, "ACTIVE", "reinstating needs no minimum balance");
  await api.post(`/wallets/${s}/status`, { status: "BANNED", admin: "root@x", reason: "fraud" });
  await expectErr(api.post(`/wallets/${s}/status`, { status: "ACTIVE", admin: "root@x" }), "BANNED", 409);
});

test("event consumers: dedupe, COD moves no money, online split settlement and refund", async () => {
  const s = newStore();
  const ev = (eventType: string, data: any, eventId = `e-${Math.random()}`) => ({ eventId, eventType, timestamp: new Date().toISOString(), producer: "t", data });

  await api.post("/internal/events", ev("StoreCreated", { storeId: s, ownerId: "user_1" }));
  assert.equal((await db().wallet.findUnique({ where: { storeId: s } }))?.ownerId, "user_1");

  const topped = ev("TopUpApproved", { storeId: s, amount: 3000, paymentRef: `MP-${s}`, method: "BKASH" }, `topup-${s}`);
  await api.post("/internal/events", topped);
  assert.equal((await api.post("/internal/events", topped)).duplicate, true);
  // a cancelled / refused COD order moves no money (and there is no fee to release)
  await api.post("/internal/events", ev("OrderCancelled", { orderNumber: `ORD-${s}`, storeId: s, paymentMethod: "COD" }));
  await api.post("/internal/events", ev("OrderRefused", { orderNumber: `ORD-${s}`, storeId: s, paymentMethod: "COD" }));
  assert.equal((await status(s)).balance, 3000);

  await api.post("/internal/events", ev("PaymentCaptured", { purpose: "STORE_ORDER", storeId: s, orderNumber: "ORD-ON", tranId: `TR-${s}`, total: 1000, fee: 50, net: 950, method: "bKash" }));
  assert.equal((await status(s)).balance, 3950);
  await api.post("/internal/events", ev("OrderRefused", { orderNumber: "ORD-ON", storeId: s, paymentMethod: "SSLCOMMERZ", paymentRef: `TR-${s}` }));
  assert.equal((await status(s)).balance, 3000, "refund reverses the settlement");
  assert.deepEqual((await api.get("/admin/reconcile")).mismatches, []);
  assert.equal((await api.get("/admin/trial-balance")).balanced, true);
});

test("outbox: events are fanned out per consumer, delivered, and retried on failure", async () => {
  const s = newStore();
  await fund(s, 50); // creates a WalletToppedUp row
  await api.post(`/wallets/${s}/status`, { status: "SUSPENDED", admin: "root@x", reason: "outbox test" }); // and a StoreStatusChanged row
  const delivered: Array<{ consumer: string; env: EventEnvelope }> = [];
  let failNext = true;
  const transport: Transport = {
    async deliver(consumer, env) {
      if (failNext && env.eventType === "StoreStatusChanged" && consumer === "notification") { failNext = false; throw new Error("consumer down"); }
      delivered.push({ consumer, env });
    },
  };
  await svc.db.$executeRawUnsafe(`UPDATE "OutboxMessage" SET "availableAt" = now() - interval '1 second' WHERE "deliveredAt" IS NULL`);
  const r1 = await relayOnce(svc.db as any, transport, 500);
  assert.ok(r1.failed >= 1, "one delivery failed");
  assert.ok(delivered.some((d) => d.env.eventType === "StoreStatusChanged" && d.consumer === "aggregator"));
  assert.ok(delivered.some((d) => d.env.eventType === "StoreStatusChanged" && d.consumer === "ad"));
  assert.ok(delivered.some((d) => d.env.eventType === "WalletToppedUp" && d.consumer === "notification"));

  await svc.db.$executeRawUnsafe(`UPDATE "OutboxMessage" SET "availableAt" = now() - interval '1 second' WHERE "deliveredAt" IS NULL`);
  const r2 = await relayOnce(svc.db as any, transport, 500);
  assert.equal(r2.failed, 0);
  assert.ok(delivered.some((d) => d.env.eventType === "StoreStatusChanged" && d.consumer === "notification"), "failed delivery is retried");
});

function db() { return svc.db; }
