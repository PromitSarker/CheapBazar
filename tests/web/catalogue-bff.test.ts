import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { categoryChoices, existingProductNames, getSellerProduct, updateProductViaServices } from "../../src/lib/bff/catalogue";
import { createProductViaServices } from "../../src/lib/bff/portal";

function start(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() }));
  });
}
const json = (res: http.ServerResponse, body: unknown, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
const body = (req: http.IncomingMessage) => new Promise<any>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b ? JSON.parse(b) : {})); });

test("seller catalogue calls: ownership, readable errors, duplicate-name guard, category list", async () => {
  const calls: { method: string; url: string; body: any }[] = [];
  const cat = await start(async (req, res) => {
    const b = await body(req);
    calls.push({ method: req.method!, url: req.url!, body: b });
    if (req.url === "/categories") return json(res, { categories: [{ id: "food", slug: "food", nameEn: "Food", nameBn: "খাবার", children: [{ id: "fruit", slug: "fruit", nameEn: "Fruit", nameBn: "ফল", children: [] }] }] });
    if (req.url === "/products/mine") return json(res, { productId: "mine", storeId: "s1", name: "Apple", description: "", price: "80", compareAtPrice: "100", stock: 5, images: ["/uploads/a.png"], categoryId: "fruit", brand: "Orchard", unit: "1 kg", channel: "RETAIL", moq: 1, wholesalePrice: null, tiers: [] });
    if (req.url === "/products/theirs") return json(res, { productId: "theirs", storeId: "OTHER", name: "Secret", price: 1, stock: 1 });
    if (req.url === "/products/gone") return json(res, { error: "Product not found", code: "NOT_FOUND" }, 404);
    if (req.url === "/products/bad" && req.method === "PATCH") return json(res, { error: "The original (crossed-out) price must be higher than the selling price.", code: "VALIDATION" }, 400);
    if (req.url === "/products/down" && req.method === "PATCH") return json(res, { error: "boom" }, 500);
    if (req.url === "/products/ok" && req.method === "PATCH") return json(res, { productId: "ok" });
    if (req.url === "/stores/s1/products" && req.method === "GET") return json(res, { products: [{ name: "Red Apple" }, { name: "  Rice  " }] });
    if (req.url === "/stores/s1/products" && req.method === "POST") return b.name === "Bad" ? json(res, { error: "price must be a positive amount", code: "VALIDATION" }, 400) : json(res, { productId: "new" });
    json(res, {}, 404);
  });
  process.env.INTERNAL_AUTH_SECRET = "s";
  process.env.SERVICE_URL_CATALOG = cat.url;

  const tree = await categoryChoices();
  assert.deepEqual(tree.map((c) => [c.id, c.nameBn, c.children.map((s) => s.id)]), [["food", "খাবার", ["fruit"]]]);

  const mine = await getSellerProduct("s1", "mine");
  assert.equal(mine!.price, 80);
  assert.equal(mine!.compareAtPrice, 100);
  assert.deepEqual(mine!.images, ["/uploads/a.png"]);
  assert.equal(mine!.categoryId, "fruit");
  assert.equal(await getSellerProduct("s1", "theirs"), null, "another shop's product is invisible");
  assert.equal(await getSellerProduct("s1", "gone"), null);

  const bad = await updateProductViaServices("s1", "bad", { price: 1 });
  assert.deepEqual(bad, { ok: false, error: "The original (crossed-out) price must be higher than the selling price." });
  const down = await updateProductViaServices("s1", "down", {});
  assert.equal(down.ok, false);
  assert.match((down as any).error, /unavailable/, "5xx is never shown raw");
  const ok = await updateProductViaServices("s1", "ok", { name: "x" });
  assert.deepEqual(ok, { ok: true });
  assert.equal(calls.filter((c) => c.method === "PATCH").at(-1)!.body.storeId, "s1", "the shop id is always sent by the server, not the form");

  assert.deepEqual([...(await existingProductNames("s1"))].sort(), ["red apple", "rice"]);

  assert.deepEqual(await createProductViaServices("s1", { name: "Good", price: 5 }), { ok: true });
  assert.deepEqual(await createProductViaServices("s1", { name: "Bad", price: -1 }), { ok: false, error: "price must be a positive amount" });
  cat.close();
});

test("categoryChoices returns [] (not an exception) when the catalog is down", async () => {
  process.env.INTERNAL_AUTH_SECRET = "s";
  process.env.SERVICE_URL_CATALOG = "http://127.0.0.1:9"; // nothing listens here
  assert.deepEqual(await categoryChoices(), []);
});
