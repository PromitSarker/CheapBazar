// End-to-end test of the buyer "My orders" page and self-service cancel, against a web instance
// running with USE_SERVICES=true. Seeds only the services' databases (never Neon). Re-runnable.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-myorders.mjs
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, catalog: 4002, order: 4003, ledger: 4005 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (l) => (console.log(`  ok  ${l}`), passed++);
async function svc(name, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port[name]}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-service-name": "e2e" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
const run = Date.now().toString(36);
const reg = (label, role = "SELLER") => svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "myorders-e2e-1", role, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
const get = (path, token) => fetch(WEB + path, { redirect: "manual", headers: token ? { cookie: `sf_session=${token}` } : {} });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");
async function cancelForm(token, fromToken, orderId) {
  // read the real server-action id from the page the buyer sees, then post it (possibly with ANOTHER user's cookie)
  const html = await (await get("/orders", fromToken)).text();
  const form = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(`value="${orderId}"`));
  assert.ok(form, "cancel form present");
  const id = form.match(/name="(\$ACTION_ID_[^"]+)"/)[1];
  const fd = new FormData(); fd.append(id, ""); fd.append("id", orderId);
  return fetch(`${WEB}/orders`, { method: "POST", body: fd, headers: { cookie: `sf_session=${token}` }, redirect: "manual" });
}
const place = (token, qty, extra = {}) => fetch(`${WEB}/api/orders/create`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`, ...(token ? { cookie: `sf_session=${token}` } : {}) },
  body: JSON.stringify({ storeSlug: slug, buyerName: "Mo Buyer", buyerPhone: `0171${Math.floor(1000000 + Math.random() * 8999999)}`, shippingAddress: "House 1", shippingCity: "Dhaka", paymentMethod: "COD", items: [{ id: pid, quantity: qty }], ...extra }),
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));

const seller = await reg("mo-seller");
const store = await svc("identity", "POST", "/stores", { ownerId: seller.user.id, name: `MO Shop ${run}`, slug: `mo-${run}`, template: "classic" });
const slug = store.slug;
for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${store.id}/status`)).exists) break; await sleep(500); }
await svc("ledger", "POST", `/wallets/${store.id}/topup`, { amount: 5000, reference: `mo-${run}`, method: "CASH" });
const product = await svc("catalog", "POST", `/stores/${store.id}/products`, { name: `Gadget ${run}`, price: 100, stock: 20 });
const pid = product.id ?? product.productId;
const b1 = await reg("mo-buyer1", "BUYER"), b2 = await reg("mo-buyer2", "BUYER");
const stock = async () => (await svc("catalog", "GET", `/products/${pid}`)).stock;

let r = await get("/orders");
assert.ok(r.status >= 300 && r.status < 400 && loc(r).includes("/login"), `anonymous -> ${r.status} ${loc(r)}`); ok("anonymous visitors are sent to log in");
let html = await (await get("/orders", b1.token)).text();
assert.match(html, /not placed any orders/); ok("a new buyer sees the empty state");
html = await (await get("/", b1.token)).text();
assert.match(html, /href="\/orders"[^>]*>My orders/); ok("the header shows a My orders link to logged-in users");

const guest = await place(null, 1);
assert.equal(guest.status, 200, JSON.stringify(guest));
const o1 = await place(b1.token, 2), o2 = await place(b1.token, 1);
assert.equal(o1.status, 200, JSON.stringify(o1)); assert.equal(o2.status, 200);
assert.equal(await stock(), 16); ok("three orders placed (one as guest, two as buyer 1); stock 20 -> 16");

html = await (await get("/orders", b1.token)).text();
assert.ok(html.includes(o1.orderNumber) && html.includes(o2.orderNumber)); ok("buyer 1 sees both of their orders");
assert.ok(!html.includes(guest.orderNumber)); ok("the guest order is not listed");
assert.match(html, new RegExp(`2(<!-- -->)? × (<!-- -->)?Gadget ${run}`)); assert.match(html, new RegExp(`MO Shop ${run}`)); assert.match(html, /Cash on Delivery/); ok("items, store and payment method are shown");
assert.ok(html.indexOf(o2.orderNumber) < html.indexOf(o1.orderNumber)); ok("newest first");
html = await (await get("/orders", b2.token)).text();
assert.ok(!html.includes(o1.orderNumber)); ok("another buyer does not see them");

const ord1 = await svc("order", "GET", `/orders/by-number/${o1.orderNumber}`);
const ord2 = await svc("order", "GET", `/orders/by-number/${o2.orderNumber}`);
assert.equal(ord1.buyerId, b1.user.id);

// buyer 2 forges the cancel of buyer 1's order
r = await cancelForm(b2.token, b1.token, ord1.id);
assert.match(loc(r), /error=/);
assert.equal((await svc("order", "GET", `/orders/by-number/${o1.orderNumber}`)).status, "CONFIRMED"); ok("another user cannot cancel your order, even with a forged request");

// the real buyer cancels: stock returns, fee hold is released
const holdsBefore = (await svc("ledger", "GET", `/wallets/${store.id}/status`)).holds;
r = await cancelForm(b1.token, b1.token, ord1.id);
assert.match(loc(r), /cancelled=1/);
assert.equal((await svc("order", "GET", `/orders/by-number/${o1.orderNumber}`)).status, "CANCELLED"); ok("the buyer cancels their own order");
for (let i = 0; i < 30 && (await stock()) !== 18; i++) await sleep(500);
assert.equal(await stock(), 18); ok("stock is returned to the shop (16 -> 18)");
let holds = holdsBefore;
for (let i = 0; i < 30 && holds === holdsBefore; i++) { await sleep(500); holds = (await svc("ledger", "GET", `/wallets/${store.id}/status`)).holds; }
assert.ok(holds < holdsBefore); ok("the seller's COD fee hold is released");
html = await (await get("/orders", b1.token)).text();
assert.match(html, /Cancelled/); assert.match(html, /Your order was cancelled|<strong style/); ok("the list shows it as cancelled with no cancel button left for it");
assert.ok(!html.includes(`value="${ord1.id}"`));

// once the seller ships it, the buyer can no longer cancel
await svc("order", "PATCH", `/orders/${ord2.id}/status`, { to: "SHIPPED", source: "SELLER", actor: seller.user.id, storeId: store.id, trackingNumber: "TRK123", courier: "Pathao" });
html = await (await get("/orders", b1.token)).text();
assert.ok(!html.includes(`value="${ord2.id}"`)); assert.match(html, /TRK123/); assert.match(html, /Shipped/); ok("a shipped order shows tracking and offers no cancel button");
// forge a cancel anyway (reuse a valid form's action id)
const fd = new FormData();
const anyForm = await (async () => { await place(b1.token, 1); const h = await (await get("/orders", b1.token)).text(); return [...h.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes("name=\"id\"")); })();
fd.append(anyForm.match(/name="(\$ACTION_ID_[^"]+)"/)[1], ""); fd.append("id", ord2.id);
r = await fetch(`${WEB}/orders`, { method: "POST", body: fd, headers: { cookie: `sf_session=${b1.token}` }, redirect: "manual" });
assert.match(loc(r), /error=/, `status=${r.status} loc=${loc(r)} order=${(await svc("order", "GET", `/orders/by-number/${o2.orderNumber}`)).status}`);
assert.equal((await svc("order", "GET", `/orders/by-number/${o2.orderNumber}`)).status, "SHIPPED"); ok("a forged cancel of a shipped order is refused");

console.log(`\n${passed} checks passed`);
