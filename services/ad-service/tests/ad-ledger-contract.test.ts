// Contract test: ad-service against the REAL ledger-service (no fakes), over HTTP.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb as createLedgerDb } from "../../ledger-service/src/db";
import { startLedgerService } from "../../ledger-service/src/app";
import { createDb as createAdDb } from "../src/db";
import { startAdService } from "../src/app";
import { addDays, dhakaToday } from "../src/dates";

const SECRET = "test-secret";
const AD_PORT = 14106;
const LEDGER_PORT = 14905;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let ledgerSvc: Awaited<ReturnType<typeof startLedgerService>>;
let adSvc: Awaited<ReturnType<typeof startAdService>>;
let L: ReturnType<typeof serviceClient>;
let A: ReturnType<typeof serviceClient>;
let n = 0;

before(async () => {
  process.env.SERVICE_URL_LEDGER = `http://127.0.0.1:${LEDGER_PORT}`;
  const ledgerUrl = await resetDatabase(ADMIN_URL, "ledger_for_ad_test", path.join(__dirname, "../../ledger-service/prisma/schema.prisma"), createLedgerDb);
  ledgerSvc = await startLedgerService({ secret: SECRET, port: LEDGER_PORT, databaseUrl: ledgerUrl, relay: false, daemon: false });
  const adUrl = await resetDatabase(ADMIN_URL, "ads_contract_test", path.join(__dirname, "../prisma/schema.prisma"), createAdDb);
  adSvc = await startAdService({ secret: SECRET, port: AD_PORT, databaseUrl: adUrl, relay: false, worker: false }); // default http ledger gateway
  L = serviceClient({ baseUrl: `http://127.0.0.1:${LEDGER_PORT}`, secret: SECRET, caller: "test" });
  A = serviceClient({ baseUrl: `http://127.0.0.1:${AD_PORT}`, secret: SECRET, caller: "test" });
  await A.post("/admin/ads/slots", { code: "CONTRACT_SLOT", name: "Contract", placement: "AGGREGATOR", capacity: 5, pricePerDay: 100 });
});
after(async () => { await adSvc.stop(); await ledgerSvc.stop(); });

async function mkStore(funds: number) {
  const storeId = `cstore${++n}`;
  await L.post("/internal/events", { eventId: `se${n}`, eventType: "StoreCreated", timestamp: new Date().toISOString(), producer: "identity", data: { storeId, ownerId: `owner${n}` } });
  if (funds) await L.post(`/wallets/${storeId}/topup`, { amount: funds, reference: `T${n}` });
  return storeId;
}
let dayCursor = 5;
const span = (days = 3) => { const s = addDays(dhakaToday(), dayCursor); dayCursor += days + 1; return { startDate: s, endDate: addDays(s, days - 1) }; };
const book = (storeId: string, extra: any = {}) =>
  A.post<any>("/ads/bookings", { slot: "CONTRACT_SLOT", storeId, ownerId: "o", headline: "Contract ad", imageUrl: "https://cdn.example.com/a.jpg", targetUrl: "/s/x", ...span(), ...extra });
const avail = async (s: string) => (await L.get<any>(`/wallets/${s}/status`)).available;

test("real ledger: approval debits the wallet once (AD_FEE) and re-approval does not double charge", async () => {
  const s = await mkStore(1000);
  const { booking } = await book(s); // 3 days x 100
  const r = await A.patch<any>(`/admin/ads/${booking.id}/review`, { decision: "APPROVE", admin: "a1" });
  assert.equal(r.charged, true);
  assert.equal(await avail(s), 700);
  await assert.rejects(A.patch(`/admin/ads/${booking.id}/review`, { decision: "APPROVE", admin: "a2" }), (e: any) => e.code === "NOT_PENDING");
  assert.equal(await avail(s), 700);
  const stmt = JSON.stringify(await L.get<any>(`/wallets/${s}/statement`));
  assert.match(stmt, new RegExp(booking.bookingNumber));
  assert.ok((await L.get<any>("/admin/reconcile")) && (await L.get<any>("/admin/trial-balance")));
});

test("real ledger: unknown store, too-poor store and spent-meanwhile store are all refused cleanly", async () => {
  await assert.rejects(book("no-such-store"), (e: any) => e.code === "STORE_NOT_FOUND");
  const poor = await mkStore(50);
  await assert.rejects(book(poor), (e: any) => e.code === "INSUFFICIENT_FUNDS" && e.status === 402);

  const s = await mkStore(400);
  const { booking } = await book(s); // 300
  await L.post(`/wallets/${s}/charge`, { amount: 250, kind: "AD_FEE", reference: "other", idempotencyKey: `other-${s}` }); // spends it elsewhere
  const r = await A.patch<any>(`/admin/ads/${booking.id}/review`, { decision: "APPROVE", admin: "a1" });
  assert.equal(r.charged, false);
  assert.equal(r.booking.status, "REJECTED", "the ledger's real 402 is mapped to a clean rejection");
  assert.equal(await avail(s), 150, "nothing extra was taken");
});

test("real ledger: a store the enforcer paused cannot book", async () => {
  const s = await mkStore(1000);
  await L.post(`/wallets/${s}/status`, { status: "SUSPENDED", admin: "admin1", reason: "policy" });
  await assert.rejects(book(s), (e: any) => e.code === "STORE_NOT_ELIGIBLE" && e.status === 403);
});

test("ledger unreachable: booking fails closed with 503", async () => {
  process.env.SERVICE_URL_LEDGER = "http://127.0.0.1:1"; // nothing listens here
  const s = `offline-store`;
  await assert.rejects(book(s), (e: any) => e.code === "BILLING_UNAVAILABLE" && e.status === 503);
  process.env.SERVICE_URL_LEDGER = `http://127.0.0.1:${LEDGER_PORT}`;
});
