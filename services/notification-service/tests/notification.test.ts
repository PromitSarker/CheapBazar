import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startNotificationService } from "../src/app";
import { plan, toBn } from "../src/templates";
import { normalizeBdPhone, type Providers } from "../src/providers";
import { mapStatus, sign } from "../src/courier";

const SECRET = "test-secret";
const PORT = 14008;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";
const BASE = `http://127.0.0.1:${PORT}`;

let svc: Awaited<ReturnType<typeof startNotificationService>>;
let N: ReturnType<typeof serviceClient>;
let seq = 0;

// ---- fakes for identity (directory) and the email/SMS providers
const users = new Map<string, { email: string; name: string }>();
const owners = new Map<string, string>();
let admins: string[] = [];
let directoryDown = false;
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
const sentSms: Array<{ phone: string; text: string }> = [];
let emailMode: "ok" | "fail" | "unconfigured" = "ok";
let emailFailuresLeft = 0;
const providers: Providers = {
  async email(to, subject, text) {
    if (emailMode === "unconfigured") return "skipped";
    if (emailMode === "fail" || emailFailuresLeft-- > 0) throw new Error("smtp down");
    sentEmails.push({ to, subject, text });
    return "sent";
  },
  async sms(phone, text) { sentSms.push({ phone, text }); return "sent"; },
};

const uid = () => `u${++seq}_${Math.random().toString(36).slice(2, 6)}`;
function mkUser(email?: string) {
  const id = uid();
  users.set(id, { email: email ?? `${id}@example.com`, name: id });
  return id;
}
const env = (eventType: string, data: any, eventId = `ev${++seq}_${Math.random()}`, timestamp = new Date().toISOString()) =>
  ({ eventId, eventType, timestamp, producer: "test", data });
const send = (e: ReturnType<typeof env>) => N.post("/internal/events", e);
const inbox = (userId: string, q = "") => N.get<any>(`/notifications?userId=${userId}${q}`);
const runWorker = () => N.post("/admin/deliveries/run");
async function expectErr(p: Promise<any>, code: string, status?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "notifications_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startNotificationService({
    secret: SECRET, port: PORT, databaseUrl: url, relay: false, worker: false, providers,
    directory: {
      async user(id) { if (directoryDown) throw new Error("identity down"); return users.get(id) ?? null; },
      async storeOwner(sid) { if (directoryDown) throw new Error("identity down"); return owners.get(sid) ?? null; },
      async admins() { if (directoryDown) throw new Error("identity down"); return admins; },
    },
  });
  N = serviceClient({ baseUrl: BASE, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

const order = (o: any = {}) => ({
  orderId: "o1", orderNumber: "ORD-AB12CD34", storeId: "st1", storeSlug: "demo", ownerId: "owner", buyerId: null, buyerName: "Karim",
  buyerPhone: "01712345678", orderType: "RETAIL", paymentMethod: "COD", total: 1250.5, fee: 62.53, net: 1187.97, status: "CONFIRMED", ...o,
});

test("planner (pure): who is told what, in both languages, with throttled keys", () => {
  const created = plan(env("OrderCreated", order()));
  assert.equal(created.notifications.length, 1);
  const n = created.notifications[0];
  assert.match(n.en.title, /New order ORD-AB12CD34/);
  assert.match(n.en.body, /৳1,250\.50 \(Cash on Delivery\)/);
  assert.match(n.bn.body, /৳১,২৫০\.৫০/, "Bengali numerals");
  assert.equal(n.email, true);

  const confirmed = plan(env("OrderConfirmed", order()));
  assert.equal(confirmed.sms.length, 1);
  assert.match(confirmed.sms[0].text, /^Cheap-Bazar: Your order ORD-AB12CD34 is confirmed/);
  assert.equal(plan(env("OrderCreated", order({ buyerPhone: undefined }))).sms.length, 0);

  // low-balance alerts are bucketed per store+level+6h
  const t = Date.parse("2026-11-01T00:30:00Z");
  const k = (ts: number, status = "WARNING") => plan(env("BalanceLow", { storeId: "s", ownerId: "o", available: 300, status }, "x", new Date(ts).toISOString())).notifications[0].dedupe;
  assert.equal(k(t), k(t + 60_000));
  assert.notEqual(k(t), k(t + 7 * 3_600_000));
  assert.notEqual(k(t), k(t, "COD_BLOCKED"));

  assert.equal(plan(env("StoreStatusChanged", { storeId: "s", ownerId: "o", to: "WARNING" })).notifications.length, 0, "covered by BalanceLow");
  assert.equal(plan(env("StoreStatusChanged", { storeId: "s", ownerId: "o", to: "PAUSED", reason: "no top-up" })).notifications.length, 1);
  assert.equal(plan(env("SomethingElse", {})).notifications.length, 0);
  assert.equal(toBn("৳12.50"), "৳১২.৫০");
});

test("phone normalisation and courier status mapping", () => {
  assert.equal(normalizeBdPhone("01712345678"), "8801712345678");
  assert.equal(normalizeBdPhone("+880 1712-345678"), "8801712345678");
  assert.equal(normalizeBdPhone("8801712345678"), "8801712345678");
  assert.equal(normalizeBdPhone("01212345678"), null);
  assert.equal(normalizeBdPhone("12345"), null);
  assert.equal(mapStatus("Delivered To Customer"), "DELIVERED");
  assert.equal(mapStatus("out-for-delivery"), "SHIPPED");
  assert.equal(mapStatus("returned_to_merchant"), "REFUSED");
  assert.equal(mapStatus("partial_delivered"), null, "ambiguous statuses are never auto-applied");
  assert.equal(mapStatus("in_review"), null);
});

test("events become an in-app inbox; read state is per-user; language is selectable", async () => {
  const seller = mkUser();
  const other = mkUser();
  await send(env("StoreCreated", { storeId: "s_a", ownerId: seller, name: "Rahim Bakery", slug: "rahim" }));
  await send(env("OrderCreated", order({ ownerId: seller, storeId: "s_a", orderNumber: "ORD-INBOX001" })));
  await send(env("OrderCreated", order({ ownerId: other, storeId: "s_b", orderNumber: "ORD-OTHER001" })));

  const box = await inbox(seller);
  assert.equal(box.unreadCount, 2);
  assert.deepEqual(box.notifications.map((n: any) => n.kind).sort(), ["ORDER_NEW", "STORE_CREATED"]);
  assert.equal(box.notifications.every((n: any) => n.titleBn && n.bodyBn), true);
  const bn = await inbox(seller, "&lang=bn");
  assert.match(bn.notifications.find((n: any) => n.kind === "ORDER_NEW").title, /নতুন অর্ডার/);
  assert.match(box.notifications.find((n: any) => n.kind === "ORDER_NEW").title, /New order/);

  // someone else cannot mark my notifications read
  const mine = box.notifications.map((n: any) => n.id);
  assert.equal((await N.post("/notifications/read", { userId: other, ids: mine })).updated, 0);
  assert.equal((await inbox(seller)).unreadCount, 2);
  assert.equal((await N.post("/notifications/read", { userId: seller, ids: [mine[0]] })).updated, 1);
  assert.equal((await N.get<any>(`/notifications/unread-count?userId=${seller}`)).unreadCount, 1);
  assert.equal((await inbox(seller, "&unread=true")).notifications.length, 1);
  assert.equal((await N.post("/notifications/read", { userId: seller, all: true })).updated, 1);
  assert.equal((await inbox(seller)).unreadCount, 0);
  await expectErr(N.post("/notifications/read", { userId: seller }), "VALIDATION", 400);
  assert.equal((await inbox(other)).unreadCount, 1, "the other seller's inbox is untouched");
});

test("replays and repeated alerts collapse; unknown events are ignored", async () => {
  const seller = mkUser();
  const e = env("OrderCreated", order({ ownerId: seller, orderNumber: "ORD-DUP00001" }), "same-event-id");
  await send(e);
  assert.equal((await send(e)).duplicate, true);
  assert.equal((await inbox(seller)).notifications.length, 1);

  // same low-balance condition reported repeatedly within 6h -> one notification
  const ts = new Date().toISOString();
  for (let i = 0; i < 4; i++) await send(env("BalanceLow", { storeId: "s_low", ownerId: seller, available: 90, status: "COD_BLOCKED" }, `low-${seller}-${i}`, ts));
  assert.equal((await inbox(seller)).notifications.filter((n: any) => n.kind === "BALANCE_LOW").length, 1);
  // ...but a different level is a different alert
  await send(env("BalanceLow", { storeId: "s_low", ownerId: seller, available: 400, status: "WARNING" }, `low2-${seller}`, ts));
  assert.equal((await inbox(seller)).notifications.filter((n: any) => n.kind === "BALANCE_LOW").length, 2);

  // out-of-stock: once per product per day
  for (let i = 0; i < 3; i++) await send(env("StockDepleted", { productId: "p1", storeId: "s_low", ownerId: seller, name: "Cake" }, `stk-${seller}-${i}`, ts));
  assert.equal((await inbox(seller)).notifications.filter((n: any) => n.kind === "STOCK_OUT").length, 1);

  assert.equal((await send(env("TotallyUnknown", {}))).ignored, true);
});

test("recipients are resolved via identity; an identity outage fails the event so the bus retries it", async () => {
  const owner = mkUser();
  owners.set("st_dir", owner);
  const a1 = mkUser(), a2 = mkUser();
  admins = [a1, a2];

  // event carries only storeId -> owner looked up
  await send(env("WalletToppedUp", { storeId: "st_dir", amount: 500, reference: "MP-9" }));
  assert.equal((await inbox(owner)).notifications[0].kind, "WALLET_TOPUP");
  // admin broadcast
  await send(env("AdBookingRequested", { bookingNumber: "AD-1", headline: "Sale!", storeId: "st_dir", slot: "Top" }));
  assert.equal((await inbox(a1)).notifications[0].kind, "AD_REVIEW_NEEDED");
  assert.equal((await inbox(a2)).notifications[0].kind, "AD_REVIEW_NEEDED");

  directoryDown = true;
  const retryable = env("WalletToppedUp", { storeId: "st_dir", amount: 700, reference: "MP-10" }, "retry-me");
  await assert.rejects(send(retryable), (e: any) => e instanceof ServiceError && e.status === 500);
  assert.equal((await inbox(owner)).notifications.length, 1, "nothing half-written");
  directoryDown = false;
  await send(retryable); // the bus redelivers the same event and it now succeeds
  assert.equal((await inbox(owner)).notifications.length, 2);

  // a store with no known owner is skipped, not an error
  await send(env("WalletToppedUp", { storeId: "ghost", amount: 1, reference: "x" }));
});

test("email/SMS deliveries: sent via providers, retried with backoff, skipped when undeliverable, FAILED after max attempts", async () => {
  sentEmails.length = 0; sentSms.length = 0;
  const seller = mkUser("seller@example.com");
  const guest = mkUser("01712345678@storeforge.buyer");
  await send(env("OrderCreated", order({ ownerId: seller, orderNumber: "ORD-MAIL0001" })));
  await send(env("OrderConfirmed", order({ ownerId: seller, orderNumber: "ORD-MAIL0001", buyerPhone: "01912345678" })));
  await send(env("WalletToppedUp", { storeId: "g", ownerId: guest, amount: 5, reference: "r" })); // email never created (no email flag)
  await send(env("StoreStatusChanged", { storeId: "g", ownerId: guest, to: "PAUSED" }));         // email flagged but guest address

  const r1 = await runWorker();
  assert.ok(r1.sent >= 2 && r1.skipped >= 1);
  const mail = sentEmails.find((m) => m.to === "seller@example.com");
  assert.ok(mail && /New order ORD-MAIL0001/.test(mail.subject));
  assert.match(mail.text, /নতুন অর্ডার|অর্ডার/, "email carries the Bengali text too");
  assert.deepEqual(sentSms.map((s) => s.phone), ["8801912345678"], "SMS goes to the normalised buyer number");
  assert.ok(!sentEmails.some((m) => m.to.endsWith("@storeforge.buyer")), "no email to placeholder guest addresses");
  assert.equal((await N.get<any>("/admin/deliveries?status=SKIPPED")).deliveries.some((d: any) => /no deliverable email/.test(d.lastError)), true);

  // provider flaps twice then recovers
  const s2 = mkUser("flaky@example.com");
  await send(env("OrderCreated", order({ ownerId: s2, orderNumber: "ORD-FLAKY001" })));
  emailFailuresLeft = 2;
  const due = () => svc.db.$executeRawUnsafe(`UPDATE "Delivery" SET "nextAttemptAt" = now() - interval '1 second' WHERE "status" = 'PENDING'`);
  assert.equal((await runWorker()).retried, 1);
  await due();
  assert.equal((await runWorker()).retried, 1);
  await due();
  assert.equal((await runWorker()).sent, 1);
  assert.ok(sentEmails.some((m) => m.to === "flaky@example.com"));

  // provider hard down -> FAILED after the max attempts, never silently dropped
  const s3 = mkUser("dead@example.com");
  await send(env("OrderCreated", order({ ownerId: s3, orderNumber: "ORD-DEAD0001" })));
  emailMode = "fail";
  for (let i = 0; i < 7; i++) { await due(); await runWorker(); }
  const failed = (await N.get<any>("/admin/deliveries?status=FAILED")).deliveries;
  assert.ok(failed.some((d: any) => d.toUserId === s3 && /smtp down/.test(d.lastError)));
  emailMode = "ok";

  // not configured -> SKIPPED, honestly not SENT
  const s4 = mkUser("nocfg@example.com");
  await send(env("OrderCreated", order({ ownerId: s4, orderNumber: "ORD-NOCFG001" })));
  emailMode = "unconfigured";
  await runWorker();
  emailMode = "ok";
  const skipped = (await N.get<any>("/admin/deliveries?status=SKIPPED")).deliveries;
  assert.ok(skipped.some((d: any) => d.toUserId === s4 && /not configured/.test(d.lastError)));

  // invalid phone numbers are skipped, not retried forever
  await send(env("OrderConfirmed", order({ orderNumber: "ORD-BADPH001", buyerPhone: "12345" })));
  await runWorker();
  assert.ok((await N.get<any>("/admin/deliveries?status=SKIPPED")).deliveries.some((d: any) => /not a Bangladeshi mobile/.test(d.lastError)));
});

// ------------------------------------------------------------------- courier
const postWebhook = (courier: string, body: any, opts: { secret?: string; ts?: number; sig?: string; raw?: string } = {}) => {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const signature = opts.sig ?? sign(opts.secret ?? "courier-secret", ts, raw);
  return fetch(`${BASE}/courier/webhook/${courier}`, { method: "POST", headers: { "content-type": "application/json", "x-timestamp": ts, "x-signature": signature }, body: raw });
};
const outboxFor = (orderNumber: string) =>
  svc.db.$queryRawUnsafe<{ consumer: string; envelope: any }[]>(`SELECT "consumer","envelope" FROM "OutboxMessage" WHERE "eventType" = 'ShipmentUpdated' AND "envelope"->'data'->>'orderNumber' = $1`, orderNumber);

test("courier webhook: disabled without a secret, signature + freshness enforced, public route needs no bearer", async () => {
  delete process.env.COURIER_WEBHOOK_SECRET;
  assert.equal((await postWebhook("pathao", { order_number: "ORD-HOOK0001", status: "delivered" })).status, 503);

  process.env.COURIER_WEBHOOK_SECRET = "courier-secret";
  try {
    const body = { order_number: "ORD-HOOK0001", status: "delivered", tracking_number: "TRK-1", event_id: "evt-1" };
    assert.equal((await postWebhook("pathao", body, { sig: "0".repeat(64) })).status, 401, "wrong signature");
    assert.equal((await postWebhook("pathao", body, { secret: "other-secret" })).status, 401, "signed with the wrong secret");
    assert.equal((await postWebhook("pathao", body, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401, "stale timestamp (replay)");
    const raw = JSON.stringify(body);
    const goodSig = sign("courier-secret", Math.floor(Date.now() / 1000), raw);
    assert.equal((await postWebhook("pathao", body, { raw: raw.replace("delivered", "refused"), sig: goodSig })).status, 401, "tampered body");
    assert.equal((await outboxFor("ORD-HOOK0001")).length, 0, "nothing published for rejected calls");

    const ok = await postWebhook("pathao", body);
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json() as any, { accepted: true, duplicate: false, mapped: "DELIVERED" });
    const rows = await outboxFor("ORD-HOOK0001");
    assert.deepEqual(rows.map((r) => r.consumer), ["order"], "ShipmentUpdated goes to order-service");
    assert.deepEqual(
      { status: rows[0].envelope.data.status, courier: rows[0].envelope.data.courier, trackingNumber: rows[0].envelope.data.trackingNumber },
      { status: "DELIVERED", courier: "pathao", trackingNumber: "TRK-1" }
    );

    // retried delivery of the same callback is idempotent
    const again: any = await (await postWebhook("pathao", body)).json();
    assert.equal(again.duplicate, true);
    assert.equal((await outboxFor("ORD-HOOK0001")).length, 1);
  } finally { delete process.env.COURIER_WEBHOOK_SECRET; }
});

test("courier webhook: payload validation, unmapped statuses, per-courier secrets", async () => {
  process.env.COURIER_WEBHOOK_SECRET_REDX = "redx-secret";
  try {
    const good = { merchant_order_id: "ord-redx0001", status: "In Transit", consignment_id: "C-9", updated_at: "2026-11-01T10:00:00Z" };
    assert.equal((await postWebhook("redx", good)).status, 401, "global secret is not configured; redx uses its own");
    const ok: any = await (await postWebhook("redx", good, { secret: "redx-secret" })).json();
    assert.equal(ok.mapped, "SHIPPED");
    const e = (await outboxFor("ORD-REDX0001"))[0].envelope.data;
    assert.equal(e.trackingNumber, "C-9", "order number is normalised to upper case");

    const unmapped: any = await (await postWebhook("redx", { order_number: "ORD-REDX0002", status: "partial_delivered" }, { secret: "redx-secret" })).json();
    assert.equal(unmapped.mapped, null);
    assert.equal((await outboxFor("ORD-REDX0002")).length, 0, "ambiguous statuses are recorded but never forwarded");
    assert.equal((await svc.db.courierEvent.count({ where: { orderNumber: "ORD-REDX0002" } })), 1);

    assert.equal((await postWebhook("redx", { order_number: "not-an-order", status: "delivered" }, { secret: "redx-secret" })).status, 400);
    assert.equal((await postWebhook("redx", { order_number: "ORD-REDX0003" }, { secret: "redx-secret" })).status, 400);
    assert.equal((await postWebhook("redx", {}, { secret: "redx-secret", raw: "{not json" })).status, 400);
    assert.equal((await postWebhook("bad courier!", good, { secret: "redx-secret" })).status, 404);
  } finally { delete process.env.COURIER_WEBHOOK_SECRET_REDX; }
});

test("direct notify is idempotent; stats and auth", async () => {
  const u = mkUser();
  const body = { userId: u, kind: "CUSTOM", title: "Hi", body: "There", idempotencyKey: `direct-${u}` };
  assert.equal((await N.post("/notifications", body)).created, true);
  assert.equal((await N.post("/notifications", body)).created, false);
  assert.equal((await inbox(u)).notifications.length, 1);
  await expectErr(N.post("/notifications", { userId: u }), "VALIDATION", 400);

  const st = await N.get<any>("/admin/stats");
  assert.ok(st.deliveries.SENT >= 2 && st.courierEvents >= 3 && st.unreadNotifications > 0);
  const anon = serviceClient({ baseUrl: BASE, secret: "wrong", caller: "x" });
  await expectErr(anon.get(`/notifications?userId=${u}`), "UNAUTHORIZED", 401);
});
