import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startAdService } from "../src/app";
import { seedDefaultSlots, occupancy } from "../src/slots";
import { reviewBooking } from "../src/bookings";
import { addDays, dhakaToday, toDate, parseDay } from "../src/dates";
import type { LedgerGateway } from "../src/ledger";

const SECRET = "test-secret";
const PORT = 14006;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let svc: Awaited<ReturnType<typeof startAdService>>;
let A: ReturnType<typeof serviceClient>;
let seq = 0;

// ---- fake ledger-service
const wallets = new Map<string, { status: string; available: number }>();
const charges = new Map<string, { storeId: string; amount: number; id: string }>();
let chargeCalls = 0;
let ledgerDown = false;
const ledger: LedgerGateway = {
  async walletStatus(storeId) {
    if (ledgerDown) throw new ServiceError(503, "ledger down", "UNREACHABLE");
    const w = wallets.get(storeId);
    return w ? { exists: true, ...w } : { exists: false, status: "ACTIVE", available: 0 };
  },
  async charge(p) {
    chargeCalls++;
    if (ledgerDown) throw new ServiceError(503, "ledger down", "UNREACHABLE");
    const prior = charges.get(p.idempotencyKey);
    if (prior) return { ledgerTxId: prior.id, duplicate: true };
    const w = wallets.get(p.storeId)!;
    if (w.available < p.amount) throw new ServiceError(402, "Insufficient", "INSUFFICIENT_FUNDS");
    w.available -= p.amount;
    const id = `tx${++seq}`;
    charges.set(p.idempotencyKey, { storeId: p.storeId, amount: p.amount, id });
    return { ledgerTxId: id, duplicate: false };
  },
};

const today = dhakaToday();
const at = (day: string) => `${day}T06:00:00.000Z`; // midday in Dhaka on that day
let dayCursor = 5; // every test takes fresh dates so tests never collide
const span = (n = 3) => {
  const start = addDays(today, dayCursor);
  dayCursor += n + 2;
  return { startDate: start, endDate: addDays(start, n - 1) };
};
const mkStore = (status = "ACTIVE", available = 100_000) => {
  const id = `store${++seq}`;
  wallets.set(id, { status, available });
  return id;
};
async function mkSlot(capacity = 1, pricePerDay = 100, placement = "AGGREGATOR") {
  const code = `SLOT_${++seq}`;
  await A.post("/admin/ads/slots", { code, name: `Slot ${code}`, placement, capacity, pricePerDay });
  return code;
}
const book = (slot: string, storeId: string, extra: any = {}) =>
  A.post<any>("/ads/bookings", {
    slot, storeId, ownerId: `owner_${storeId}`, headline: "Big Eid Sale", imageUrl: "https://cdn.example.com/a.jpg",
    targetUrl: "https://shop.example.com/", ...span(), ...extra,
  });
const review = (id: string, decision: string, note?: string) => A.patch<any>(`/admin/ads/${id}/review`, { decision, admin: "admin1", note });
// Simulated time: `tick(day)` moves the service clock to midday (Dhaka) of that day, for the rest of the test.
let simNow: Date | null = null;
beforeEach(() => { simNow = null; });
const tick = (day: string) => { simNow = new Date(at(day)); return A.post<any>("/admin/ads/tick", {}); };
const active = (q = "") => A.get<any>(`/ads/active${q}`);
const events = async (eventType: string) => (await svc.db.outboxMessage.findMany({ where: { eventType } })).map((m) => (m.envelope as any).data);
const send = (eventType: string, data: any, timestamp = new Date().toISOString(), eventId = `ev${++seq}`) =>
  A.post("/internal/events", { eventId, eventType, timestamp, producer: "ledger", data });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function expectErr(p: Promise<any>, code: string, status?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}
/** book + approve through to an ACTIVE-ready (charged) booking */
async function approved(slot: string, storeId: string, extra: any = {}) {
  const { booking } = await book(slot, storeId, extra);
  const r = await review(booking.id, "APPROVE");
  assert.equal(r.charged, true);
  return r.booking;
}

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "ads_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startAdService({ secret: SECRET, port: PORT, databaseUrl: url, relay: false, worker: false, seedSlots: false, ledger, cacheTtlMs: 50, clock: () => simNow ?? new Date() });
  A = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

test("dates (pure): Dhaka day, strict parsing, per-day occupancy", () => {
  assert.equal(dhakaToday(new Date("2026-11-02T20:30:00Z")), "2026-11-03", "20:30 UTC is already the next day in Dhaka");
  assert.equal(dhakaToday(new Date("2026-11-02T17:59:00Z")), "2026-11-02");
  assert.throws(() => parseDay("2026-02-30", "d"));
  assert.throws(() => parseDay("2026-2-3", "d"));
  const occ = occupancy(
    [{ startDate: toDate("2026-12-01"), endDate: toDate("2026-12-05") }, { startDate: toDate("2026-12-04"), endDate: toDate("2026-12-08") }],
    "2026-12-03", "2026-12-06"
  );
  assert.deepEqual([...occ], [["2026-12-03", 1], ["2026-12-04", 2], ["2026-12-05", 2], ["2026-12-06", 1]]);
});

test("slots: admin upsert validates, merchants only see active slots, defaults seed once", async () => {
  await expectErr(A.post("/admin/ads/slots", { code: "bad code", name: "x", placement: "AGGREGATOR", capacity: 1, pricePerDay: 10 }), "VALIDATION");
  await expectErr(A.post("/admin/ads/slots", { code: "OK_CODE", name: "x", placement: "MOON", capacity: 1, pricePerDay: 10 }), "VALIDATION");
  await expectErr(A.post("/admin/ads/slots", { code: "OK_CODE", name: "x", placement: "AGGREGATOR", capacity: 0, pricePerDay: 10 }), "VALIDATION");
  await expectErr(A.post("/admin/ads/slots", { code: "OK_CODE", name: "x", placement: "AGGREGATOR", capacity: 1, pricePerDay: -5 }), "VALIDATION");
  const code = await mkSlot(2, 250);
  await A.post("/admin/ads/slots", { code, name: "Hidden now", placement: "AGGREGATOR", capacity: 2, pricePerDay: 250, active: false });
  const list = await A.get<any>("/ads/slots");
  assert.ok(!list.slots.some((s: any) => s.code === code), "inactive slot is hidden from merchants");
  await expectErr(book(code, mkStore()), "SLOT_NOT_FOUND", 404);

  assert.equal(await seedDefaultSlots(svc.db), false, "table already has slots -> never overwrites admin edits");
});

test("create: locks price, validates input, publishes AdBookingRequested", async () => {
  const slot = await mkSlot(1, 120);
  const store = mkStore();
  const { booking, duplicate } = await book(slot, store, { ...span(4) });
  assert.equal(duplicate, false);
  assert.equal(booking.status, "PENDING_REVIEW");
  assert.equal(booking.days, 4);
  assert.equal(booking.pricePerDay, 120);
  assert.equal(booking.totalPrice, 480);
  assert.match(booking.bookingNumber, /^AD-[0-9A-F]{8}$/);

  // changing the slot price later does not touch an existing booking
  await A.post("/admin/ads/slots", { code: slot, name: "S", placement: "AGGREGATOR", capacity: 1, pricePerDay: 999 });
  assert.equal((await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`)).totalPrice, 480);

  const ev = (await events("AdBookingRequested")).find((e) => e.bookingNumber === booking.bookingNumber);
  assert.ok(ev, "event published in the same transaction");
  assert.equal(ev.headline, "Big Eid Sale");
  assert.equal(ev.total, 480);

  const s2 = mkStore();
  await expectErr(book(slot, s2, { startDate: today, endDate: addDays(today, 2) }), "VALIDATION"); // no lead time
  await expectErr(book(slot, s2, { startDate: addDays(today, -3), endDate: addDays(today, 2) }), "VALIDATION");
  await expectErr(book(slot, s2, { startDate: addDays(today, 40), endDate: addDays(today, 39) }), "VALIDATION");
  await expectErr(book(slot, s2, { startDate: addDays(today, 40), endDate: addDays(today, 140) }), "VALIDATION"); // > 60 days
  await expectErr(book(slot, s2, { startDate: "2026-02-30" }), "VALIDATION");
  await expectErr(book(slot, s2, { imageUrl: "http://insecure.example.com/a.jpg" }), "VALIDATION");
  await expectErr(book(slot, s2, { imageUrl: "javascript:alert(1)" }), "VALIDATION");
  // a file the platform stored itself is fine; any other path or host is not
  await expectErr(book(slot, s2, { imageUrl: "/etc/passwd" }), "VALIDATION");
  await expectErr(book(slot, s2, { imageUrl: "//evil.example.com/a.png" }), "VALIDATION");
  await expectErr(book(slot, s2, { imageUrl: "/uploads/../secret.png" }), "VALIDATION");
  await expectErr(book(slot, s2, { imageUrl: "/uploads/abcdefgh12.svg" }), "VALIDATION");
  await expectErr(book(slot, s2, { targetUrl: "//evil.example.com" }), "VALIDATION");
  await expectErr(book(slot, s2, { headline: "ab" }), "VALIDATION");
  await expectErr(book(slot, s2, { ownerId: "" }), "VALIDATION");
  assert.equal((await book(slot, s2, { ...span(), targetUrl: "/s/my-store" })).booking.targetUrl, "/s/my-store", "internal path allowed");
});

test("create is idempotent by key (even under concurrent retries)", async () => {
  const slot = await mkSlot(5);
  const store = mkStore();
  const sp = span();
  const rs = await Promise.all([1, 2, 3].map(() => book(slot, store, { ...sp, idempotencyKey: "k1" })));
  assert.equal(new Set(rs.map((r) => r.booking.id)).size, 1);
  assert.equal((await A.get<any>(`/ads/bookings?storeId=${store}`)).bookings.length, 1);
});

test("no-overlap: exclusive slot, adjacent days ok, capacity is enforced PER DAY", async () => {
  const one = await mkSlot(1);
  const s1 = mkStore(), s2 = mkStore(), s3 = mkStore();
  const d0 = addDays(today, 100);
  await book(one, s1, { startDate: d0, endDate: addDays(d0, 4) });
  await expectErr(book(one, s2, { startDate: addDays(d0, 4), endDate: addDays(d0, 6) }), "SLOT_UNAVAILABLE", 409); // shares the last day
  await expectErr(book(one, s2, { startDate: addDays(d0, -2), endDate: d0 }), "SLOT_UNAVAILABLE", 409);          // shares the first day
  await expectErr(book(one, s2, { startDate: addDays(d0, 1), endDate: addDays(d0, 2) }), "SLOT_UNAVAILABLE", 409); // nested inside
  await book(one, s2, { startDate: addDays(d0, 5), endDate: addDays(d0, 7) });                                      // starts the next day: fine
  await book(one, s3, { startDate: addDays(d0, -3), endDate: addDays(d0, -1) });                                   // ends the day before: fine
  const err = await book(one, mkStore(), { startDate: addDays(d0, 2), endDate: addDays(d0, 3) }).catch((e) => e);
  assert.equal(err.body.details.date, addDays(d0, 2), "tells the merchant the first conflicting date");

  // capacity 2: A=days 1-5, B=days 6-10 never overlap, so C=1-10 fits; then every day 1-10 is full.
  const two = await mkSlot(2);
  const base = addDays(today, 200);
  const [a, b, c, d] = [mkStore(), mkStore(), mkStore(), mkStore()];
  await book(two, a, { startDate: base, endDate: addDays(base, 4) });
  await book(two, b, { startDate: addDays(base, 5), endDate: addDays(base, 9) });
  await book(two, c, { startDate: base, endDate: addDays(base, 9) });
  await expectErr(book(two, d, { startDate: addDays(base, 3), endDate: addDays(base, 3) }), "SLOT_UNAVAILABLE", 409);
  const av = await A.get<any>(`/ads/slots/${two}/availability?from=${base}&to=${addDays(base, 10)}`);
  assert.deepEqual(av.days.map((x: any) => x.free), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);

  // one store cannot hog both places of a shared slot
  await expectErr(book(two, a, { startDate: addDays(base, 2), endDate: addDays(base, 3) }), "ALREADY_BOOKED", 409);
});

test("concurrency: five stores race for the last place - exactly one wins", async () => {
  const slot = await mkSlot(1);
  const sp = span(2);
  const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => book(slot, mkStore(), sp)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results.filter((x) => x.status === "rejected") as PromiseRejectedResult[]) assert.equal(r.reason.code, "SLOT_UNAVAILABLE");
});

test("store standing: suspended/banned/unknown stores refused, balance checked, billing outage fails closed, pending cap", async () => {
  const slot = await mkSlot(10, 100);
  await expectErr(book(slot, mkStore("SUSPENDED")), "STORE_NOT_ELIGIBLE", 403);
  await expectErr(book(slot, mkStore("BANNED")), "STORE_NOT_ELIGIBLE", 403);
  await expectErr(book(slot, "ghost-store"), "STORE_NOT_FOUND", 404);
  await expectErr(book(slot, mkStore("ACTIVE", 50)), "INSUFFICIENT_FUNDS", 402);

  ledgerDown = true;
  await expectErr(book(slot, mkStore()), "BILLING_UNAVAILABLE", 503);
  ledgerDown = false;

  const hog = mkStore();
  for (let i = 0; i < 3; i++) await book(slot, hog);
  await expectErr(book(slot, hog), "TOO_MANY_PENDING", 429);
});

test("merchant scoping + cancel: only own, only before review, releases the dates", async () => {
  const slot = await mkSlot(1);
  const mine = mkStore(), other = mkStore();
  const sp = span();
  const { booking } = await book(slot, mine, sp);

  await expectErr(A.get(`/ads/bookings/${booking.id}?storeId=${other}`), "NOT_FOUND", 404);
  await expectErr(A.post(`/ads/bookings/${booking.id}/cancel`, { storeId: other }), "NOT_FOUND", 404);
  assert.equal((await A.get<any>(`/ads/bookings?storeId=${other}`)).bookings.length, 0);
  await expectErr(book(slot, other, sp), "SLOT_UNAVAILABLE");

  const cancelled = await A.post<any>(`/ads/bookings/${booking.id}/cancel`, { storeId: mine });
  assert.equal(cancelled.status, "CANCELLED");
  await book(slot, other, sp); // dates are free again
  await expectErr(A.post(`/ads/bookings/${booking.id}/cancel`, { storeId: mine }), "NOT_CANCELLABLE", 409);

  const paid = await approved(await mkSlot(1), mine);
  await expectErr(A.post(`/ads/bookings/${paid.id}/cancel`, { storeId: mine }), "NOT_CANCELLABLE", 409);
});

test("review: reject needs a note, publishes AdRejected once, frees dates; decisions are one-shot", async () => {
  const slot = await mkSlot(1);
  const store = mkStore(), other = mkStore();
  const sp = span();
  const { booking } = await book(slot, store, sp);

  await expectErr(review(booking.id, "REJECT"), "VALIDATION");
  await expectErr(review(booking.id, "MAYBE"), "VALIDATION");
  await expectErr(A.patch("/admin/ads/nope/review", { decision: "REJECT", admin: "a", note: "x" }), "NOT_FOUND", 404);

  const r = await review(booking.id, "REJECT", "Misleading claim");
  assert.equal(r.booking.status, "REJECTED");
  assert.equal(r.booking.reviewNote, "Misleading claim");
  await expectErr(review(booking.id, "REJECT", "again"), "NOT_PENDING", 409);
  await expectErr(review(booking.id, "APPROVE"), "NOT_PENDING", 409);
  const rejected = (await events("AdRejected")).filter((e) => e.bookingNumber === booking.bookingNumber);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].note, "Misleading claim");
  const callsBefore = chargeCalls;
  assert.ok(!charges.has(`ad:${booking.bookingNumber}`), "a rejected ad is never charged");
  assert.equal(chargeCalls, callsBefore);
  await book(slot, other, sp);
});

test("approve: charges exactly once through the ledger, concurrent approvals collapse", async () => {
  const slot = await mkSlot(1, 200);
  const store = mkStore("ACTIVE", 10_000);
  const { booking } = await book(slot, store, span(3)); // 600
  const rs = await Promise.allSettled([review(booking.id, "APPROVE"), review(booking.id, "APPROVE"), review(booking.id, "APPROVE")]);
  assert.ok(rs.filter((r) => r.status === "fulfilled").length >= 1);
  for (const r of rs) if (r.status === "rejected") assert.equal((r.reason as any).code, "NOT_PENDING");

  const key = `ad:${booking.bookingNumber}`;
  assert.equal(charges.get(key)?.amount, 600);
  assert.equal(wallets.get(store)!.available, 9_400, "charged once, not three times");
  const got = await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`);
  assert.equal(got.status, "APPROVED");
  assert.equal(got.chargeState, "CHARGED");
  assert.equal((await events("AdApproved")).filter((e) => e.bookingNumber === booking.bookingNumber).length, 1);
});

test("approve when funds ran out: rejected with a reason, nothing charged, dates freed", async () => {
  const slot = await mkSlot(1, 100);
  const store = mkStore("ACTIVE", 1000), other = mkStore();
  const sp = span(3);
  const { booking } = await book(slot, store, sp);
  wallets.get(store)!.available = 10; // spent it elsewhere meanwhile
  const r = await review(booking.id, "APPROVE");
  assert.equal(r.charged, false);
  assert.equal(r.booking.status, "REJECTED");
  assert.match(r.rejectedReason, /Insufficient wallet balance/);
  assert.equal(wallets.get(store)!.available, 10);
  await book(slot, other, sp);
  assert.equal((await events("AdRejected")).filter((e) => e.bookingNumber === booking.bookingNumber).length, 1);
});

test("approve when the store got suspended after booking: rejected, not charged", async () => {
  const slot = await mkSlot(1);
  const store = mkStore();
  const { booking } = await book(slot, store);
  wallets.get(store)!.status = "SUSPENDED";
  const r = await review(booking.id, "APPROVE");
  assert.equal(r.booking.status, "REJECTED");
  assert.match(r.rejectedReason, /SUSPENDED/);
  assert.ok(!charges.has(`ad:${booking.bookingNumber}`));
});

test("approve while billing is down: stays APPROVED/PENDING (503), worker retries and completes it - no double charge", async () => {
  const slot = await mkSlot(1, 100);
  const store = mkStore();
  const sp = span(2);
  const { booking } = await book(slot, store, sp);

  ledgerDown = true;
  await expectErr(review(booking.id, "APPROVE"), "CHARGE_PENDING", 503);
  let got = await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`);
  assert.equal(got.status, "APPROVED");
  assert.equal(got.chargeState, "PENDING");
  assert.equal((await tick(sp.startDate)).activated, 0, "never goes live unpaid");
  assert.equal((await active()).ads.some((a: any) => a.bookingNumber === booking.bookingNumber), false);

  ledgerDown = false;
  const t = await tick(addDays(sp.startDate, -1));
  assert.ok(t.chargesRetried >= 1);
  got = await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`);
  assert.equal(got.chargeState, "CHARGED");
  assert.equal(wallets.get(store)!.available, 100_000 - 200);
  await tick(addDays(sp.startDate, -1)); // more ticks change nothing
  assert.equal(wallets.get(store)!.available, 100_000 - 200);
  assert.equal((await events("AdApproved")).filter((e) => e.bookingNumber === booking.bookingNumber).length, 1);
});

test("lifecycle: APPROVED -> ACTIVE on the start day (served) -> EXPIRED after the end day (not served)", async () => {
  const slot = await mkSlot(2, 50, "STOREFRONT");
  const store = mkStore();
  const sp = span(3);
  const b = await approved(slot, store, sp);

  await tick(addDays(sp.startDate, -1));
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "APPROVED");
  assert.equal((await active(`?slot=${slot}`)).ads.length, 0, "not live before its start date");

  const t1 = await tick(sp.startDate);
  assert.ok(t1.activated >= 1);
  const live = (await active(`?slot=${slot}`)).ads;
  assert.equal(live.length, 1);
  assert.equal(live[0].bookingNumber, b.bookingNumber);
  assert.equal(live[0].placement, "STOREFRONT");
  assert.equal(live[0].targetUrl, "https://shop.example.com/");
  assert.equal((await active("?placement=STOREFRONT")).ads.some((a: any) => a.slot === slot), true);
  assert.equal((await active("?placement=AGGREGATOR")).ads.some((a: any) => a.slot === slot), false);

  await tick(sp.endDate);
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "ACTIVE", "still live on its last day");

  const t2 = await tick(addDays(sp.endDate, 1));
  assert.ok(t2.expired >= 1);
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "EXPIRED");
  assert.equal((await active(`?slot=${slot}`)).ads.length, 0);
  assert.equal((await events("AdExpired")).filter((e) => e.bookingNumber === b.bookingNumber).length, 1);
  await tick(addDays(sp.endDate, 2));
  assert.equal((await events("AdExpired")).filter((e) => e.bookingNumber === b.bookingNumber).length, 1, "expiry fires once");
});

test("cache never serves outside the date window even if the worker is late", async () => {
  const slot = await mkSlot(1);
  const store = mkStore();
  const sp = span(2);
  await approved(slot, store, sp);
  await tick(sp.startDate);
  await svc.ads.refresh();
  assert.equal((await svc.ads.list({ slot }, new Date(at(sp.startDate)))).length, 1);
  assert.equal((await svc.ads.list({ slot }, new Date(at(addDays(sp.endDate, 1))))).length, 0, "no tick has run, yet it is hidden");
  assert.equal((await svc.ads.list({ slot }, new Date(at(addDays(sp.startDate, -1))))).length, 0);
});

test("pending requests nobody reviewed by the start date are auto-rejected and free the slot", async () => {
  const slot = await mkSlot(1);
  const store = mkStore();
  const sp = span(2);
  const { booking } = await book(slot, store, sp);
  await tick(addDays(sp.startDate, -1));
  assert.equal((await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`)).status, "PENDING_REVIEW");
  await tick(sp.startDate);
  const got = await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`);
  assert.equal(got.status, "REJECTED");
  assert.match(got.reviewNote, /Not reviewed/);
  await expectErr(review(booking.id, "APPROVE"), "NOT_PENDING", 409);
});

test("approving after the start date has arrived is refused (DATES_PASSED), nothing charged", async () => {
  const slot = await mkSlot(1);
  const store = mkStore();
  const { booking } = await book(slot, store, span(2));
  const before = chargeCalls;
  await assert.rejects(
    reviewBooking(svc.db, ledger, { id: booking.id, decision: "APPROVE", admin: "a" }, new Date(at(booking.startDate))),
    (e: any) => e.status === 409 && e.code === "DATES_PASSED"
  );
  assert.equal(chargeCalls, before);
  assert.equal((await A.get<any>(`/ads/bookings/${booking.id}?storeId=${store}`)).status, "PENDING_REVIEW");
});

test("store status: SUSPENDED suspends live ads, recovery resumes them, stale/duplicate events are harmless", async () => {
  const slot = await mkSlot(2);
  const store = mkStore();
  const s = span(30);
  const b = await approved(slot, store, s);

  // A second store that is SUSPENDED before its (charged) ad reaches its start date, on its own slot.
  const slot2 = await mkSlot(1);
  const b2 = await approved(slot2, mkStore(), { startDate: s.startDate, endDate: addDays(s.startDate, 1) });
  const t0 = Date.now();
  await send("StoreStatusChanged", { storeId: b2.storeId, to: "SUSPENDED" }, new Date(t0).toISOString());

  await tick(s.startDate);
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "ACTIVE");
  assert.equal((await A.get<any>(`/ads/bookings/${b2.id}?storeId=${b2.storeId}`)).status, "APPROVED", "blocked store: stays unpublished");
  await sleep(80);
  assert.equal((await active(`?slot=${slot}`)).ads.length, 1);
  assert.equal((await active(`?slot=${slot2}`)).ads.length, 0);

  await send("StoreStatusChanged", { storeId: store, from: "ACTIVE", to: "SUSPENDED" }, new Date(t0 + 1000).toISOString());
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "SUSPENDED");
  await sleep(80); // event-driven changes reach the cache within its TTL
  assert.equal((await active(`?slot=${slot}`)).ads.length, 0);

  // a late-arriving OLDER "ACTIVE" event must not undo the suspension
  await send("StoreStatusChanged", { storeId: store, from: "SUSPENDED", to: "ACTIVE" }, new Date(t0 - 60_000).toISOString());
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "SUSPENDED");

  // duplicate delivery of the same event is a no-op
  const dup = `dup${++seq}`;
  await send("StoreStatusChanged", { storeId: store, to: "BANNED" }, new Date(t0 + 2000).toISOString(), dup);
  const r2: any = await send("StoreStatusChanged", { storeId: store, to: "BANNED" }, new Date(t0 + 2000).toISOString(), dup);
  assert.equal(r2.duplicate, true);
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "SUSPENDED");

  // recovery: the suspended live ad resumes immediately; the never-started one is published by the next tick
  await send("StoreStatusChanged", { storeId: store, to: "ACTIVE" }, new Date(t0 + 3000).toISOString());
  assert.equal((await A.get<any>(`/ads/bookings/${b.id}?storeId=${store}`)).status, "ACTIVE");
  await sleep(80);
  assert.equal((await active(`?slot=${slot}`)).ads.length, 1);

  await send("StoreStatusChanged", { storeId: b2.storeId, to: "ACTIVE" }, new Date(t0 + 4000).toISOString());
  await tick(s.startDate);
  assert.equal((await A.get<any>(`/ads/bookings/${b2.id}?storeId=${b2.storeId}`)).status, "ACTIVE");
});

test("default slot seeding fills an empty database once", async () => {
  const url = await resetDatabase(ADMIN_URL, "ads_seed_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  const db = createDb(url);
  assert.equal(await seedDefaultSlots(db), true);
  const slots = await db.adSlot.findMany();
  assert.ok(slots.length >= 3 && slots.every((s) => Number(s.pricePerDay) > 0 && s.capacity >= 1));
  assert.equal(await seedDefaultSlots(db), false);
  await db.$disconnect();
});

test("internal auth is required on every route; health is open; unknown event types are ignored", async () => {
  const anon = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: "wrong", caller: "x" });
  await expectErr(anon.get("/ads/active"), "UNAUTHORIZED", 401);
  await expectErr(anon.post("/ads/bookings", {}), "UNAUTHORIZED", 401);
  assert.equal(((await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()) as any).status, "ok");
  assert.equal(((await send("SomethingElse", {})) as any).ignored, true);
});
