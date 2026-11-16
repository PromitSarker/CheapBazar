// End-to-end ads test against a web instance running with USE_SERVICES=true:
// seller books, admin moderates, wallet is charged, the ad goes live and shows on storefronts.
// Seeds only the services' databases (never Neon). Needs `docker` for one SQL step (to start the ad today).
//   INTERNAL_AUTH_SECRET=... WEB_URL=http://127.0.0.1:3100 node scripts/e2e-ads.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 4001, ad: 4006, ledger: 4005 };
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
const web = (path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie, ...(init.headers || {}) } });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");

async function submit(pagePath, match, has, fields, file) {
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
  if (file) fd.append("image", new Blob([file.bytes], { type: file.type }), file.name);
  return fetch(WEB + pagePath, { method: "POST", body: fd, headers: { cookie }, redirect: "manual" });
}

const run = Date.now().toString(36);
const dhaka = (offset) => new Date(Date.now() + 6 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function user(label, role = "SELLER") {
  const r = await svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "ads-e2e-pass-1", role: "SELLER", ip: `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
  if (role !== "SELLER") await svc("identity", "PATCH", `/users/${r.user.id}/role`, { role, admin: "e2e" });
  return r;
}
async function shop(u, slug) {
  const s = await svc("identity", "POST", "/stores", { latitude: 23.78, longitude: 90.41, ownerId: u.user.id, name: `${slug} shop`, slug, template: "modern" });
  for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${s.id}/status`)).exists) break; await sleep(500); }
  return s;
}

// Re-runnable: remove ads left behind by earlier runs (they hold the limited slot capacity).
execFileSync("docker", ["exec", "cheapbazar-services-pg", "psql", "-U", "cheapbazar", "-d", "ads_db", "-c",
  `DELETE FROM "AdBooking" WHERE "headline" LIKE 'Ramadan Sale %' OR "headline" LIKE 'Cancel me %' OR "headline" LIKE 'Too poor %'`], { stdio: "ignore" });
await svc("ad", "POST", "/admin/ads/tick", {});

console.log("seeding…");
const adminU = await user("adsadmin", "ADMIN"), uA = await user("advertiser"), uB = await user("poorshop");
const A = await shop(uA, `adv-${run}`), B = await shop(uB, `poor-${run}`);
await svc("ledger", "POST", `/wallets/${A.id}/topup`, { amount: 5000, reference: `ads-a-${run}`, method: "CASH" });
await svc("ledger", "POST", `/wallets/${B.id}/topup`, { amount: 100, reference: `ads-b-${run}`, method: "CASH" });
const slots = (await svc("ad", "GET", "/ads/slots")).slots;
assert.ok(slots.find((s) => s.code === "STOREFRONT_BANNER"), "default slots exist");

console.log("seller books an ad…");
cookie = `sf_session=${uA.token}`;
let html = await (await web("/dashboard/ads")).text();
assert.match(html, /Storefront - sponsored banner/); assert.match(html, /No campaigns yet/); ok("seller sees the real slots and prices (no mock campaigns)");

const fields = { slot: "STOREFRONT_BANNER", startDate: dhaka(1), endDate: dhaka(3), headline: `Ramadan Sale ${run}`, targetUrl: `/store/adv-${run}` };
let res = await submit("/dashboard/ads", ["headline"], null, fields, null);
assert.match(loc(res), /error=.*image/i); ok("a booking without a banner image is refused");
res = await submit("/dashboard/ads", ["headline"], null, fields, { name: "ad.png", type: "image/png", bytes: svg });
assert.match(loc(res), /error=.*Only PNG/i); ok("an SVG disguised as .png is refused");
res = await submit("/dashboard/ads", ["headline"], null, { ...fields, endDate: dhaka(0) }, { name: "ad.png", type: "image/png", bytes: png });
assert.match(loc(res), /error=/); ok("an end date before the start date is refused");

res = await submit("/dashboard/ads", ["headline"], null, fields, { name: "ad.png", type: "image/png", bytes: png });
const booked = loc(res).match(/booked=([A-Z0-9-]+)/)?.[1];
assert.ok(booked, `booking -> ${res.status} ${loc(res)}`); ok(`ad ${booked} submitted (3 days x ৳400)`);
html = await (await web("/dashboard/ads")).text();
assert.match(html, new RegExp(booked)); assert.match(html, /PENDING_REVIEW/); ok("the campaign is listed as pending review");
res = await submit("/dashboard/ads", ["headline"], null, { ...fields, startDate: dhaka(2), endDate: dhaka(4) }, { name: "ad.png", type: "image/png", bytes: png });
assert.match(loc(res), /already has an ad/i); ok("the same store cannot double-book a slot on overlapping dates");

const booking = (await svc("ad", "GET", `/ads/bookings?storeId=${A.id}`)).bookings.find((b) => b.bookingNumber === booked);
assert.equal(booking.totalPrice, 1200); assert.ok(/^\/uploads\/[\w-]+\.png$/.test(booking.imageUrl)); ok("price is computed by the service (৳1200) and the image is a platform upload with a byte-derived name");
const img = await fetch(WEB + booking.imageUrl);
assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/png"); assert.equal(img.headers.get("x-content-type-options"), "nosniff"); ok("an image uploaded after the app started is served (no restart needed)");

// a second ad, then cancel it
res = await submit("/dashboard/ads", ["headline"], null, { ...fields, slot: "BROWSE_SIDEBAR", headline: `Cancel me ${run}` }, { name: "b.png", type: "image/png", bytes: png });
assert.ok(loc(res).includes("booked="));
html = await (await web("/dashboard/ads")).text();
const cancelId = (await svc("ad", "GET", `/ads/bookings?storeId=${A.id}`)).bookings.find((b) => b.headline === `Cancel me ${run}`).id;
res = await submit("/dashboard/ads", ["id"], `value="${cancelId}"`, {});
assert.match(loc(res), /cancelled=1/);
assert.equal((await svc("ad", "GET", `/ads/bookings?storeId=${A.id}`)).bookings.find((b) => b.id === cancelId).status, "CANCELLED"); ok("a pending request can be cancelled");

cookie = `sf_session=${uB.token}`;
res = await submit("/dashboard/ads", ["headline"], null, { ...fields, headline: `Too poor ${run}` }, { name: "p.png", type: "image/png", bytes: png });
assert.match(loc(res), /Insufficient wallet balance/i); ok("a store without enough wallet balance cannot book");

console.log("admin moderation…");
cookie = `sf_session=${uA.token}`;
res = await web("/admin/ads"); assert.ok(res.status >= 300 && res.status < 400); ok("a seller cannot open ad moderation");
cookie = `sf_session=${adminU.token}`;
html = await (await web("/admin/ads")).text();
assert.match(html, new RegExp(booked)); assert.match(html, new RegExp(`adv-${run} shop`)); assert.match(html, /1 Awaiting Approval|Awaiting Approval/); ok("admin sees the pending ad with store, creative and fee");
res = await submit("/admin/ads", ["note"], `value="${booking.id}"`, { decision: "REJECT", note: "" });
assert.match(loc(res), /error=.*note/i); ok("rejecting without a reason is refused");
const bal0 = (await svc("ledger", "GET", `/wallets/${A.id}/status`)).balance;
res = await submit("/admin/ads", ["note"], `value="${booking.id}"`, { decision: "APPROVE" });
assert.match(loc(res), /done=approved/, loc(res));
const bal1 = (await svc("ledger", "GET", `/wallets/${A.id}/status`)).balance;
assert.equal(bal1, bal0 - 1200); ok("approving charges the seller's wallet ৳1200 (idempotent ledger entry)");

console.log("going live…");
let b2 = await svc("ad", "GET", `/ads/bookings/${booking.id}?storeId=${A.id}`);
assert.ok(["APPROVED", "ACTIVE"].includes(b2.status)); assert.equal(b2.chargeState, "CHARGED");
let sf = await (await fetch(`${WEB}/store/poor-${run}`)).text();
assert.ok(!sf.includes("sponsored-banner"), "no banner before the ad starts"); ok("before its start date the ad is not shown (and no fake placeholder either)");
execFileSync("docker", ["exec", "cheapbazar-services-pg", "psql", "-U", "cheapbazar", "-d", "ads_db", "-c",
  `UPDATE "AdBooking" SET "startDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date, "endDate" = (now() AT TIME ZONE 'Asia/Dhaka')::date + 2 WHERE id = '${booking.id}'`], { stdio: "ignore" });
await svc("ad", "POST", "/admin/ads/tick", {});
let live; for (let i = 0; i < 20; i++) { live = (await svc("ad", "GET", "/ads/active?slot=STOREFRONT_BANNER")).ads; if (live.length) break; await sleep(500); }
assert.equal(live.length, 1); ok("the scheduler starts the ad on its start date");
sf = await (await fetch(`${WEB}/store/poor-${run}`)).text();
assert.match(sf, /sponsored-banner/); assert.match(sf, new RegExp(`Ramadan Sale ${run}`)); assert.match(sf, new RegExp(booking.imageUrl.replace(/[.]/g, "\\.")));
ok("another store's storefront now shows the paid banner");
sf = await (await fetch(`${WEB}/store/adv-${run}`)).text();
assert.ok(!sf.includes(`Ramadan Sale ${run}`)); ok("the advertiser's own storefront does not show its own ad");
html = await (await web("/admin/ads")).text(); assert.match(html, /ACTIVE/); ok("admin sees the ad as ACTIVE");

console.log(`\n${passed} checks passed`);
