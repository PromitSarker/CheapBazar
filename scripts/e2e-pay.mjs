// End-to-end test of seller payment details (web settings form) and the buyer API (/api/m/v1/stores/:slug/pay).
// Drives the real form like a browser without JavaScript. Run it through scripts/e2e-pay.sh (throwaway identity DB).
import assert from "node:assert/strict";

const WEB = process.env.WEB_URL || "http://127.0.0.1:3200";
let passed = 0;
const ok = (l) => (console.log(`  ok  ${l}`), passed++);

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
async function submit(pagePath, match, fields, files = {}) {
  const { html } = await get(pagePath);
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => match.every((n) => f.includes(`name="${n}"`)));
  assert.ok(form, `form with fields [${match}] on ${pagePath}`);
  const id = form.match(/name="(\$ACTION_ID_[^"]+)"/);
  assert.ok(id, `server action id in form on ${pagePath}`);
  const fd = new FormData();
  fd.append(id[1], "");
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
const api = async (path, { token, method = "GET", body } = {}) => {
  const res = await fetch(`${WEB}/api/m/v1${path}`, {
    method, headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const run = Date.now().toString(36);
const email = `paysell-${run}@example.test`;
const slug = `payshop-${run}`;
const PW = "pay-seller-pass-1";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

console.log("seller signs up and opens a shop…");
let res = await submit("/signup", ["email", "name", "password"], { email, name: "Pay Seller", password: PW, role: "SELLER" });
assert.ok(loc(res).includes("/onboarding"), `signup -> ${res.status} ${loc(res)}`);
res = await submit("/onboarding", ["name", "slug"], { name: `Pay Shop ${run}`, slug, template: "classic", latitude: "23.78", longitude: "90.41", district: "dhaka", address: "Road 1" });
assert.ok(loc(res).includes("/dashboard"), `onboarding -> ${res.status} ${loc(res)}`); ok("seller account and shop created");

console.log("settings form…");
let page = await get("/dashboard/settings");
assert.equal(page.res.status, 200);
assert.match(page.html, /Receive payments/); assert.match(page.html, /name="bkash"/); assert.match(page.html, /name="banglaQr"/);
ok("settings page shows the Receive payments section");

res = await submit("/dashboard/settings", ["bkash", "nagad", "rocket", "password"], { bkash: "01712345678", nagad: "", rocket: "", password: "not-my-password" });
assert.ok(loc(res).includes("error=pay-password"), `wrong password -> ${loc(res)}`); ok("a wrong password is refused");
page = await get("/dashboard/settings");
assert.ok(!page.html.includes('value="01712345678"'), "nothing saved"); ok("...and nothing was saved");

res = await submit("/dashboard/settings", ["bkash", "nagad", "rocket", "password"], { bkash: "12345", nagad: "", rocket: "", password: PW });
assert.ok(loc(res).includes("error=pay-invalid"), `bad number -> ${loc(res)}`); ok("a number that is not a Bangladesh mobile is refused");

res = await submit("/dashboard/settings", ["bkash", "nagad", "rocket", "password"], { bkash: "+880 1712-345678", nagad: "01912345678", rocket: "", password: PW }, { banglaQr: { bytes: png, type: "image/png", name: "qr.png" } });
assert.ok(loc(res).includes("success=pay"), `save -> ${res.status} ${loc(res)}`); ok("numbers and a Bangla QR are saved (+880 form normalised)");
page = await get("/dashboard/settings");
assert.match(page.html, /value="01712345678"/); assert.match(page.html, /value="01912345678"/);
const qrUrl = page.html.match(/src="(\/uploads\/[A-Za-z0-9-]+\.png)"[^>]*alt="Your Bangla QR"/)?.[1];
assert.ok(qrUrl, "QR preview is shown"); ok("settings page shows the saved numbers and the QR preview");

res = await submit("/dashboard/settings", ["bkash", "nagad", "rocket", "password"], { bkash: "01712345678", nagad: "", rocket: "", password: PW }, { banglaQr: { bytes: Uint8Array.from([0x3c, 0x73, 0x76, 0x67]), type: "image/png", name: "evil.png" } });
assert.ok(loc(res).includes("error=pay-qr"), `non-image QR -> ${loc(res)}`); ok("a QR file that is not a real image is refused");

console.log("buyer API…");
const buyerEmail = `paybuy-${run}@example.test`;
const reg = await api("/auth/register", { method: "POST", body: { email: buyerEmail, name: "Pay Buyer", password: "buyer-pass-123" } });
assert.equal(reg.status, 200, JSON.stringify(reg.json));
const token = reg.json.token;

let r = await api(`/stores/${slug}/pay`);
assert.equal(r.status, 401); ok("signed-out requests get no numbers (401)");

r = await api(`/stores/${slug}/pay`, { token });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.bkash, "01712345678"); assert.equal(r.json.nagad, "01912345678"); assert.equal(r.json.rocket, null);
assert.equal(r.json.banglaQrUrl, qrUrl); assert.equal(r.json.available, true); assert.equal(r.json.store.slug, slug);
ok("a signed-in buyer gets the seller's numbers and QR");

const img = await fetch(WEB + r.json.banglaQrUrl);
assert.equal(img.status, 200); assert.match(img.headers.get("content-type") || "", /image\/png/); ok("the QR image is served to the app");

r = await api(`/stores/no-such-shop-${run}/pay`, { token });
assert.equal(r.status, 404); ok("unknown shop -> 404");

// remove everything: the shop then offers no direct payment
res = await submit("/dashboard/settings", ["bkash", "nagad", "rocket", "password"], { bkash: "", nagad: "", rocket: "", password: PW, removeBanglaQr: "1" });
assert.ok(loc(res).includes("success=pay"), `clear -> ${loc(res)}`);
r = await api(`/stores/${slug}/pay`, { token });
assert.equal(r.json.available, false); assert.equal(r.json.bkash, null); assert.equal(r.json.banglaQrUrl, null);
ok("clearing every field turns direct payment off for the shop");

console.log(`\n${passed} checks passed`);
