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
