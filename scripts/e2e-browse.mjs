// End-to-end buyer-side test against a web instance running with USE_SERVICES=true:
// marketplace search, the wholesale paywall, Buyer Pro upgrade + admin approval, wholesale orders,
// marketplace ads, landing page. Seeds only the services' databases (never Neon). Needs `docker`.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-browse.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, catalog: 4002, order: 4003, payment: 4004, ledger: 4005, ad: 4006, aggregator: 4007 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// React inserts <!-- --> between adjacent text nodes in server HTML; drop them so text can be matched.
const _text = Response.prototype.text;
Response.prototype.text = async function () { return (await _text.call(this)).replace(/<!-- -->/g, ""); };
let passed = 0;
const ok = (l) => (console.log(`  ok  ${l}`), passed++);
const psql = (db, sql) => execFileSync("docker", ["exec", "cheapbazar-services-pg", "psql", "-U", "cheapbazar", "-d", db, "-c", sql], { stdio: "ignore" });

async function svc(name, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port[name]}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-service-name": "e2e" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`);
  return j;
}
let cookie = "";
const web = (path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie, ...(init.headers || {}) } });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");
const post = (path, body, ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`) =>
  web(path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

async function submit(pagePath, match, has, fields) {
  const html = await (await web(pagePath)).text();
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => match.every((n) => f.includes(`name="${n}"`)) && (!has || f.includes(has)));
  assert.ok(form, `form [${match}] ${has ?? ""} on ${pagePath}`);
  const id = form.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  assert.ok(id, "server action id");
  const fd = new FormData();
  fd.append(id, "");
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = m[0].match(/name="([^"]+)"/)?.[1]; const v = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (n && !n.startsWith("$ACTION") && !(n in fields)) fd.append(n, v);
  }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(WEB + pagePath, { method: "POST", body: fd, headers: { cookie }, redirect: "manual" });
}

const run = Date.now().toString(36);
const rnd = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
async function user(label, role = "SELLER", regRole = "SELLER") {
  const r = await svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "browse-e2e-pass1", role: regRole, ip: rnd() });
  if (role !== regRole) await svc("identity", "PATCH", `/users/${r.user.id}/role`, { role, admin: "e2e" });
  return r;
}
async function shop(u, slug) {
  const s = await svc("identity", "POST", "/stores", { latitude: 23.78, longitude: 90.41, ownerId: u.user.id, name: `${slug} shop`, slug, template: "classic" });
  for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${s.id}/status`)).exists) break; await sleep(500); }
  return s;
}
async function indexed(tab, q, expect) {
  for (let i = 0; i < 60; i++) {
    const r = await svc("aggregator", "GET", `/aggregator/${tab}/search?q=${encodeURIComponent(q)}`);
    if (r.total >= expect) return r;
    await sleep(500);
  }
  throw new Error(`aggregator never indexed ${q}`);
}

// remove leftovers of earlier runs that would hold the browse ad slot
psql("ads_db", `DELETE FROM "AdBooking" WHERE "headline" LIKE 'Browse Promo %'`);
await svc("ad", "POST", "/admin/ads/tick", {});

console.log("seeding two sellers, a buyer, a second buyer, an admin and an advertiser…");
const adminU = await user("brwadmin", "ADMIN"), s1 = await user("brwseller1"), s2 = await user("brwseller2");
const buyer = await user("brwbuyer", "BUYER", "BUYER"), payer = await user("brwpayer", "BUYER", "BUYER");
const A = await shop(s1, `brw1-${run}`), B = await shop(s2, `brw2-${run}`);
await svc("ledger", "POST", `/wallets/${A.id}/topup`, { amount: 5000, reference: `brw-${run}`, method: "CASH" });
const word = `Basmati${run}`;

console.log("seller lists a wholesale product through the form…");
cookie = `sf_session=${s1.token}`;
let res = await submit("/dashboard/products", ["name", "price", "stock"], null, { name: `${word} Rice`, description: "premium", price: "100", stock: "200", channel: "BOTH", wholesalePrice: "70", moq: "5", tierQty: "20", tierPrice: "60" });
assert.ok(!loc(res).includes("error"), loc(res));
res = await submit("/dashboard/products", ["name", "price", "stock"], null, { name: `${word} Lentils`, description: "retail only", price: "50", stock: "30", channel: "RETAIL" });
assert.ok(!loc(res).includes("error"));
res = await submit("/dashboard/products", ["name", "price", "stock"], null, { name: `${word} Bad`, description: "x", price: "10", stock: "5", channel: "BOTH", wholesalePrice: "70", moq: "5", tierQty: "3", tierPrice: "60" });
assert.match(loc(res), /error=wholesale/); ok("a wholesale product with a tier below its minimum order is refused with a clear error");
await svc("catalog", "POST", `/stores/${B.id}/products`, { name: `${word} Flour`, price: 40, stock: 10 });
ok("seller lists wholesale and retail products (via the form and the API)");

await indexed("retail", word, 3);
await indexed("wholesale", word, 1);

console.log("marketplace, anonymous visitor…");
cookie = "";
let html = await (await web(`/browse?q=${word}`)).text();
assert.match(html, new RegExp(`${word} Rice`)); assert.match(html, new RegExp(`${word} Flour`)); assert.match(html, /৳100\.00/); ok("retail tab lists products from several stores with prices");
assert.match(html, new RegExp(`brw1-${run} shop`)); ok("store filter is offered");
html = await (await web(`/browse?q=${word}&store=${A.id}`)).text();
assert.match(html, new RegExp(`${word} Rice`)); assert.ok(!html.includes(`${word} Flour`)); ok("filtering by store narrows the results");
html = await (await web(`/browse?tab=wholesale&q=${word}`)).text();
assert.match(html, /Buyer Pro members/); assert.match(html, /Log in/); ok("wholesale tab shows the paywall and asks anonymous visitors to log in");
assert.ok(!/৳70\.00/.test(html) && !/Minimum order: 5/.test(html) && !/৳60\.00/.test(html)); ok("no wholesale price, minimum or tier appears anywhere in the page for a locked viewer");
html = await (await web(`/browse?tab=wholesale&q=${word}&sort=price_asc`)).text();
assert.ok(!/৳70\.00/.test(html)); ok("sorting by price cannot be used to peek at hidden prices");
html = await (await web("/")).text();
assert.match(html, /href="\/browse"/); assert.match(html, /class="card store-card[^"]*" href="\/store\//); ok("home page lists stores from the aggregator and the header links to the marketplace"); // the card order depends on how many test stores exist, so any store card will do

console.log("buyer without Buyer Pro…");
cookie = `sf_session=${buyer.token}`;
html = await (await web(`/browse?tab=wholesale&q=${word}`)).text();
assert.match(html, /Upgrade to Buyer Pro/); assert.ok(!/৳70\.00/.test(html)); ok("a logged-in buyer without Pro sees the upgrade prompt, still no prices");
res = await post("/api/orders/create", { storeSlug: `brw1-${run}`, orderType: "WHOLESALE", paymentMethod: "COD", buyerName: "B", buyerPhone: "01711111111", shippingAddress: "Road 1", items: [{ id: "x", quantity: 5 }] });
assert.ok(res.status >= 400 && res.status < 500); ok("a wholesale order without Buyer Pro is refused");

console.log("Buyer Pro upgrade…");
cookie = `sf_session=${payer.token}`;
html = await (await web("/pro")).text();
assert.match(html, /Not subscribed/); assert.match(html, /৳499/); ok("the upgrade page shows the plan price and status");
res = await submit("/pro", ["method", "trxId"], null, { method: "BKASH", trxId: "ab" });
assert.match(loc(res), /error=/); ok("a malformed transaction id is refused");
const trx = `PRO${run}`.toUpperCase();
res = await submit("/pro", ["method", "trxId"], null, { method: "BKASH", trxId: trx });
assert.match(loc(res), /sent=1/, loc(res));
html = await (await web("/pro")).text(); assert.match(html, /awaiting confirmation/i); ok("payment submitted; the page shows it awaiting confirmation");
const pend = (await svc("payment", "GET", `/admin/manual-payments?userId=${payer.user.id}`)).payments;
assert.equal(pend.length, 1); assert.equal(pend[0].purpose, "SUBSCRIPTION");
assert.equal((await svc("payment", "GET", `/subscriptions/buyer/${payer.user.id}/status`)).active, false); ok("no access is granted before an admin approves");

cookie = `sf_session=${adminU.token}`;
html = await (await web("/admin/topups")).text();
assert.match(html, new RegExp(`brwpayer-${run}@example.test`)); assert.match(html, /Buyer Pro/); ok("the admin sees the buyer's payment, labelled Buyer Pro");
res = await submit("/admin/topups", ["note"], `value="${pend[0].id}"`, { decision: "APPROVE" });
assert.match(loc(res), /done=approved/);
let st; for (let i = 0; i < 40; i++) { st = await svc("payment", "GET", `/subscriptions/buyer/${payer.user.id}/status`); if (st.active) break; await sleep(500); }
assert.equal(st.active, true); ok("approval activates Buyer Pro");

console.log("Buyer Pro member…");
cookie = `sf_session=${payer.token}`;
html = await (await web("/pro")).text(); assert.match(html, /ACTIVE/);
html = await (await web(`/browse?tab=wholesale&q=${word}`)).text();
assert.match(html, /৳70\.00/); assert.match(html, /Minimum order: 5/); assert.match(html, /20\+ units: ৳60\.00/); assert.match(html, /Order wholesale/); assert.ok(!/Buyer Pro members<\/h3>/.test(html));
ok("wholesale price, minimum order, volume tier and order button are visible to a member");
const prod = (await svc("catalog", "GET", `/stores/${A.id}/products?channel=WHOLESALE`)).products.find((p) => p.name === `${word} Rice`);
const wholesaleOrder = (qty) => post("/api/orders/create", { storeSlug: `brw1-${run}`, orderType: "WHOLESALE", paymentMethod: "COD", buyerName: "Pro Buyer", buyerPhone: "01722222222", shippingAddress: "Warehouse 4", items: [{ id: prod.productId, quantity: qty }] });
res = await wholesaleOrder(3); let j = await res.json();
assert.ok(res.status >= 400 && res.status < 500); assert.match(j.error, /minimum/i); ok("ordering below the minimum quantity is refused");
res = await wholesaleOrder(20); j = await res.json();
assert.equal(res.status, 200, JSON.stringify(j));
const order = await svc("order", "GET", `/orders/by-number/${j.orderNumber}`);
assert.equal(order.orderType, "WHOLESALE"); assert.equal(order.totalAmount, 1200); assert.equal(order.buyerId, payer.user.id); ok("20 units at the volume-tier price: total ৳1200 (20 x ৳60), recorded as a wholesale order for the member");

console.log("marketplace ad…");
const slotBooked = await svc("ad", "POST", "/ads/bookings", {
  slot: "BROWSE_TOP", storeId: A.id, ownerId: s1.user.id, headline: `Browse Promo ${run}`, imageUrl: "/uploads/abcdefgh12.png", targetUrl: `/store/brw1-${run}`,
  startDate: new Date(Date.now() + 6 * 3600_000 + 86_400_000).toISOString().slice(0, 10), endDate: new Date(Date.now() + 6 * 3600_000 + 3 * 86_400_000).toISOString().slice(0, 10),
});
await svc("ad", "PATCH", `/admin/ads/${slotBooked.booking.id}/review`, { decision: "APPROVE", admin: "e2e" });
psql("ads_db", `UPDATE "AdBooking" SET "startDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date, "endDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date + 2 WHERE id = '${slotBooked.booking.id}'`);
await svc("ad", "POST", "/admin/ads/tick", {});
html = ""; for (let i = 0; i < 20; i++) { html = await (await web(`/browse?q=${word}`)).text(); if (html.includes(`Browse Promo ${run}`)) break; await sleep(500); }
assert.match(html, new RegExp(`Browse Promo ${run}`)); ok("a live BROWSE_TOP ad is shown above the results");

console.log("home page hero ad…");
await svc("ledger", "POST", `/wallets/${A.id}/topup`, { amount: 5000, reference: `hero-${run}`, method: "CASH" });
const tomorrow = new Date(Date.now() + 6 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
const hero = await svc("ad", "POST", "/ads/bookings", {
  slot: "HOME_HERO", storeId: A.id, ownerId: s1.user.id, headline: `Hero Promo ${run}`, imageUrl: "/uploads/abcdefgh12.png", targetUrl: `/store/brw1-${run}`,
  startDate: tomorrow, endDate: tomorrow,
});
html = await (await web("/")).text();
assert.ok(!html.includes(`Hero Promo ${run}`)); ok("a pending HOME_HERO booking is not shown on the home page");
await svc("ad", "PATCH", `/admin/ads/${hero.booking.id}/review`, { decision: "APPROVE", admin: "e2e" });
psql("ads_db", `UPDATE "AdBooking" SET "startDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date, "endDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date WHERE id = '${hero.booking.id}'`);
await svc("ad", "POST", "/admin/ads/tick", {});
html = ""; for (let i = 0; i < 20; i++) { html = await (await web("/")).text(); if (html.includes(`Hero Promo ${run}`)) break; await sleep(500); }
assert.match(html, new RegExp(`Hero Promo ${run}`)); assert.match(html, /Sponsored/); assert.match(html, /rel="sponsored/); ok("an approved, live HOME_HERO ad is shown on the home page, labelled Sponsored");
assert.ok(html.indexOf(`Hero Promo ${run}`) < html.indexOf('id="explore"')); ok("it appears above the sample-store section");

console.log(`\n${passed} checks passed`);
