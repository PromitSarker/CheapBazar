import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startAggregatorService } from "../src/app";

const SECRET = "test-secret";
const PORT = 14007;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let svc: Awaited<ReturnType<typeof startAggregatorService>>;
let A: ReturnType<typeof serviceClient>;
let proUsers = new Set<string>();
let billingDown = false;
let seq = 0;
const T0 = Date.now();
let clock = T0; // monotonically increasing producer timestamps
const tick = (ms = 1000) => new Date((clock += ms)).toISOString();

const send = (eventType: string, data: any, timestamp = tick()) =>
  A.post("/internal/events", { eventId: `e${++seq}-${Math.random()}`, eventType, timestamp, producer: "test", data });

let sn = 0;
async function mkStore(opts: { name?: string; status?: string; plan?: boolean } = {}) {
  const id = `s${++sn}_${Math.random().toString(36).slice(2, 6)}`;
  const name = opts.name ?? `Shop ${id}`;
  const slug = `shop-${id}`;
  await send("StoreCreated", { storeId: id, ownerId: `o_${id}`, name, slug, template: "classic", customDomain: null });
  if (opts.status) await send("StoreStatusChanged", { storeId: id, from: "ACTIVE", to: opts.status });
  if (opts.plan) await send("SubscriptionActivated", { plan: "SELLER_PRO", storeId: id });
  return { id, name, slug };
}
const prod = (storeId: string, o: any = {}, timestamp?: string) => {
  const productId = o.productId ?? `p${++sn}_${Math.random().toString(36).slice(2, 6)}`;
  const data = { productId, storeId, name: "Sourdough Loaf", description: "Crusty bread", image: null, price: 450, stock: 10, channel: "RETAIL", moq: 1, wholesalePrice: null, tiers: [], createdAt: tick(0), ...o };
  return send(o.type ?? "ProductCreated", data, timestamp).then(() => data);
};
const retail = (q: Record<string, string> = {}) => A.get(`/aggregator/retail/search?${new URLSearchParams(q)}`);
const wholesale = (q: Record<string, string> = {}) => A.get(`/aggregator/wholesale/search?${new URLSearchParams(q)}`);
const ids = (r: any) => r.items.map((i: any) => i.productId);

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "search_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startAggregatorService({
    secret: SECRET, port: PORT, databaseUrl: url, relay: false,
    entitlements: { buyerProActive: async (u) => { if (billingDown) throw new Error("down"); return proUsers.has(u); } },
  });
  A = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

test("retail index is built from events and shows store identity", async () => {
  const s = await mkStore({ name: "Rahim Bakery" });
  const p = await prod(s.id, { name: "Butter Croissant" });
  const r = await retail({ q: "croissant" });
  assert.ok(ids(r).includes(p.productId));
  const item = r.items.find((i: any) => i.productId === p.productId);
  assert.deepEqual(item.store, { id: s.id, slug: s.slug, name: "Rahim Bakery" });
  assert.equal(item.price, 450);
  assert.equal(item.inStock, true);
});

test("out-of-order and duplicate events: product before store, stale updates, tombstones", async () => {
  const id = `ooo_${Math.random().toString(36).slice(2, 6)}`;
  const p = await prod(id, { name: "Early Bird" }); // product arrives BEFORE its store
  assert.ok(!ids(await retail({ q: "early bird" })).includes(p.productId), "invisible until the store is known");
  await send("StoreCreated", { storeId: id, ownerId: "o", name: "Late Store", slug: `late-${id}`, template: "modern" });
  assert.ok(ids(await retail({ q: "early bird" })).includes(p.productId));

  // newer update first, then an older one: the newer wins
  const newer = tick(5000), older = new Date(Date.parse(newer) - 3000).toISOString();
  await prod(id, { productId: p.productId, name: "Early Bird v2", price: 500, type: "ProductUpdated" }, newer);
  await prod(id, { productId: p.productId, name: "Early Bird STALE", price: 1, type: "ProductUpdated" }, older);
  const cur = (await retail({ q: "early bird" })).items.find((i: any) => i.productId === p.productId);
  assert.equal(cur.name, "Early Bird v2");
  assert.equal(cur.price, 500);

  // delete, then a stale "updated" arrives late: must NOT resurrect
  await send("ProductDeleted", { productId: p.productId, storeId: id }, tick(1000));
  assert.ok(!ids(await retail({ q: "early bird" })).includes(p.productId));
  await prod(id, { productId: p.productId, name: "Early Bird v2", type: "ProductUpdated" }, newer);
  assert.ok(!ids(await retail({ q: "early bird" })).includes(p.productId), "tombstone holds");

  // exact duplicate delivery is acknowledged and ignored
  const ev = { eventId: "dup-1", eventType: "StoreUpdated", timestamp: tick(), producer: "t", data: { storeId: id, name: "Renamed", slug: `late-${id}` } };
  await A.post("/internal/events", ev);
  assert.equal((await A.post("/internal/events", ev)).duplicate, true);
});

test("store lifecycle controls visibility: only ACTIVE/WARNING/COD_BLOCKED are listed", async () => {
  const s = await mkStore();
  const p = await prod(s.id, { name: "Lifecycle Item" });
  const visible = async () => ids(await retail({ q: "lifecycle item" })).includes(p.productId);
  assert.equal(await visible(), true);
  for (const st of ["WARNING", "COD_BLOCKED"]) { await send("StoreStatusChanged", { storeId: s.id, to: st }); assert.equal(await visible(), true, st); }
  for (const st of ["PAUSED", "DELISTED", "SUSPENDED", "BANNED"]) { await send("StoreStatusChanged", { storeId: s.id, to: st }); assert.equal(await visible(), false, st); }
  await send("StoreStatusChanged", { storeId: s.id, to: "ACTIVE" });
  assert.equal(await visible(), true);
  // a stale status event cannot undo a newer one
  await send("StoreStatusChanged", { storeId: s.id, to: "DELISTED" }, new Date(T0 - 100000).toISOString());
  assert.equal(await visible(), true);
});

test("search: terms, store-name match, LIKE wildcards are literal, filters, sort, pagination, facets", async () => {
  const a = await mkStore({ name: "Zebra Mart" });
  const b = await mkStore({ name: "Other Shop" });
  const mk = (s: any, name: string, price: number, stock = 5) => prod(s.id, { name, description: "", price, stock });
  const [cheap, mid, dear] = [await mk(a, "Zebra Cake Small", 100), await mk(a, "Zebra Cake Medium", 500), await mk(b, "Zebra Cake Large", 900, 0)];
  const pct = await mk(b, "100% Cotton Shirt", 700);

  assert.deepEqual(ids(await retail({ q: "zebra cake", sort: "price_asc" })), [cheap.productId, mid.productId, dear.productId]);
  assert.deepEqual(ids(await retail({ q: "zebra cake", sort: "price_desc" })), [dear.productId, mid.productId, cheap.productId]);
  assert.deepEqual(ids(await retail({ q: "zebra cake", minPrice: "200", maxPrice: "600" })), [mid.productId]);
  assert.deepEqual(ids(await retail({ q: "zebra cake", inStock: "true", sort: "price_asc" })), [cheap.productId, mid.productId]);
  assert.ok(ids(await retail({ q: "zebra mart" })).includes(cheap.productId), "matches the store name too");
  assert.deepEqual(ids(await retail({ q: "zebra cake", storeId: b.id })), [dear.productId]);

  assert.deepEqual(ids(await retail({ q: "100%" })), [pct.productId], "% is a literal, not a wildcard");
  assert.deepEqual(ids(await retail({ q: "%" })), [pct.productId], "a lone % matches only text that really contains %");
  await mk(a, "Sourdough Loaf", 450);
  assert.ok((await retail({ q: "sourdough loaf" })).total > 0);
  assert.deepEqual((await retail({ q: "sourdough_loaf" })).items, [], "_ is a literal, not a one-char wildcard");

  const page1 = await retail({ q: "zebra cake", sort: "price_asc", limit: "2", page: "1" });
  const page2 = await retail({ q: "zebra cake", sort: "price_asc", limit: "2", page: "2" });
  assert.equal(page1.total, 3);
  assert.equal(page1.pages, 2);
  assert.deepEqual([...ids(page1), ...ids(page2)], [cheap.productId, mid.productId, dear.productId]);

  const f = (await retail({ q: "zebra cake", storeId: b.id })).facets.stores;
  assert.deepEqual(f.map((x: any) => [x.name, x.count]), [["Zebra Mart", 2], ["Other Shop", 1]], "facets ignore the store filter itself");
  assert.equal((await retail({ q: "zebra cake", limit: "9999" })).limit, 48, "page size is capped");
  assert.ok((await retail({ q: "x'; DROP TABLE \"ListingIndex\";--" })).items.length === 0, "SQL is parameterised");
});

test("wholesale index needs an active Seller plan and the BOTH/WHOLESALE channel", async () => {
  const planned = await mkStore({ plan: true });
  const unplanned = await mkStore();
  const mk = (s: any, name: string, channel: string) => prod(s.id, { name, channel, wholesalePrice: 300, moq: 10, tiers: [{ minQty: 50, unitPrice: 250 }] });
  const a = await mk(planned, "Wsale Flour", "WHOLESALE");
  const b = await mk(planned, "Wsale Both", "BOTH");
  const c = await mk(planned, "Wsale Retailonly", "RETAIL");
  const d = await mk(unplanned, "Wsale NoPlan", "WHOLESALE");

  proUsers.add("pro1");
  const w = ids(await wholesale({ q: "wsale", viewerId: "pro1" }));
  assert.ok(w.includes(a.productId) && w.includes(b.productId));
  assert.ok(!w.includes(c.productId), "retail-only is not in the wholesale index");
  assert.ok(!w.includes(d.productId), "seller without a plan is not listed");
  assert.ok(ids(await retail({ q: "wsale" })).includes(b.productId) && !ids(await retail({ q: "wsale" })).includes(a.productId));

  await send("SubscriptionLapsed", { plan: "SELLER_PRO", storeId: planned.id });
  assert.ok(!ids(await wholesale({ q: "wsale", viewerId: "pro1" })).includes(a.productId), "lapsed plan hides wholesale listings");
  await send("SubscriptionActivated", { plan: "SELLER_PRO", storeId: planned.id });
  assert.ok(ids(await wholesale({ q: "wsale", viewerId: "pro1" })).includes(a.productId));
  await send("SubscriptionActivated", { plan: "BUYER_PRO", userId: "u" }); // buyer plans are not part of the index
});

test("Pro paywall: anonymous / non-Pro / billing-down viewers get a preview that leaks no prices", async () => {
  const s = await mkStore({ plan: true });
  await prod(s.id, { name: "Paywall Item A", channel: "WHOLESALE", wholesalePrice: 7777, moq: 321, tiers: [{ minQty: 999, unitPrice: 4242 }] });
  await prod(s.id, { name: "Paywall Item B", channel: "WHOLESALE", wholesalePrice: 1111, moq: 123, tiers: [] });
  proUsers.add("pro2");

  const leaks = (r: any) => ["7777", "4242", "321", "1111", "wholesalePrice", "moq", "tiers"].filter((k) => JSON.stringify(r).includes(k));

  const anon = await wholesale({ q: "paywall item" });
  assert.equal(anon.total, 2);
  assert.deepEqual(anon.paywall, { locked: true, reason: "LOGIN_REQUIRED" });
  assert.ok(anon.items.every((i: any) => i.locked === true && i.name));
  assert.deepEqual(leaks(anon), [], "no price/MOQ/tier data in a locked response");

  const free = await wholesale({ q: "paywall item", viewerId: "free-user" });
  assert.deepEqual(free.paywall, { locked: true, reason: "BUYER_PRO_REQUIRED" });
  assert.deepEqual(leaks(free), []);

  // price filters and sorts must not become an oracle for hidden prices
  const probe = await wholesale({ q: "paywall item", minPrice: "5000", sort: "price_asc" });
  assert.equal(probe.total, 2, "price filter ignored while locked");
  assert.deepEqual(leaks(probe), []);
  const probeSorted = await wholesale({ q: "paywall item", sort: "price_asc", viewerId: "free-user" });
  const probeDesc = await wholesale({ q: "paywall item", sort: "price_desc", viewerId: "free-user" });
  assert.deepEqual(ids(probeSorted), ids(probeDesc), "locked results do not reorder by price");

  billingDown = true;
  const down = await wholesale({ q: "paywall item", viewerId: "pro2" });
  assert.equal(down.paywall.locked, true, "billing outage fails closed");
  assert.deepEqual(leaks(down), []);
  billingDown = false;

  const pro = await wholesale({ q: "paywall item", viewerId: "pro2", sort: "price_asc" });
  assert.deepEqual(pro.paywall, { locked: false, reason: null });
  assert.deepEqual(pro.items.map((i: any) => [i.wholesalePrice, i.moq]), [[1111, 123], [7777, 321]]);
  assert.deepEqual(pro.items[1].tiers, [{ minQty: 999, unitPrice: 4242 }]);
  assert.equal(pro.items[0].price, undefined, "the nominal retail price of wholesale items is not exposed");
  assert.equal((await wholesale({ q: "paywall item", viewerId: "pro2", minPrice: "5000" })).total, 1, "filters work once unlocked");
});

test("store directory lists visible stores with product counts; admin stats", async () => {
  const s = await mkStore({ name: "Directory Dhaka" });
  const hidden = await mkStore({ name: "Directory Hidden", status: "DELISTED" });
  await prod(s.id, { name: "d1" });
  await prod(s.id, { name: "d2" });
  await prod(hidden.id, { name: "d3" });
  const dir = (await A.get("/aggregator/stores?q=directory")).stores;
  assert.deepEqual(dir.map((d: any) => [d.name, d.productCount]), [["Directory Dhaka", 2]]);
  assert.deepEqual((await A.get("/aggregator/stores?q=%25")).stores, [], "wildcard is literal here as well");
  const st = await A.get("/admin/stats");
  assert.ok(st.listings > 5 && st.retailVisible > 0 && st.stores >= 5);
});
