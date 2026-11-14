// End-to-end seller wallet / payouts / overview / settings test against a web instance
// running with USE_SERVICES=true. Seeds only the services' databases (never Neon).
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-wallet.mjs
// (needs `docker` for one step: it back-dates the payout cooling-off in the throwaway ledger DB)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, catalog: 4002, order: 4003, payment: 4004, ledger: 4005 };
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
let cookie = "";
const web = (path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie, "content-type": "application/json", ...(init.headers || {}) } });
const json = (path, method, body) => web(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const loc = (r) => r.headers.get("location") || "";

async function submit(pagePath, match, fields) {
  const html = await (await web(pagePath)).text();
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => match.every((n) => f.includes(`name="${n}"`)));
  assert.ok(form, `form [${match}] on ${pagePath}`);
  const id = form.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  assert.ok(id, "server action id");
  const fd = new FormData();
  fd.append(id, "");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fetch(WEB + pagePath, { method: "POST", body: fd, headers: { cookie }, redirect: "manual" });
}

const run = Date.now().toString(36);
console.log("seeding a seller and store in the services…");
const reg = await svc("identity", "POST", "/auth/register", { email: `wallet-${run}@example.test`, name: "Wallet Seller", password: "wallet-pass-1", role: "SELLER", ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
cookie = `sf_session=${reg.token}`;
const store = await svc("identity", "POST", "/stores", { ownerId: reg.user.id, name: `Wallet Shop ${run}`, slug: `wallet-${run}`, template: "classic" });
const other = await svc("identity", "POST", "/auth/register", { email: `wallet2-${run}@example.test`, name: "Other", password: "wallet-pass-2", role: "SELLER", ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
await svc("identity", "POST", "/stores", { ownerId: other.user.id, name: `Other Shop ${run}`, slug: `other-${run}`, template: "classic" });
for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${store.id}/status`)).exists) break; await sleep(500); }
await svc("catalog", "POST", `/stores/${store.id}/products`, { name: `Low ${run}`, price: 10, stock: 3 });
await svc("catalog", "POST", `/stores/${store.id}/products`, { name: `Plenty ${run}`, price: 10, stock: 20 });

console.log("overview and wallet pages…");
let r = await web("/dashboard"); let html = await r.text();
assert.equal(r.status, 200); assert.match(html, new RegExp(`wallet-${run}`)); ok("overview renders for a services-backed store");
r = await web("/dashboard/wallet"); assert.equal(r.status, 200); ok("wallet page renders from ledger-service");

console.log("manual top-up…");
r = await json("/api/wallet/topup", "POST", { amount: 5, method: "BKASH", trxId: `TRX${run}` });
assert.equal(r.status, 400); ok("a top-up below the minimum is refused");
r = await json("/api/wallet/topup", "POST", { amount: 1000, method: "BKASH", trxId: `TRX${run}` });
let j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); ok("seller submits a bKash top-up with its transaction id");
r = await json("/api/wallet/topup", "POST", { amount: 1000, method: "BKASH", trxId: `TRX${run}` });
assert.equal(r.status, 200); const again = await r.json();
let pend = await svc("payment", "GET", `/admin/manual-payments?storeId=${store.id}`);
assert.equal(pend.payments.length, 1, "double submit must not create a second payment"); ok("submitting the same transaction twice creates only one payment");
assert.equal(pend.payments[0].status, "PENDING");
assert.equal((await svc("ledger", "GET", `/wallets/${store.id}/status`)).balance, 0); ok("the wallet is not credited before an admin approves");
await svc("payment", "PATCH", `/admin/manual-payments/${pend.payments[0].id}/review`, { decision: "APPROVE", admin: "e2e-admin" });
let w; for (let i = 0; i < 40; i++) { w = await svc("ledger", "GET", `/wallets/${store.id}/status`); if (w.balance === 1000) break; await sleep(500); }
assert.equal(w.balance, 1000); ok("after admin approval the ledger credits ৳1000");

console.log("payout methods and withdrawals…");
r = await json("/api/wallet/payout-methods", "POST", { type: "BKASH", phoneNumber: "12345" });
assert.equal(r.status, 400); ok("an invalid mobile number is refused");
r = await json("/api/wallet/payout-methods", "POST", { type: "BKASH", phoneNumber: "01712345678", accountType: "PERSONAL" });
j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); const mid = j.method.id; ok("seller adds a bKash payout account");
r = await json("/api/wallet/withdraw", "POST", { payoutMethodId: mid, amount: 500 });
j = await r.json(); assert.equal(r.status, 403, JSON.stringify(j)); assert.match(j.error, /locked/i); ok("a new payout account is locked for 24 hours (anti-hijack cooling-off)");

execFileSync("docker", ["exec", "cheapbazar-services-pg", "psql", "-U", "cheapbazar", "-d", "ledger_db", "-c", `UPDATE "PayoutMethod" SET "coolingUntil" = now() - interval '1 hour' WHERE id = '${mid}'`], { stdio: "ignore" });
r = await json("/api/wallet/withdraw", "POST", { payoutMethodId: mid, amount: 100 });
assert.equal(r.status, 400); ok("below the minimum withdrawal is refused");
r = await json("/api/wallet/withdraw", "POST", { payoutMethodId: mid, amount: 1100 });
assert.ok(r.status >= 400 && r.status < 500); ok("withdrawing more than the wallet holds is refused");
r = await json("/api/wallet/withdraw", "POST", { payoutMethodId: mid, amount: 500 });
j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.match(j.withdrawalNumber, /^WD-/); ok(`withdrawal of ৳500 requested (${j.withdrawalNumber})`);
r = await json("/api/wallet/withdraw", "POST", { payoutMethodId: mid, amount: 500 });
assert.ok(r.status >= 400 && r.status < 500); ok("a second request while one is pending is refused");
r = await json("/api/wallet/withdraw", "GET"); j = await r.json();
assert.equal(r.status, 200); assert.equal(j.withdrawals.length, 1); assert.equal(j.withdrawableBalance, 500); ok("summary shows one request; the other ৳500 is still withdrawable (no reserve bond)");
html = await (await web("/dashboard/wallet")).text();
assert.match(html, /WD-/); ok("wallet page lists the withdrawal");
r = await json(`/api/wallet/payout-methods?id=${mid}`, "DELETE");
assert.ok(r.status >= 400 && r.status < 500); ok("a payout account with a pending withdrawal cannot be removed");

console.log("settings and online payments…");
let res = await submit("/dashboard/settings", ["name", "slug", "customDomain"], { name: `Renamed ${run}`, slug: `wallet-${run}`, template: "modern", customDomain: "" });
assert.ok(loc(res).includes("success=1"), `settings -> ${res.status} ${loc(res)}`);
html = await (await fetch(`${WEB}/store/wallet-${run}`)).text();
assert.match(html, new RegExp(`Renamed ${run}`)); ok("renaming the store updates the public storefront");
res = await submit("/dashboard/settings", ["name", "slug", "customDomain"], { name: `Renamed ${run}`, slug: `other-${run}`, template: "modern", customDomain: "" });
assert.ok(loc(res).includes("error=slug-taken")); ok("taking another store's URL is refused");
res = await submit("/dashboard/settings", ["name", "slug", "customDomain"], { name: `Renamed ${run}`, slug: `wallet-${run}`, template: "modern", customDomain: `shop-${run}.example.test` });
assert.ok(loc(res).includes("success=1"));
html = await (await fetch(`${WEB}/store/shop-${run}.example.test`)).text();
assert.match(html, new RegExp(`Renamed ${run}`)); ok("a custom domain resolves to the storefront");

r = await json("/api/payments/sslcommerz/init", "POST", { purpose: "WALLET_TOPUP", storeId: store.id, amount: 100 });
assert.equal(r.status, 400); ok("online (SSLCommerz) top-up stays switched off");
cookie = "";
r = await json("/api/wallet/withdraw", "GET");
assert.ok(r.status !== 200); ok("without a session the wallet API is closed");

console.log(`\n${passed} checks passed`);
