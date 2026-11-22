import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { router } from "../../src/lib/mobile/routes";
import { resetCategoryCache } from "../../src/lib/bff/catalog";

function start(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() }));
  });
}
const json = (res: http.ServerResponse, body: unknown, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
const get = (path: string, headers: Record<string, string> = {}) => router.handle(new Request(`http://app.test/api/m/v1${path}`, { headers }), path.split("?")[0]);
const item = (id: string, extra: any = {}) => ({ productId: id, name: `Item ${id}`, description: "", image: null, store: { id: "s1", slug: "shop", name: "Shop" }, inStock: true, price: 10, ...extra });

const tree = [{ id: "food", parentId: null, slug: "food", nameEn: "Grocery & Food", nameBn: "মুদি ও খাবার", icon: "x", sortOrder: 1, active: true,
  children: [{ id: "fruit", parentId: "food", slug: "fruit", nameEn: "Fruits", nameBn: "ফল", icon: "x", sortOrder: 1, active: true, children: [] }] }];

test("mobile API: suggestions combine product names with matching categories; short input is empty", async () => {
  const agg = await start((req, res) => {
    const u = new URL(req.url!, "http://x");
    if (u.pathname === "/aggregator/suggest") return json(res, { suggestions: [`${u.searchParams.get("q")} juice`] });
    json(res, { items: [], facets: { stores: [], categories: [] } });
  });
  const cat = await start((_req, res) => json(res, { categories: tree }));
  process.env.INTERNAL_AUTH_SECRET = "s"; process.env.SERVICE_URL_AGGREGATOR = agg.url; process.env.SERVICE_URL_CATALOG = cat.url;
  resetCategoryCache();

  const r = await (await get("/search/suggest?q=fru")).json();
  assert.deepEqual(r.suggestions, ["fru juice"]);
  assert.deepEqual(r.categories.map((c: any) => c.id), ["fruit"], "matches the category by name");
  const bn = await (await get(`/search/suggest?q=${encodeURIComponent("ফল")}`)).json();
  assert.deepEqual(bn.categories.map((c: any) => c.id), ["fruit"], "and by its Bangla name");
  assert.deepEqual(await (await get("/search/suggest?q=f")).json(), { suggestions: [], categories: [] });
  agg.close(); cat.close();
});

test("mobile API: product page returns the item, excludes itself from similar, and passes through a 404", async () => {
  const seen: string[] = [];
  const agg = await start((req, res) => {
    const u = new URL(req.url!, "http://x");
    seen.push(u.pathname + u.search);
    if (u.pathname === "/aggregator/products/p1") return json(res, { tab: "retail", item: item("p1", { categoryId: "fruit" }), paywall: null });
    if (u.pathname === "/aggregator/products/p2") return json(res, { tab: "wholesale", item: item("p2", { locked: true }), paywall: { locked: true, reason: "LOGIN_REQUIRED" } });
    if (u.pathname.startsWith("/aggregator/products/")) return json(res, { error: "Product not found", code: "NOT_FOUND" }, 404);
    if (u.pathname === "/aggregator/retail/search") return json(res, { items: [item("p1"), item("p3"), item("p4")], facets: { stores: [] } });
    json(res, {});
  });
  process.env.INTERNAL_AUTH_SECRET = "s"; process.env.SERVICE_URL_AGGREGATOR = agg.url;

  const ok = await (await get("/products/p1")).json();
  assert.equal(ok.item.productId, "p1");
  assert.deepEqual(ok.similar.map((i: any) => i.productId), ["p3", "p4"], "the product itself is not 'similar'");
  assert.ok(seen.some((s) => s.includes("categoryId=fruit")), "similar = same category");

  const locked = await (await get("/products/p2")).json();
  assert.equal(locked.tab, "wholesale");
  assert.deepEqual(locked.similar, [], "no similar row for wholesale items");
  assert.equal(locked.paywall.locked, true);

  const missing = await get("/products/nope");
  assert.equal(missing.status, 404);
  agg.close();
});

// ------------------------------------------------------------ location range

const post = (path: string, body: unknown) =>
  router.handle(new Request(`http://app.test/api/m/v1${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), path);

test("mobile API: /location/config lists the 64 districts and the admin's range", async () => {
  const agg = await start((req, res) => {
    if (new URL(req.url!, "http://x").pathname === "/settings/location") return json(res, { enabled: true, radiusKm: 30, updatedAt: null, updatedBy: null });
    json(res, {});
  });
  process.env.INTERNAL_AUTH_SECRET = "s"; process.env.SERVICE_URL_AGGREGATOR = agg.url;
  const r = await (await get("/location/config")).json();
  assert.equal(r.districts.length, 64);
  assert.ok(r.districts.every((d: any) => d.nameEn && d.nameBn && typeof d.lat === "number"));
  agg.close();
});

test("mobile API: the buyer's position is passed to the aggregator only when it is a real point in Bangladesh", async () => {
  const seen: string[] = [];
  const agg = await start((req, res) => {
    const u = new URL(req.url!, "http://x");
    seen.push(u.pathname + u.search);
    if (u.pathname === "/aggregator/retail/search")
      return json(res, { items: [], total: 0, page: 1, pages: 1, limit: 20, paywall: null, facets: { stores: [] }, location: { enabled: true, radiusKm: 30, required: false, applied: true } });
    json(res, {});
  });
  process.env.INTERNAL_AUTH_SECRET = "s"; process.env.SERVICE_URL_AGGREGATOR = agg.url; process.env.SERVICE_URL_AD = agg.url;
  const r = await (await get("/browse?q=rice&lat=23.81&lng=90.41")).json();
  assert.equal(r.location.applied, true, "the range info reaches the app");
  assert.ok(seen.some((s) => s.startsWith("/aggregator/retail/search") && s.includes("lat=23.81") && s.includes("lng=90.41")));
  seen.length = 0;
  await get("/browse?q=rice&lat=0&lng=0");   // not in Bangladesh
  await get("/browse?q=rice&lat=abc&lng=90"); // junk
  assert.ok(seen.filter((s) => s.startsWith("/aggregator/retail/search")).every((s) => !s.includes("lat=")), "bad coordinates are dropped, not forwarded");
  agg.close();
});

test("mobile API: a shop outside the buyer's range is 403 on its page and cannot be ordered from; an outage never blocks", async () => {
  const idn = await start((_req, res) => json(res, { id: "st1", name: "Far Shop", slug: "far", template: "classic", ownerId: "o1" }));
  const led = await start((_req, res) => json(res, { status: "ACTIVE" }));
  const cat = await start((_req, res) => json(res, { products: [] }));
  let visible: any = { found: true, visible: false, reason: "OUT_OF_RANGE", enabled: true, radiusKm: 30, distanceKm: 215, district: "chattogram" };
  let aggDown = false;
  const agg = await start((req, res) => {
    const u = new URL(req.url!, "http://x");
    if (aggDown) { res.destroy(); return; }
    if (u.pathname === "/aggregator/stores/far/visibility") return json(res, visible);
    json(res, {});
  });
  Object.assign(process.env, { INTERNAL_AUTH_SECRET: "s", SERVICE_URL_IDENTITY: idn.url, SERVICE_URL_LEDGER: led.url, SERVICE_URL_CATALOG: cat.url, SERVICE_URL_AGGREGATOR: agg.url, SERVICE_URL_AD: agg.url });

  const blocked = await get("/stores/far?lat=23.81&lng=90.41");
  assert.equal(blocked.status, 403);
  const body = await blocked.json();
  assert.equal(body.code, "OUT_OF_RANGE");
  assert.match(body.error, /outside your area/);

  const order = { storeSlug: "far", buyer: { name: "A", phone: "01712345678" }, shipping: { address: "Road 1", city: "Dhaka" }, items: [{ productId: "p1", quantity: 1 }], location: { lat: 23.81, lng: 90.41 } };
  const ordered = await post("/orders", order);
  assert.equal(ordered.status, 403, "checkout re-checks the range, so an old bag cannot bypass it");

  visible = { found: true, visible: false, reason: "LOCATION_REQUIRED", enabled: true, radiusKm: 30, distanceKm: null, district: null };
  assert.equal((await (await get("/stores/far")).json()).code, "LOCATION_REQUIRED");

  visible = { found: true, visible: true, reason: null, enabled: true, radiusKm: 30, distanceKm: 3, district: "dhaka" };
  assert.equal((await get("/stores/far?lat=23.81&lng=90.41")).status, 200);

  aggDown = true; // the aggregator cannot answer: the page still works
  assert.equal((await get("/stores/far?lat=23.81&lng=90.41")).status, 200);
  for (const s of [idn, led, cat, agg]) s.close();
});

test("mobile API: /ads/config is off by default, and exposes only valid banner ids when switched on", async () => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith("ADMOB_")) delete process.env[k];
  const off = await (await get("/ads/config")).json();
  assert.deepEqual(off, { admob: { enabled: false, testUnits: false, banners: { home: null, browse: null, product: null } } });

  process.env.ADMOB_ENABLED = "true";
  process.env.ADMOB_BANNER_HOME = "ca-app-pub-1234567890123456/1234567890";
  process.env.ADMOB_BANNER_BROWSE = "<script>";
  const on = await (await get("/ads/config")).json();
  assert.equal(on.admob.enabled, true);
  assert.equal(on.admob.banners.home, "ca-app-pub-1234567890123456/1234567890");
  assert.equal(on.admob.banners.browse, null);
  for (const k of Object.keys(process.env)) if (k.startsWith("ADMOB_")) delete process.env[k];
  Object.assign(process.env, saved);
});
