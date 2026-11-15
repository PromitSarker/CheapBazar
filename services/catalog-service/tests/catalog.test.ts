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

test("wholesale listings: free for sellers, but need a price and sane tiers; channels filter correctly", async () => {
  const s = store();
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

  // sellers pay nothing for wholesale: turning a retail item wholesale, or editing a wholesale one, needs no plan
  const retail = (await api.get(`/stores/${s}/products?q=retail%20only`)).products[0];
  assert.equal((await api.patch(`/products/${retail.productId}`, { storeId: s, channel: "BOTH", wholesalePrice: 100, moq: 2 })).channel, "BOTH");
  assert.equal((await api.patch(`/products/${wsOnly.productId}`, { storeId: s, stock: 5 })).stock, 5);
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

// ------------------------------------------------------------------ categories
const flat = (tree: any[]): any[] => tree.flatMap((c) => [c, ...flat(c.children)]);
const topNamed = async (nameEn: string) => (await api.get("/categories")).categories.find((c: any) => c.nameEn === nameEn);

test("starter category tree is seeded: two levels, bilingual, icons, ordered", async () => {
  const { categories } = await api.get("/categories");
  assert.ok(categories.length >= 8, "has the main departments");
  const grocery = categories.find((c: any) => c.slug === "grocery-food");
  assert.ok(grocery && grocery.children.length >= 5 && grocery.nameBn && grocery.icon);
  assert.ok(grocery.children.every((c: any) => c.nameBn && c.parentId === grocery.id && c.children.length === 0));
  const orders = categories.map((c: any) => c.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a: number, b: number) => a - b), "sorted by sortOrder");
  const slugs = flat(categories).map((c: any) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
});

test("admin category CRUD: two levels only, no moving, hiding, delete only when empty", async () => {
  const top = await api.post("/admin/categories", { nameEn: "Pet Supplies", nameBn: "পোষা প্রাণী", icon: "pets", sortOrder: 500 });
  assert.equal(top.slug, "pet-supplies");
  assert.equal(top.parentId, null);
  const sub = await api.post("/admin/categories", { nameEn: "Dog Food", parentId: top.id });
  assert.equal(sub.parentId, top.id);
  await expectErr(api.post("/admin/categories", { nameEn: "Puppy", parentId: sub.id }), "VALIDATION", 400); // 3rd level
  await expectErr(api.post("/admin/categories", { nameEn: "" }), "VALIDATION", 400);
  await expectErr(api.post("/admin/categories", { nameEn: "X", icon: "Not An Icon!" }), "VALIDATION", 400);
  await expectErr(api.post("/admin/categories", { nameEn: "Orphan", parentId: "nope" }), "VALIDATION", 400);
  await expectErr(api.post("/admin/categories", { nameEn: "Other Pets", slug: "pet-supplies" }), "CONFLICT", 409);
  const dup = await api.post("/admin/categories", { nameEn: "Pet Supplies" }); // same name -> auto-suffixed slug
  assert.equal(dup.slug, "pet-supplies-2");

  const renamed = await api.patch(`/admin/categories/${top.id}`, { nameEn: "Pets", nameBn: "পোষা" });
  assert.equal(renamed.nameEn, "Pets");
  await expectErr(api.patch(`/admin/categories/${sub.id}`, { parentId: dup.id }), "VALIDATION", 400); // cannot move
  assert.equal((await api.patch(`/admin/categories/${sub.id}`, { parentId: top.id })).parentId, top.id, "same parent is a no-op");

  // hiding a parent hides its children from the public tree, but not from the admin tree
  await api.patch(`/admin/categories/${top.id}`, { active: false });
  assert.ok(!flat((await api.get("/categories")).categories).some((c: any) => c.id === sub.id));
  assert.ok(flat((await api.get("/admin/categories")).categories).some((c: any) => c.id === sub.id));
  await api.patch(`/admin/categories/${top.id}`, { active: true });

  await expectErr(api.delete(`/admin/categories/${top.id}`), "IN_USE", 409); // has a child
  await api.delete(`/admin/categories/${sub.id}`);
  await api.delete(`/admin/categories/${dup.id}`);
  await api.delete(`/admin/categories/${top.id}`);
  await expectErr(api.delete(`/admin/categories/${top.id}`), "NOT_FOUND", 404);
});

test("products: category, brand, unit, was-price and gallery are validated and published", async () => {
  const s = store();
  const grocery = await topNamed("Grocery & Food");
  const sub = grocery.children[0];

  const p = await mk(s, { categoryId: sub.id, brand: "  Aarong  ", unit: "500 g", price: 80, compareAtPrice: 100, images: ["/uploads/a.png", "https://x.test/b.jpg", "/uploads/a.png"] });
  assert.equal(p.categoryId, sub.id);
  assert.equal(p.parentCategoryId, grocery.id, "denormalised top-level id");
  assert.equal(p.brand, "Aarong");
  assert.equal(p.unit, "500 g");
  assert.equal(p.compareAtPrice, 100);
  assert.deepEqual(p.images, ["/uploads/a.png", "https://x.test/b.jpg"], "de-duplicated, order kept");
  assert.equal(p.image, "/uploads/a.png", "cover = first gallery image");

  await expectErr(mk(s, { categoryId: "does-not-exist" }), "VALIDATION", 400);
  await expectErr(mk(s, { price: 100, compareAtPrice: 100 }), "VALIDATION", 400); // must be strictly higher
  await expectErr(mk(s, { price: 100, compareAtPrice: 50 }), "VALIDATION", 400);
  await expectErr(mk(s, { images: ["javascript:alert(1)"] }), "VALIDATION", 400);
  await expectErr(mk(s, { images: Array.from({ length: 9 }, (_, i) => `/uploads/${i}.png`) }), "VALIDATION", 400);

  // PATCH keeps what is not mentioned, and re-validates the was-price against the NEW selling price
  const kept = await api.patch(`/products/${p.productId}`, { storeId: s, stock: 3 });
  assert.equal(kept.categoryId, sub.id);
  assert.equal(kept.compareAtPrice, 100);
  await expectErr(api.patch(`/products/${p.productId}`, { storeId: s, price: 120 }), "VALIDATION", 400);
  const sale = await api.patch(`/products/${p.productId}`, { storeId: s, price: 120, compareAtPrice: null });
  assert.equal(sale.compareAtPrice, null);

  // legacy clients that only know the single `image` field keep working
  const legacy = await api.patch(`/products/${p.productId}`, { storeId: s, image: "/uploads/new.png" });
  assert.equal(legacy.image, "/uploads/new.png");
  assert.equal(legacy.images[0], "/uploads/new.png");

  // changing / clearing category
  const other = grocery.children[1];
  assert.equal((await api.patch(`/products/${p.productId}`, { storeId: s, categoryId: other.id })).categoryId, other.id);
  const cleared = await api.patch(`/products/${p.productId}`, { storeId: s, categoryId: "" });
  assert.equal(cleared.categoryId, null);
  assert.equal(cleared.parentCategoryId, null);

  // events carry the new fields to the aggregator
  const [ev] = await svc.db.$queryRawUnsafe<{ d: any }[]>(
    `SELECT "envelope"->'data' AS d FROM "OutboxMessage" WHERE "eventType"='ProductCreated' AND "consumer"='aggregator' AND "envelope"->'data'->>'productId' = $1`, p.productId);
  assert.equal(ev.d.categoryId, sub.id);
  assert.equal(ev.d.parentCategoryId, grocery.id);
  assert.equal(ev.d.compareAtPrice, 100);
  assert.equal(ev.d.brand, "Aarong");
});

test("a hidden category cannot be newly assigned, but an already-assigned product can still be edited", async () => {
  const s = store();
  const top = await api.post("/admin/categories", { nameEn: "Seasonal" });
  const p = await mk(s, { categoryId: top.id });
  await api.patch(`/admin/categories/${top.id}`, { active: false });
  await expectErr(mk(s, { categoryId: top.id }), "VALIDATION", 400);
  const edited = await api.patch(`/products/${p.productId}`, { storeId: s, stock: 9, categoryId: top.id });
  assert.equal(edited.stock, 9);
  assert.equal(edited.categoryId, top.id);
  await expectErr(api.delete(`/admin/categories/${top.id}`), "IN_USE", 409); // products still use it
});

// -------------------------------------------------------- admin work-list + counts
test("admin: uncategorised work-list, name search, and per-category product counts", async () => {
  const s = store();
  const tag = `unc${Math.random().toString(36).slice(2, 6)}`;
  const grocery = await topNamed("Grocery & Food");
  const sub = grocery.children[0];
  const a = await mk(s, { name: `${tag} Plain` });
  const b = await mk(s, { name: `${tag} Filed`, categoryId: sub.id });

  const open = (await api.get(`/admin/products?uncategorized=true&q=${tag}`)).products;
  assert.deepEqual(open.map((p: any) => p.productId), [a.productId], "only the uncategorised one");
  const all = (await api.get(`/admin/products?q=${tag}`)).products;
  assert.equal(all.length, 2);
  assert.ok(all.every((p: any) => p.storeId === s), "carries the store id the admin needs to file it");
  assert.equal((await api.get(`/admin/products?limit=1`)).products.length, 1);

  // the admin files it (PATCH needs the owning storeId, which the list provided)
  await api.patch(`/products/${a.productId}`, { storeId: s, categoryId: sub.id });
  assert.equal((await api.get(`/admin/products?uncategorized=true&q=${tag}`)).products.length, 0);

  const tree = (await api.get("/admin/categories")).categories;
  const g = tree.find((c: any) => c.id === grocery.id);
  const sc = g.children.find((c: any) => c.id === sub.id);
  assert.ok(sc.productCount >= 2, "sub-category counts its own products");
  assert.ok(g.productCount >= sc.productCount, "department counts everything beneath it");
  assert.equal((await api.get("/categories")).categories[0].productCount, undefined, "public tree has no counts");
  assert.ok(b);
});
