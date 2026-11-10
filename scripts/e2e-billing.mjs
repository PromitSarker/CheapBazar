// End-to-end test of the admin "Pricing & Revenue" screen against a web instance with USE_SERVICES=true.
// Seeds only the services' databases (never Neon). Re-runnable (random users), restores prices it changes.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-billing.mjs
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, payment: 4004, ledger: 4005, ad: 4006 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (l) => (console.log(`  ok  ${l}`), passed++);
async function svc(name, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port[name]}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-service-name": "e2e" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${name} ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`), { status: res.status });
  return j;
}
let cookie = "";
const web = (path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie, ...(init.headers || {}) } });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");
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
const reg = (label) => svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "billing-e2e-pass1", role: "SELLER", ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
const platform = async (code) => (await svc("ledger", "GET", "/admin/platform-accounts")).accounts.find((a) => a.code === code)?.net ?? 0;

const adm = await reg("billadmin"); await svc("identity", "PATCH", `/users/${adm.user.id}/role`, { role: "ADMIN", admin: "e2e" });
const buyer = await reg("billbuyer"); await svc("identity", "PATCH", `/users/${buyer.user.id}/role`, { role: "BUYER", admin: "e2e" });
const seller = await reg("billseller");
const origPlan = (await svc("payment", "GET", "/admin/plans")).plans.find((p) => p.code === "BUYER_PRO");
const origSlot = (await svc("ad", "GET", "/admin/ads/slots")).slots.find((s) => s.code === "BROWSE_TOP");

console.log("access control…");
cookie = `sf_session=${seller.token}`;
let r = await web("/admin/billing"); assert.ok(r.status >= 300 && r.status < 400, `seller -> ${r.status}`); ok("a seller is redirected away from /admin/billing");
cookie = `sf_session=${adm.token}`;
let html = await (await web("/admin/billing")).text();
assert.match(html, /Pricing &amp; Revenue/); assert.match(html, /Buyer Pro revenue/); assert.match(html, /Platform books/); ok("admin sees the screen: revenue, books, plan, slots");
assert.match(html, /BROWSE_TOP/); assert.match(html, /name="periodDays"/); ok("plan form and per-slot forms are present");

console.log("prices…");
let res = await submit("/admin/billing", ["periodDays"], null, { price: "-5", periodDays: "30", graceDays: "3" });
assert.match(loc(res), /error=/); assert.equal(Number((await svc("payment", "GET", "/admin/plans")).plans.find((p) => p.code === "BUYER_PRO").price), Number(origPlan.price)); ok("a negative price is refused and nothing changes");
res = await submit("/admin/billing", ["periodDays"], null, { price: "650", periodDays: "30", graceDays: "5" });
assert.match(loc(res), /done=/);
const np = (await svc("payment", "GET", "/admin/plans")).plans.find((p) => p.code === "BUYER_PRO");
assert.equal(Number(np.price), 650); assert.equal(np.graceDays, 5); ok("saving the plan updates price and grace days in payment-billing");
const bp = await (await fetch(`${WEB}/pro`, { headers: { cookie: `sf_session=${buyer.token}` } })).text();
assert.match(bp, /650/); ok("the buyer's /pro page shows the new price");
res = await submit("/admin/billing", ["pricePerDay"], 'value="BROWSE_TOP"', { pricePerDay: "0", capacity: "2" });
assert.match(loc(res), /error=/); ok("a zero ad price is refused");
res = await submit("/admin/billing", ["pricePerDay"], 'value="BROWSE_TOP"', { pricePerDay: "950", capacity: "3", active: "on" });
assert.match(loc(res), /done=/);
const ns = (await svc("ad", "GET", "/admin/ads/slots")).slots.find((s) => s.code === "BROWSE_TOP");
assert.equal(Number(ns.pricePerDay), 950); assert.equal(ns.capacity, 3); assert.equal(ns.active, true); ok("saving a slot updates its price and capacity in ad-service");

console.log("revenue and revoke…");
const rev0 = await platform("PLATFORM_SUBSCRIPTION_REVENUE");
const trx = `BK${run}`.toUpperCase();
const { payment } = await svc("payment", "POST", "/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", trxId: trx, userId: buyer.user.id, idempotencyKey: `bill-${run}` });
await svc("payment", "PATCH", `/admin/manual-payments/${payment.id}/review`, { decision: "APPROVE", admin: "e2e" });
for (let i = 0; i < 30 && (await platform("PLATFORM_SUBSCRIPTION_REVENUE")) - rev0 !== 650; i++) await sleep(500);
assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")) - rev0, 650);
html = await (await web("/admin/billing")).text();
assert.match(html, new RegExp(`billbuyer ${run}`)); assert.match(html, new RegExp(trx)); ok("the approved payment and the active subscription are listed with the buyer's name");
assert.equal((await svc("payment", "GET", `/subscriptions/buyer/${buyer.user.id}/status`)).active, true);

res = await submit("/admin/billing", ["reason"], `value="${payment.id}"`, { reason: "" });
assert.match(loc(res), /error=/); ok("revoking without a reason is refused");
res = await submit("/admin/billing", ["reason"], `value="${payment.id}"`, { reason: "trx id not in the bKash statement" });
assert.match(loc(res), /done=/);
for (let i = 0; i < 30 && (await platform("PLATFORM_SUBSCRIPTION_REVENUE")) - rev0 !== 0; i++) await sleep(500);
assert.equal((await platform("PLATFORM_SUBSCRIPTION_REVENUE")) - rev0, 0); ok("revoking reverses the platform revenue in the ledger");
assert.equal((await svc("payment", "GET", `/subscriptions/buyer/${buyer.user.id}/status`)).active, false); ok("the buyer's Pro access ends");
const man = (await svc("payment", "GET", `/admin/manual-payments?userId=${buyer.user.id}`)).payments.find((p) => p.id === payment.id);
assert.equal(man.status, "REVOKED"); ok("the payment is marked REVOKED");
try { await svc("payment", "POST", "/subscriptions/subscribe", { plan: "BUYER_PRO", method: "MANUAL", transferMethod: "BKASH", trxId: trx, userId: (await reg("billbuyer2")).user.id, idempotencyKey: `bill2-${run}` }); assert.fail("reuse should fail"); }
catch (e) { assert.ok(e.status >= 400 && e.status < 500, e.message); } ok("the revoked transaction id cannot be submitted again");
html = await (await web("/admin/billing")).text();
assert.ok(!new RegExp(`value="${payment.id}"`).test(html)); ok("a revoked payment disappears from the approved list");

// put the prices back
await svc("payment", "POST", "/admin/plans", { code: "BUYER_PRO", price: Number(origPlan.price), periodDays: origPlan.periodDays, graceDays: origPlan.graceDays });
await svc("ad", "POST", "/admin/ads/slots", { code: "BROWSE_TOP", name: origSlot.name, placement: origSlot.placement, capacity: origSlot.capacity, pricePerDay: Number(origSlot.pricePerDay), active: origSlot.active });
console.log(`\n${passed} checks passed`);
