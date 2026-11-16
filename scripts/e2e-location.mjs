// End-to-end test of location-based shops: seller sign-up pins the shop, the admin sets the range, buyers on the website and the
// mobile API only see shops within it. Runs against the THROWAWAY stack started by scripts/e2e-location.sh (ports 5001-5008,
// web :3100, databases loc_*). It never touches the live services or Neon.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import http from "node:http";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3100";
const SECRET = process.env.INTERNAL_AUTH_SECRET;
if (!SECRET) throw new Error("INTERNAL_AUTH_SECRET is required");
const port = { identity: 5001, catalog: 5002, ledger: 5005, aggregator: 5007 };
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
  if (!res.ok) throw Object.assign(new Error(`${name} ${method} ${path} -> ${res.status} ${JSON.stringify(j)}`), { status: res.status });
  return j;
}
let cookie = "";
const DHAKA = "cb_loc=23.81_90.413_gps";
const CTG = "cb_loc=22.357_91.783_chattogram";
const web = (path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie, ...(init.headers || {}) } });
const as = (c, path, init = {}) => fetch(WEB + path, { redirect: "manual", ...init, headers: { cookie: c, ...(init.headers || {}) } });
const loc = (r) => decodeURIComponent(r.headers.get("location") || "");
const rnd = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

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
  const r = await svc("identity", "POST", "/auth/register", { email: `${label}-${run}@example.test`, name: `${label} ${run}`, password: "loc-e2e-pass1", role: "SELLER", ip: rnd() });
  if (role !== "SELLER") await svc("identity", "PATCH", `/users/${r.user.id}/role`, { role, admin: "e2e" });
  return r;
}
async function shop(label, lat, lng, productName) {
  const u = await user(label);
  const s = await svc("identity", "POST", "/stores", { ownerId: u.user.id, name: `${label} shop ${run}`, slug: `${label}-${run}`, template: "classic", latitude: lat, longitude: lng });
  for (let i = 0; i < 40; i++) { if ((await svc("ledger", "GET", `/wallets/${s.id}/status`)).exists) break; await sleep(250); }
  if (productName) await svc("catalog", "POST", `/stores/${s.id}/products`, { name: productName, price: 25, stock: 5 });
  return { u, s };
}
async function indexed(q, n = 1) {
  for (let i = 0; i < 60; i++) { if ((await svc("aggregator", "GET", `/aggregator/retail/search?q=${encodeURIComponent(q)}`)).total >= n) return; await sleep(250); }
  throw new Error(`"${q}" never reached the search index`);
}

const NEAR = `Nearbread${run}`, FAR = `Farbread${run}`;
console.log("seeding an admin, a Dhaka shop, a Chattogram shop and a shop without a pin…");
const adminU = await user("admin", "ADMIN");
const near = await shop("near", 23.8, 90.41, NEAR);
const far = await shop("far", 22.3569, 91.7832, FAR);
const legacy = await shop("legacy", 23.79, 90.42, `Legacybread${run}`);
// make the third one look like a shop opened before locations existed
psql("loc_identity", `UPDATE "Store" SET latitude=NULL, longitude=NULL, district=NULL, address=NULL, "locationUpdatedAt"=NULL WHERE id='${legacy.s.id}'`);
psql("loc_search", `UPDATE "StoreProjection" SET latitude=NULL, longitude=NULL, district=NULL WHERE "storeId"='${legacy.s.id}'`);
await Promise.all([indexed(NEAR), indexed(FAR), indexed(`Legacybread${run}`)]);

console.log("range limit OFF (the default): nothing changes…");
let html = await (await as("", `/browse?q=bread${run}`)).text();
assert.ok(html.includes(NEAR) && html.includes(FAR) && html.includes(`Legacybread${run}`), "all shops visible while the limit is off");
assert.ok(!html.includes("Your location:"), "no location chip while the limit is off");
ok("everything is visible to everyone while the limit is off");
assert.equal((await svc("aggregator", "GET", "/settings/location")).enabled, false); ok("the limit is off by default");

console.log("admin sets the range…");
cookie = `sf_session=${adminU.token}`;
html = await (await web("/admin/location")).text();
assert.match(html, /Shop Range/); assert.match(html, /Waiting for a location/); assert.ok(html.includes(`legacy shop ${run}`)); ok("admin range page lists shops that still need a location");
html = await (await web("/admin/stores")).text();
assert.match(html, /No location/); ok("the admin store list flags a shop without a location");
let res = await submit("/admin/location", ["preset"], undefined, { enabled: "on", preset: "25" });
assert.match(loc(res), /done=Range limit is ON/, loc(res));
const pol = await svc("aggregator", "GET", "/settings/location");
assert.equal(pol.enabled, true); assert.equal(pol.radiusKm, 25); assert.match(pol.updatedBy, /admin-/); ok("admin turns the limit on at 25 km (recorded with who did it)");
res = await submit("/admin/location", ["preset"], undefined, { enabled: "on", preset: "custom", custom: "9999" });
assert.match(loc(res), /error=.*between 1 and 500/); ok("an absurd range is refused with a clear message");
cookie = `sf_session=${near.u.token}`;
res = await web("/admin/location"); assert.ok(res.status >= 300 && res.status < 400, `seller on /admin/location -> ${res.status}`); ok("a seller cannot open the range page");
cookie = "";

console.log("buyer on the website…");
html = await (await web(`/browse?q=bread${run}`)).text();
assert.match(html, /Where are you\?/); assert.ok(!html.includes(NEAR)); ok("without a location the marketplace asks for one instead of listing shops");
html = await (await web("/")).text();
assert.match(html, /Tell us where you are/); ok("the home page asks too");
html = await (await as(DHAKA, `/browse?q=bread${run}`)).text();
assert.ok(html.includes(NEAR) && !html.includes(FAR) && !html.includes(`Legacybread${run}`)); ok("a buyer in Dhaka sees the Dhaka shop only (not Chattogram, not the unpinned shop)");
assert.match(html, /km away/); assert.match(html, /within 25 km/); assert.match(html, /Your location: Near me/); ok("results show distance, the range and the header location chip");
assert.ok(!/"latitude"|90\.41\b|23\.8\b/.test(html.replace(/cb_loc[^"]*/g, "")), "no shop coordinates in the page"); ok("shop coordinates are not sent to buyers");
html = await (await as(CTG, `/browse?q=bread${run}`)).text();
assert.ok(html.includes(FAR) && !html.includes(NEAR)); ok("a buyer in Chattogram sees the Chattogram shop only");
html = await (await as(DHAKA, "/")).text();
assert.ok(html.includes(`near shop ${run}`) && !html.includes(`far shop ${run}`)); ok("the home page lists nearby shops only");

console.log("shops reached by link…");
res = await as(DHAKA, `/store/near-${run}`); assert.equal(res.status, 200); assert.ok((await res.text()).includes(NEAR)); ok("an in-range storefront opens");
html = await (await as(DHAKA, `/store/far-${run}`)).text();
assert.match(html, /Not available in your area/); assert.ok(!html.includes(FAR)); ok("an out-of-range storefront shows 'not available in your area'");
html = await (await as("", `/store/far-${run}`)).text();
assert.match(html, /Where are you\?/); ok("a storefront asks for a location when none is known");
html = await (await as(`${DHAKA}; sf_session=${far.u.token}`, `/store/far-${run}`)).text();
assert.ok(html.includes(FAR)); ok("the shop's own owner always sees their shop");
// fetch() ignores a custom Host header, so use the raw http client to arrive "on the seller's own subdomain"
const withHost = (host, path, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(WEB);
  http.get({ host: u.hostname, port: u.port, path, headers: { host, ...headers } }, (r) => {
    let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => resolve({ status: r.statusCode, html: b.replace(/<!-- -->/g, "") }));
  }).on("error", reject);
});
{
  const own = await withHost(`far-${run}.localhost:3100`, "/", { cookie: DHAKA });
  assert.equal(own.status, 200);
  assert.ok(own.html.includes(FAR), "far shop must open on its own subdomain even for a Dhaka buyer");
  ok("a seller's own subdomain/custom domain is not range-limited");
  const viaPlatform = await withHost("127.0.0.1:3100", `/store/far-${run}`, { cookie: DHAKA });
  assert.match(viaPlatform.html, /Not available in your area/); ok("the same shop is gated on the marketplace host");
}

console.log("mobile API…");
let j = await (await web("/api/m/v1/location/config")).json();
assert.equal(j.enabled, true); assert.equal(j.radiusKm, 25); assert.equal(j.districts.length, 64); ok("/location/config returns the range and 64 districts");
j = await (await web(`/api/m/v1/browse?q=bread${run}&lat=23.81&lng=90.413`)).json();
assert.deepEqual(j.items.map((i) => i.name), [NEAR]); assert.ok(j.items[0].store.distanceKm >= 0); assert.equal(j.location.applied, true); ok("/browse with a position returns in-range items with a distance");
j = await (await web(`/api/m/v1/browse?q=bread${run}`)).json();
assert.deepEqual(j.items, []); assert.equal(j.location.required, true); ok("/browse without a position returns nothing and says a location is required");
j = await (await web("/api/m/v1/home?lat=23.81&lng=90.413")).json();
assert.equal(j.location.applied, true); assert.ok(j.stores.every((s) => s.slug !== `far-${run}`)); ok("/home is range-limited and reports the limit");
res = await web(`/api/m/v1/stores/far-${run}?lat=23.81&lng=90.413`);
assert.equal(res.status, 403); assert.equal((await res.json()).code, "OUT_OF_RANGE"); ok("an out-of-range shop page is 403 for the app");
res = await web(`/api/m/v1/stores/near-${run}?lat=23.81&lng=90.413`); assert.equal(res.status, 200); ok("an in-range shop page is 200");
res = await web("/api/m/v1/orders", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": rnd() },
  body: JSON.stringify({ storeSlug: `far-${run}`, buyer: { name: "A B", phone: "01712345678" }, shipping: { address: "Road 1", city: "Dhaka" }, items: [{ productId: "x", quantity: 1 }], location: { lat: 23.81, lng: 90.413 } }) });
assert.equal(res.status, 403); ok("checkout refuses a shop outside the buyer's range");

console.log("seller sign-up (web)…");
const fresh = await user("fresh");
cookie = `sf_session=${fresh.token}`;
html = await (await web("/onboarding")).text();
assert.match(html, /Shop location/); assert.match(html, /name="latitude"/); assert.match(html, /name="longitude"/); assert.match(html, /Use my current location/); ok("onboarding asks where the shop is");
res = await submit("/onboarding", ["name", "slug"], undefined, { name: `Fresh Shop ${run}`, slug: `fresh-${run}`, template: "classic" });
assert.match(loc(res), /\/onboarding\?error=location/, loc(res));
await assert.rejects(svc("identity", "GET", `/stores/by-owner/${fresh.user.id}`), (e) => e.status === 404); ok("a store cannot be created without a pin");
res = await submit("/onboarding", ["name", "slug"], undefined, { name: `Fresh Shop ${run}`, slug: `fresh-${run}`, template: "classic", latitude: "51.5", longitude: "-0.12", district: "dhaka" });
assert.match(loc(res), /error=location/); ok("a pin outside Bangladesh is refused");
res = await submit("/onboarding", ["name", "slug"], undefined, { name: `Fresh Shop ${run}`, slug: `fresh-${run}`, template: "classic", latitude: "22.3569", longitude: "91.7832", district: "chattogram", address: "Agrabad C/A" });
assert.match(loc(res), /\/dashboard/, loc(res));
const made = await svc("identity", "GET", `/stores/by-owner/${fresh.user.id}`);
assert.equal(made.district, "chattogram"); assert.equal(made.address, "Agrabad C/A"); assert.equal(made.hasLocation, true); ok("sign-up with a pin creates the shop with its location");
html = await (await web("/dashboard")).text();
assert.ok(!html.includes("Add your shop location")); ok("a shop with a location has no reminder banner");
for (let i = 0; i < 40; i++) { const v = await svc("aggregator", "GET", `/aggregator/stores/fresh-${run}/visibility?lat=22.357&lng=91.783`); if (v.visible) break; await sleep(250); }
assert.equal((await svc("aggregator", "GET", `/aggregator/stores/fresh-${run}/visibility?lat=22.357&lng=91.783`)).visible, true); ok("the new shop reaches the search index with its pin");

console.log("an existing shop without a location…");
cookie = `sf_session=${legacy.u.token}`;
html = await (await web("/dashboard")).text();
assert.match(html, /Add your shop location/); ok("the seller is reminded on the dashboard");
html = await (await web("/dashboard/settings")).text();
assert.match(html, /has no location yet/); ok("settings explains the shop may be hidden");
res = await submit("/dashboard/settings", ["latitude", "longitude"], undefined, { latitude: "0", longitude: "0", district: "dhaka" });
assert.match(loc(res), /error=location/); ok("settings refuses an invalid pin");
res = await submit("/dashboard/settings", ["latitude", "longitude"], undefined, { latitude: "24.8949", longitude: "91.8687", district: "sylhet", address: "Zindabazar" });
assert.match(loc(res), /success=location/, loc(res));
const upd = await svc("identity", "GET", `/stores/${legacy.s.id}`);
assert.equal(upd.hasLocation, true); assert.equal(upd.district, "sylhet"); ok("the seller saves a location from settings");
html = await (await web("/dashboard")).text();
assert.ok(!html.includes("Add your shop location")); ok("the banner disappears");
for (let i = 0; i < 40; i++) { const v = await svc("aggregator", "GET", `/aggregator/stores/legacy-${run}/visibility?lat=24.9&lng=91.87`); if (v.visible) break; await sleep(250); }
assert.equal((await as("sf_session=none; cb_loc=24.9_91.87_gps", `/store/legacy-${run}`).then((r) => r.text())).includes(`legacy shop ${run}`), true); ok("the shop becomes visible to buyers near its new pin");

console.log("admin turns the limit off…");
cookie = `sf_session=${adminU.token}`;
res = await submit("/admin/location", ["preset"], undefined, { preset: "25" }); // checkbox unticked = off
assert.match(loc(res), /done=Range limit is OFF/, loc(res));
html = await (await as("", `/browse?q=bread${run}`)).text();
assert.ok(html.includes(NEAR) && html.includes(FAR)); ok("with the limit off every shop is visible again");

console.log(`\n${passed} checks passed`);
