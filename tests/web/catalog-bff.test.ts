import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { withCounts, categoriesWithCounts, homeShelves, resetCategoryCache, type CategoryNode } from "../../src/lib/bff/catalog";

const node = (id: string, parentId: string | null, nameEn: string, children: CategoryNode[] = []): CategoryNode => ({
  id, parentId, slug: id, nameEn, nameBn: `${nameEn}-bn`, icon: "category", sortOrder: 0, active: true, children,
});
const tree = [
  node("food", null, "Food", [node("fruit", "food", "Fruit"), node("veg", "food", "Veg")]),
  node("fashion", null, "Fashion", [node("men", "fashion", "Men")]),
  node("empty", null, "Empty"),
];

function start(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() }));
  });
}

test("withCounts: sub-categories count themselves, a department counts everything beneath it", () => {
  const out = withCounts(tree, [
    { categoryId: "fruit", parentCategoryId: "food", count: 3 },
    { categoryId: "veg", parentCategoryId: "food", count: 2 },
    { categoryId: "food", parentCategoryId: null, count: 1 }, // product filed directly under the department
  ]);
  const food = out.find((c) => c.id === "food")!;
  assert.equal(food.count, 6);
  assert.deepEqual(food.children.map((c) => [c.id, c.count]), [["fruit", 3], ["veg", 2]]);
  assert.equal(out.find((c) => c.id === "fashion")!.count, 0);
  assert.equal(out.find((c) => c.id === "empty")!.count, 0);
  assert.ok(!("active" in food) && !("sortOrder" in food), "internal admin fields are not exposed");
});

test("categoriesWithCounts caches, survives an outage with the last good copy, and returns [] when never loaded", async () => {
  let catalogHits = 0, down = false;
  const catalog = await start((req, res) => {
    catalogHits++;
    if (down) { res.statusCode = 500; return res.end("{}"); }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ categories: tree }));
  });
  const agg = await start((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ items: [], facets: { stores: [], categories: [{ categoryId: "fruit", parentCategoryId: "food", count: 4 }], brands: [] } }));
  });
  process.env.INTERNAL_AUTH_SECRET = "s";
  process.env.SERVICE_URL_CATALOG = catalog.url;
  process.env.SERVICE_URL_AGGREGATOR = agg.url;

  resetCategoryCache();
  down = true;
  assert.deepEqual(await categoriesWithCounts(), [], "never loaded + outage = empty, not an exception");
  down = false;
  const first = await categoriesWithCounts();
  assert.equal(first.find((c) => c.id === "food")!.count, 4);
  const hits = catalogHits;
  await categoriesWithCounts();
  assert.equal(catalogHits, hits, "second call is served from the cache");
  catalog.close(); agg.close();
});

test("homeShelves: deals + new + busiest departments, empty shelves dropped, one failing shelf does not break the rest", async () => {
  const seen: string[] = [];
  const agg = await start((req, res) => {
    const u = new URL(req.url!, "http://x");
    seen.push(u.search);
    res.setHeader("content-type", "application/json");
    if (u.searchParams.get("categoryId") === "fashion") { res.statusCode = 500; return res.end("{}"); }
    const onSale = u.searchParams.get("onSale") === "true";
    const cat = u.searchParams.get("categoryId");
    const items = onSale ? [] : [{ productId: `p-${cat ?? "all"}`, name: "x", description: "", image: null, store: { id: "s", slug: "s", name: "S" }, inStock: true, price: 10 }];
    res.end(JSON.stringify({ items, total: items.length, facets: { stores: [] } }));
  });
  process.env.INTERNAL_AUTH_SECRET = "s";
  process.env.SERVICE_URL_AGGREGATOR = agg.url;
  const cats = withCounts(tree, [
    { categoryId: "fruit", parentCategoryId: "food", count: 5 },
    { categoryId: "men", parentCategoryId: "fashion", count: 2 },
  ]);
  const shelves = await homeShelves(cats, "viewer-1");
  agg.close();
  assert.deepEqual(shelves.map((s) => s.key), ["new", "cat:food"], "no deals (empty) and fashion failed -> both dropped");
  assert.deepEqual(shelves[1].title, { en: "Food", bn: "Food-bn" });
  assert.equal(shelves[1].categoryId, "food");
  assert.ok(seen.some((q) => q.includes("onSale=true") && q.includes("sort=discount")));
  assert.ok(seen.every((q) => q.includes("viewerId=viewer-1")), "viewer is forwarded for the paywall decision");
});
