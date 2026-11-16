// End-to-end checkout smoke test: web app (USE_SERVICES=true) -> identity/catalog/order/ledger services.
// Seeds its own seller/store/product in the SERVICES' databases (never Neon). Safe to re-run.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-checkout.mjs
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const svc = { identity: 4001, catalog: 4002, order: 4003, ledger: 4005 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(name, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${svc[name]}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-service-name": "e2e" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
let passed = 0;
const ok = (label) => console.log(`  ok  ${label}`) || passed++;

const run = Date.now().toString(36);
const slug = `e2e-${run}`;

console.log("seeding services…");
const reg = await call("identity", "POST", "/auth/register", { email: `e2e-${run}@example.test`, name: "E2E Seller", password: "e2e-password-1", role: "SELLER", ip: "198.51.100.7" });
const store = await call("identity", "POST", "/stores", { latitude: 23.78, longitude: 90.41, ownerId: reg.user.id, name: `E2E Shop ${run}`, slug, template: "classic" });
let w;
for (let i = 0; i < 40; i++) { // the wallet is created by the StoreCreated event
  w = await call("ledger", "GET", `/wallets/${store.id}/status`);
  if (w.exists) break;
  await sleep(500);
}
assert.ok(w.exists, "wallet was created from the StoreCreated event");
await call("ledger", "POST", `/wallets/${store.id}/topup`, { amount: 1000, reference: `e2e-${run}`, method: "CASH" });
const product = await call("catalog", "POST", `/stores/${store.id}/products`, { name: `Widget ${run}`, description: "e2e", price: 250, stock: 5 });
const pid = product.productId ?? product.id;
assert.ok(pid, "product created");

console.log("checking the web tier…");
let res = await fetch(`${WEB}/store/${slug}`);
let html = await res.text();
assert.equal(res.status, 200); assert.match(html, new RegExp(`Widget ${run}`)); assert.match(html, new RegExp(`E2E Shop ${run}`));
ok("storefront renders store and product from the services");

res = await fetch(`${WEB}/store/does-not-exist-${run}`);
assert.equal(res.status, 404); ok("unknown store is a 404");

const order = (qty, extra = {}) => fetch(`${WEB}/api/orders/create`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
  body: JSON.stringify({ storeSlug: slug, buyerName: "Test Buyer", buyerPhone: `0171${Math.floor(1000000 + Math.random() * 8999999)}`, shippingAddress: "House 1, Road 2", shippingCity: "Dhaka", paymentMethod: "COD", items: [{ id: pid, quantity: qty }], ...extra }),
});

res = await order(2);
let j = await res.json();
assert.equal(res.status, 200, JSON.stringify(j)); assert.equal(j.success, true); assert.match(j.orderNumber, /^ORD-/);
assert.equal(j.redirectUrl, `/store/${slug}/order/${j.orderNumber}`);
ok(`COD order placed (${j.orderNumber})`);

res = await fetch(`${WEB}${j.redirectUrl}`); html = await res.text();
assert.equal(res.status, 200); assert.match(html, new RegExp(j.orderNumber)); assert.match(html, /Cash On Delivery/); assert.match(html, new RegExp(`Widget ${run}`));
ok("order confirmation page renders from order-service");

res = await fetch(`${WEB}/store/other-${run}/order/${j.orderNumber}`);
assert.equal(res.status, 404); ok("order does not show under another store's URL");

const p2 = await call("catalog", "GET", `/products/${pid}`);
assert.equal(p2.stock, 3); ok("stock went 5 -> 3");
const created = await call("order", "GET", `/orders/by-number/${j.orderNumber}`);
assert.equal(created.platformFee, 0); assert.equal(created.sellerNet, created.totalAmount); ok("no platform fee on a Cash on Delivery order (seller keeps the whole total)");
await sleep(1500);
const w2 = await call("ledger", "GET", `/wallets/${store.id}/status`);
assert.equal("holds" in w2, false); ok("nothing is held on the seller wallet");

res = await order(50);
j = await res.json();
assert.ok(res.status >= 400 && res.status < 500 && j.error, `oversell rejected: ${res.status} ${JSON.stringify(j)}`);
assert.equal((await call("catalog", "GET", `/products/${pid}`)).stock, 3); ok("overselling is rejected and stock is unchanged");

res = await fetch(`${WEB}/api/orders/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeSlug: slug, buyerName: "x", buyerPhone: "01711111111", shippingAddress: "x", items: [{ id: pid, quantity: -1 }] }) });
assert.equal(res.status, 400); ok("negative quantity is rejected");

console.log(`\n${passed} checks passed`);
