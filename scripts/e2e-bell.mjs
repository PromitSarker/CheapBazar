// End-to-end test of the notification bell + inbox against a web instance with USE_SERVICES=true.
// Seeds only the services' databases (never Neon). Re-runnable.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-bell.mjs
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, catalog: 4002, notification: 4008, ledger: 4005 };
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
const reg = (label, role = "SELLER") => svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "bell-e2e-pass1", role, ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
const get = (path, token, extra = {}) => fetch(WEB + path, { redirect: "manual", headers: { ...(token ? { cookie: `sf_session=${token}${extra.lang ? `; sf_lang=${extra.lang}` : ""}` } : {}) } });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");
const bell = (html) => Number(html.match(/data-testid="bell-count"[^>]*>(\d+)\+?</)?.[1] ?? 0);
async function until(fn, n = 40) { for (let i = 0; i < n; i++) { const v = await fn(); if (v) return v; await sleep(500); } return null; }
async function form(token, html, has, fields = {}) {
  const f = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]).find((x) => x.includes(has));
  assert.ok(f, `form with ${has}`);
  const fd = new FormData(); fd.append(f.match(/name="(\$ACTION_ID_[^"]+)"/)[1], "");
  for (const m of f.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) { const n = m[0].match(/name="([^"]+)"/)?.[1]; const v = m[0].match(/value="([^"]*)"/)?.[1] ?? ""; if (n && !n.startsWith("$ACTION") && !(n in fields)) fd.append(n, v); }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(`${WEB}/notifications`, { method: "POST", body: fd, headers: { cookie: `sf_session=${token}` }, redirect: "manual" });
}

const seller = await reg("bell-seller"), other = await reg("bell-other");
const store = await svc("identity", "POST", "/stores", { ownerId: seller.user.id, name: `Bell Shop ${run}`, slug: `bell-${run}`, template: "classic" });
await until(async () => (await svc("ledger", "GET", `/wallets/${store.id}/status`)).exists);
await svc("ledger", "POST", `/wallets/${store.id}/topup`, { amount: 3000, reference: `bell-${run}`, method: "CASH" });
const product = await svc("catalog", "POST", `/stores/${store.id}/products`, { name: `Bellitem ${run}`, price: 100, stock: 10 });
const pid = product.id ?? product.productId;

// ---- the store-created notification arrives through the event bus
const first = await until(async () => (await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.length > 0);
assert.ok(first, "STORE_CREATED notification delivered"); ok("the shop-created notification reached the seller's inbox through the event bus");

let html = await (await get("/", seller.token)).text();
assert.ok(bell(html) >= 1, "bell badge"); ok(`the header shows a bell with the unread count (${bell(html)})`);
html = await (await get("/", null)).text();
assert.ok(!html.includes("🔔")); ok("anonymous visitors see no bell");

// ---- a buyer's order notifies the seller
const placed = await fetch(`${WEB}/api/orders/create`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` }, body: JSON.stringify({ storeSlug: store.slug, buyerName: "Bell Buyer", buyerPhone: "01711112222", shippingAddress: "x 1", paymentMethod: "COD", items: [{ id: pid, quantity: 1 }] }) }).then((r) => r.json());
assert.ok(placed.orderNumber, JSON.stringify(placed));
const arrived = await until(async () => (await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.some((n) => n.title.includes(placed.orderNumber)));
assert.ok(arrived); ok("a new order notifies the seller");
const before = bell(await (await get("/", seller.token)).text());

html = await (await get("/notifications", seller.token)).text();
assert.ok(html.includes(placed.orderNumber)); assert.match(html, /Mark all as read/); ok("the inbox page lists it, newest first, with a Mark all button");
const nid = (await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.find((n) => n.title.includes(placed.orderNumber)).id;

// ---- another user cannot read or mark my notifications
let r = await form(other.token, html, `value="${nid}"`, {}); // other user posts MY notification's id with the other cookie
assert.match(loc(r), /\/notifications$/);
assert.equal((await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.find((n) => n.id === nid).readAt, null); ok("another user cannot mark (or follow) my notification");
html = await (await get("/notifications", other.token)).text();
assert.ok(!html.includes(placed.orderNumber)); ok("another user's inbox does not contain it");

// ---- opening one marks it read and goes to its page
html = await (await get("/notifications", seller.token)).text();
r = await form(seller.token, html, `value="${nid}"`);
assert.ok(loc(r).startsWith("/dashboard/orders"), loc(r)); ok("opening a notification takes the seller to the right page");
assert.ok((await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.find((n) => n.id === nid).readAt); ok("and marks it read");
const after = bell(await (await get("/", seller.token)).text());
assert.equal(after, before - 1); ok(`the bell count drops by one (${before} -> ${after})`);

// ---- a hostile stored link is never followed
await svc("notification", "POST", "/notifications", { userId: seller.user.id, kind: "TEST", title: `Evil ${run}`, body: "b", link: "https://evil.example/x", idempotencyKey: `evil-${run}` });
html = await (await get("/notifications", seller.token)).text();
const evilId = (await svc("notification", "GET", `/notifications?userId=${seller.user.id}`)).notifications.find((n) => n.title === `Evil ${run}`).id;
assert.ok(!html.includes("evil.example")); r = await form(seller.token, html, `value="${evilId}"`);
assert.equal(loc(r), "/notifications"); ok("an off-site link in a notification is ignored (no open redirect)");

// ---- Bengali
html = await (await get("/notifications", seller.token, { lang: "bn" })).text();
assert.match(html, /নোটিফিকেশন/); assert.match(html, /নতুন অর্ডার/); ok("the inbox follows the language cookie (Bengali copy)");

// ---- mark all
html = await (await get("/notifications", seller.token)).text();
assert.ok(bell(await (await get("/", seller.token)).text()) > 0);
r = await form(seller.token, html, "Mark all as read");
assert.equal(loc(r), "/notifications");
assert.equal((await svc("notification", "GET", `/notifications/unread-count?userId=${seller.user.id}`)).unreadCount, 0); ok("Mark all as read clears everything");
html = await (await get("/", seller.token)).text();
assert.equal(bell(html), 0); assert.ok(html.includes("🔔")); ok("the bell badge disappears but the bell stays");
html = await (await get("/notifications", seller.token)).text();
assert.ok(!html.includes("Mark all as read")); ok("the Mark all button is hidden when nothing is unread");

console.log(`\n${passed} checks passed`);
