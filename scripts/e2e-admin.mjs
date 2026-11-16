// End-to-end admin back-office test against a web instance running with USE_SERVICES=true.
// Seeds only the services' databases (never Neon). Needs `docker` for one SQL step.
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-admin.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, catalog: 4002, payment: 4004, ledger: 4005 };
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
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");

/** Submit a server-action form; `has` picks the right form among many (e.g. the row of one user). */
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
async function user(label, role = "SELLER") {
  const r = await svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "admin-e2e-pass1", role: "SELLER", ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
  if (role !== "SELLER") await svc("identity", "PATCH", `/users/${r.user.id}/role`, { role, admin: "e2e" });
  return r;
}
const mkStore = async (u, slug) => {
  const s = await svc("identity", "POST", "/stores", { latitude: 23.78, longitude: 90.41, ownerId: u.user.id, name: `${slug} shop`, slug, template: "classic" });
  for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${s.id}/status`)).exists) break; await sleep(500); }
  return s;
};

console.log("seeding an admin, three sellers and a pending withdrawal…");
const adminU = await user("admin", "ADMIN");
const s1 = await user("seller1"), s2 = await user("seller2"), s3 = await user("seller3");
const st1 = await mkStore(s1, `adm1-${run}`), st2 = await mkStore(s2, `adm2-${run}`), st3 = await mkStore(s3, `adm3-${run}`);
await svc("catalog", "POST", `/stores/${st1.id}/products`, { name: `Thing ${run}`, price: 10, stock: 5 });
await svc("ledger", "POST", `/wallets/${st1.id}/topup`, { amount: 2000, reference: `adm-${run}`, method: "CASH" });
const pm = (await svc("ledger", "POST", `/wallets/${st1.id}/payout-methods`, { type: "BKASH", phoneNumber: "01712345678", accountType: "PERSONAL" })).method;
execFileSync("docker", ["exec", "cheapbazar-services-pg", "psql", "-U", "cheapbazar", "-d", "ledger_db", "-c", `UPDATE "PayoutMethod" SET "coolingUntil" = now() - interval '1 hour' WHERE id = '${pm.id}'`], { stdio: "ignore" });
const wd1 = (await svc("ledger", "POST", `/wallets/${st1.id}/withdrawals`, { payoutMethodId: pm.id, amount: 500 })).withdrawal;
const topup = (await svc("payment", "POST", "/topups/manual", { purpose: "WALLET_TOPUP", storeId: st1.id, userId: s1.user.id, amount: 300, method: "NAGAD", trxId: `NG${run}`.toUpperCase(), idempotencyKey: `adm-${run}-1` })).payment;
const topup2 = (await svc("payment", "POST", "/topups/manual", { purpose: "WALLET_TOPUP", storeId: st1.id, userId: s1.user.id, amount: 200, method: "BKASH", trxId: `BK${run}`.toUpperCase(), idempotencyKey: `adm-${run}-2` })).payment;

console.log("access control…");
cookie = `sf_session=${s1.token}`;
let r = await web("/admin"); assert.ok(r.status >= 300 && r.status < 400, `seller on /admin -> ${r.status}`); ok("a seller is redirected away from /admin");
r = await json("/api/admin/payouts", "GET"); assert.equal(r.status, 403); ok("a seller gets 403 from the payout API");
r = await web("/api/admin/payouts/export?format=bkash"); assert.equal(r.status, 403); ok("a seller gets 403 from the payout export");

cookie = `sf_session=${adminU.token}`;
let html = await (await web("/admin")).text();
assert.match(html, /Total Registered Stores/); ok("admin overview renders platform stats");

console.log("stores and KYC…");
html = await (await web("/admin/stores")).text();
assert.match(html, new RegExp(`adm1-${run} shop`)); assert.match(html, new RegExp(`seller1-${run}@example.test`)); ok("stores list shows stores and owners");
let res = await submit("/admin/stores", ["status"], `value="${st2.id}"`, { status: "SUSPENDED" });
assert.ok(!loc(res).includes("error"), loc(res));
html = await (await fetch(`${WEB}/store/adm2-${run}`)).text();
assert.match(html, /Store Suspended/); ok("suspending a store takes its storefront down");
res = await submit("/admin/stores", ["currentKyc"], `value="${st2.id}"`, {});
assert.ok(!loc(res).includes("error"));
const idn = await svc("identity", "GET", `/stores/${st2.id}`);
assert.equal((await svc("ledger", "GET", `/wallets/${st2.id}/status`)).status, "SUSPENDED"); ok("toggling KYC does not un-suspend the store");
res = await submit("/admin/stores", ["status"], `value="${st2.id}"`, { status: "ACTIVE" });
html = await (await fetch(`${WEB}/store/adm2-${run}`)).text(); assert.ok(!/Store Suspended/.test(html)); ok("reinstating brings the storefront back");
res = await submit("/admin/stores", ["status"], `value="${st3.id}"`, { status: "BANNED" });
res = await submit("/admin/stores", ["status"], `value="${st3.id}"`, { status: "ACTIVE" });
assert.match(loc(res), /permanent ban/i); ok("a permanent ban cannot be lifted (error is shown to the admin)");

console.log("users and roles…");
html = await (await web("/admin/users")).text();
assert.match(html, new RegExp(`seller3-${run}@example.test`)); ok("users list renders");
res = await submit("/admin/users", ["role"], `value="${s3.user.id}"`, { role: "BUYER" });
assert.ok(!loc(res).includes("error"));
assert.equal((await svc("identity", "GET", `/users/${s3.user.id}`)).role, "BUYER"); ok("admin changes a user's role");
const admins = (await svc("identity", "GET", "/users?role=ADMIN&limit=500")).users;
if (admins.length === 1) {
  res = await submit("/admin/users", ["role"], `value="${adminU.user.id}"`, { role: "SELLER" });
  assert.match(loc(res), /last remaining admin/i); ok("the last admin cannot be demoted");
}

console.log("payouts…");
html = await (await web("/admin/payouts")).text();
assert.match(html, new RegExp(wd1.withdrawalNumber)); ok("payout queue lists the pending withdrawal");
r = await web("/api/admin/payouts/export?format=bkash"); const csv = await r.text();
assert.equal(r.status, 200); assert.match(csv, /Wallet_Number/); assert.match(csv, new RegExp(wd1.withdrawalNumber)); assert.match(csv, /01712345678/); ok("bKash bulk CSV contains the withdrawal");
r = await json("/api/admin/payouts", "POST", { withdrawalId: wd1.id, action: "APPROVE" });
assert.equal(r.status, 400); ok("approving without a bank/bKash reference is refused");
r = await json("/api/admin/payouts", "POST", { withdrawalId: wd1.id, action: "APPROVE", disbursementTxId: `BKREF${run}` });
assert.equal(r.status, 200, await r.clone().text()); ok("approving with a reference completes the withdrawal");
r = await json("/api/admin/payouts", "POST", { withdrawalId: wd1.id, action: "REJECT", rejectionReason: "late" });
assert.ok(r.status >= 400 && r.status < 500); ok("an already-processed request cannot be processed again");
const wd2 = (await svc("ledger", "POST", `/wallets/${st1.id}/withdrawals`, { payoutMethodId: pm.id, amount: 600 })).withdrawal;
const before = (await svc("ledger", "GET", `/wallets/${st1.id}/status`)).balance;
r = await json("/api/admin/payouts", "POST", { withdrawalId: wd2.id, action: "REJECT", rejectionReason: "Account name mismatch" });
assert.equal(r.status, 200, await r.clone().text());
assert.equal((await svc("ledger", "GET", `/wallets/${st1.id}/status`)).balance, before + 600); ok("rejecting returns the money to the seller's wallet");

console.log("manual top-up review…");
html = await (await web("/admin/topups")).text();
assert.match(html, new RegExp(`NG${run}`.toUpperCase())); assert.match(html, /awaiting review/); ok("pending top-ups are listed with their transaction ids");
const bal0 = (await svc("ledger", "GET", `/wallets/${st1.id}/status`)).balance;
res = await submit("/admin/topups", ["note"], `value="${topup.id}"`, { decision: "APPROVE" });
assert.match(loc(res), /done=approved/);
let b; for (let i = 0; i < 40; i++) { b = (await svc("ledger", "GET", `/wallets/${st1.id}/status`)).balance; if (b === bal0 + 300) break; await sleep(500); }
assert.equal(b, bal0 + 300); ok("approving a top-up credits the seller's wallet (+৳300)");
res = await submit("/admin/topups", ["note"], `value="${topup2.id}"`, { decision: "REJECT", note: "" });
assert.match(loc(res), /error=/); ok("rejecting without a reason is refused");
res = await submit("/admin/topups", ["note"], `value="${topup2.id}"`, { decision: "REJECT", note: "TrxID not found in the account" });
assert.match(loc(res), /done=rejected/);
assert.equal((await svc("ledger", "GET", `/wallets/${st1.id}/status`)).balance, bal0 + 300); ok("a rejected top-up credits nothing");

console.log(`\n${passed} checks passed`);
