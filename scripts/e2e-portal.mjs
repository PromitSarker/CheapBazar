// End-to-end seller-portal test against a web instance running with USE_SERVICES=true.
// Drives the real forms (server actions) over HTTP like a browser without JavaScript.
// Seeds only the services' databases (never Neon).
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-portal.mjs
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { ledger: 4005, catalog: 4002 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (l) => (console.log(`  ok  ${l}`), passed++);

async function svc(name, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port[name]}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-service-name": "e2e" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}

let cookie = "";
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
function keepCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    cookie = cookie.split("; ").filter((x) => x && !x.startsWith(k + "=")).concat(v ? [`${k}=${v}`] : []).join("; ");
  }
}
const get = async (path) => {
  const res = await fetch(WEB + path, { headers: { cookie }, redirect: "manual" });
  keepCookies(res);
  return { res, html: await res.text() };
};
/** Submit a server-action form the way a browser would (multipart + $ACTION_ID_ field). */
async function submit(pagePath, match, fields, files = {}) {
  const { html } = await get(pagePath);
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => match.every((n) => (n.startsWith("!") ? !f.includes(`name="${n.slice(1)}"`) : f.includes(`name="${n}"`))));
  assert.ok(form, `form with fields [${match}] on ${pagePath}`);
  const id = form.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(id, `server action id in form on ${pagePath}`);
  const fd = new FormData();
  fd.append(id[1], "");
  // keep hidden defaults (e.g. product id) that the form already carries
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = m[0].match(/name="([^"]+)"/)?.[1];
    const v = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (n && !n.startsWith("$ACTION") && !(n in fields)) fd.append(n, v);
  }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, f] of Object.entries(files)) fd.append(k, new Blob([f.bytes], { type: f.type }), f.name);
  const res = await fetch(WEB + pagePath, { method: "POST", body: fd, headers: { cookie, "x-forwarded-for": ip }, redirect: "manual" });
  keepCookies(res);
  return res;
}
const loc = (res) => res.headers.get("location") || "";

const run = Date.now().toString(36);
const email = `portal-${run}@example.test`;
const slug = `portal-${run}`;
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

console.log("signup, onboarding, dashboard…");
let res = await submit("/signup", ["email", "name", "password"], { email, name: "Portal Seller", password: "portal-pass-1", role: "SELLER" });
assert.ok([302, 303, 307].includes(res.status) && loc(res).includes("/onboarding"), `signup -> ${res.status} ${loc(res)}`);
assert.match(cookie, /sf_session=/); ok("signup creates the account and starts a session (httpOnly cookie)");

res = await submit("/signup", ["email", "name", "password"], { email, name: "Dup", password: "portal-pass-1", role: "SELLER" });
assert.ok(loc(res).includes("error=taken")); ok("duplicate email is refused");

res = await submit("/onboarding", ["name", "slug"], { name: `Portal Shop ${run}`, slug, template: "modern", latitude: "23.78", longitude: "90.41", district: "dhaka", address: "Road 1" });
assert.ok(loc(res).includes("/dashboard"), `onboarding -> ${res.status} ${loc(res)}`); ok("onboarding creates the store");

let page = await get("/dashboard");
assert.equal(page.res.status, 200); assert.match(page.html, new RegExp(`Portal Shop ${run}`)); ok("dashboard shows the store (store lookup via identity)");

// the seller needs wallet funds to take COD orders
let storeId, w;
const storefront = await fetch(`${WEB}/store/${slug}`); assert.equal(storefront.status, 200);
for (let i = 0; i < 40; i++) {
  const r = await fetch(`http://127.0.0.1:4001/tenants/resolve?slug=${slug}`, { headers: { authorization: `Bearer ${SECRET}` } });
  storeId = (await r.json()).id; if (storeId) break; await sleep(250);
}
for (let i = 0; i < 40; i++) { w = await svc("ledger", "GET", `/wallets/${storeId}/status`); if (w.exists) break; await sleep(500); }
await svc("ledger", "POST", `/wallets/${storeId}/topup`, { amount: 1000, reference: `portal-${run}`, method: "CASH" });

console.log("products…");
res = await submit("/dashboard/products", ["name", "price", "stock"], { name: `Cake ${run}`, description: "d", price: "300", stock: "4" }, { image: { name: "cake.png", type: "image/png", bytes: png } });
assert.ok(!loc(res).includes("error"), `add product -> ${res.status} ${loc(res)}`);
page = await get("/dashboard/products");
assert.match(page.html, new RegExp(`Cake ${run}`)); ok("product with a real PNG is added and listed");

const evil = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
res = await submit("/dashboard/products", ["name", "price", "stock"], { name: `Evil ${run}`, description: "d", price: "10", stock: "1" }, { image: { name: "x.png", type: "image/png", bytes: evil } });
assert.ok(loc(res).includes("error=image")); page = await get("/dashboard/products");
assert.ok(!page.html.includes(`Evil ${run}`)); ok("an SVG disguised as .png is rejected and nothing is stored");

const prods = await svc("catalog", "GET", `/stores/${storeId}/products`);
const prod = prods.products.find((p) => p.name === `Cake ${run}`);
assert.ok(prod, "product exists in catalog-service"); assert.ok(prod.image?.endsWith(".png"), "stored extension comes from the bytes"); ok("catalog-service holds the product with a byte-derived .png name");

// ---- an order, then the seller works it
const order = await fetch(`${WEB}/api/orders/create`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ storeSlug: slug, buyerName: "Buyer B", buyerPhone: "01712345678", shippingAddress: "Road 5", paymentMethod: "COD", items: [{ id: prod.productId, quantity: 2 }] }) });
const oj = await order.json(); assert.equal(order.status, 200, JSON.stringify(oj));
page = await get("/dashboard/orders");
assert.match(page.html, new RegExp(oj.orderNumber)); assert.match(page.html, /Buyer B/); ok(`seller sees the order (${oj.orderNumber}) in /dashboard/orders`);

const orders = await (await fetch(`http://127.0.0.1:4003/stores/${storeId}/orders`, { headers: { authorization: `Bearer ${SECRET}` } })).json();
const rawId = orders.orders.find((o) => o.orderNumber === oj.orderNumber).id;
const setStatus = (newStatus, c = cookie) => fetch(`${WEB}/api/orders/status`, { method: "POST", headers: { "content-type": "application/json", cookie: c }, body: JSON.stringify({ orderId: rawId, newStatus }) });

let r = await setStatus("DELIVERED"); assert.equal(r.status, 409); ok("cannot jump CONFIRMED -> DELIVERED (state machine)");
r = await setStatus("SHIPPED"); let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.newStatus, "SHIPPED"); ok("seller marks the order SHIPPED");
r = await setStatus("DELIVERED"); j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); ok("seller marks the order DELIVERED");

await sleep(1500);
const w2 = await svc("ledger", "GET", `/wallets/${storeId}/status`);
assert.equal(w2.balance, 1000); ok("delivery moves no money: no COD fee, the wallet is still ৳1000");

r = await fetch(`${WEB}/api/orders/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: rawId, newStatus: "CANCELLED" }), redirect: "manual" });
assert.ok(r.status !== 200, `no cookie must not work, got ${r.status}`); ok("changing a status without a session is refused");

console.log("stock, delete, login/logout…");
res = await submit("/dashboard/products", ["delta"], { delta: "5" });
assert.ok(!loc(res).includes("error"), `adjust -> ${res.status} ${loc(res)}`);
assert.equal((await svc("catalog", "GET", `/products/${prod.productId}`)).stock, 7); ok("stock adjustment reaches catalog-service (2 + 5 = 7)");

res = await submit("/dashboard/products", ["id", "!delta"], {});
assert.ok(loc(res).includes("error=in-use"), `delete used product -> ${res.status} ${loc(res)}`);
assert.ok((await svc("catalog", "GET", `/products/${prod.productId}`)).productId); ok("a product that has orders cannot be deleted (history kept)");

// log out, then wrong and right passwords
// a new browser has no cookie
cookie = "";
let anon = await get("/dashboard");
assert.ok([302, 303, 307].includes(anon.res.status) && (anon.res.headers.get("location") || "").includes("/login")); ok("without a session /dashboard sends you to /login");

res = await submit("/login", ["email", "password"], { email, password: "wrong-password" });
assert.ok(loc(res).includes("error=bad-credentials")); ok("wrong password is refused");
res = await submit("/login", ["email", "password"], { email, password: "portal-pass-1" });
assert.ok(loc(res).includes("/dashboard"), `login -> ${res.status} ${loc(res)}`);
assert.match(cookie, /sf_session=/);
page = await get("/dashboard"); assert.equal(page.res.status, 200); ok("login with the right password opens the dashboard");

console.log(`\n${passed} checks passed`);
