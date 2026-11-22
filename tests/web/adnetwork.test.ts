import test from "node:test";
import assert from "node:assert/strict";
import { adsenseConfig, admobConfig, adsTxt, webUnit, adNetworkStatus, ADMOB_TEST_BANNER } from "../../src/lib/adnetwork";
import { isAdFreePath } from "../../src/components/ads/AdsenseLoader";

const CLIENT = "ca-pub-1234567890123456";

test("AdSense: nothing configured means disabled, no units, no ads.txt", () => {
  const c = adsenseConfig({});
  assert.equal(c.enabled, false);
  assert.equal(c.client, null);
  assert.equal(webUnit("home", {}), null);
  assert.equal(adsTxt({}), null);
});

test("AdSense: a valid publisher id enables it; unit ids are per placement and validated", () => {
  const env = { ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT_HOME: "1234567890", ADSENSE_SLOT_BROWSE: "not-a-number", ADSENSE_SLOT_STORE: " 987654321 " };
  const c = adsenseConfig(env);
  assert.equal(c.enabled, true);
  assert.equal(c.client, CLIENT);
  assert.deepEqual(webUnit("home", env), { client: CLIENT, slot: "1234567890" });
  assert.equal(webUnit("browse", env), null, "a malformed slot id is ignored, never rendered");
  assert.equal(webUnit("browse_side", env), null, "an unset slot stays empty");
  assert.deepEqual(webUnit("store", env), { client: CLIENT, slot: "987654321" });
});

test("AdSense: malformed publisher ids and the kill switch disable everything", () => {
  assert.equal(adsenseConfig({ ADSENSE_CLIENT: "ca-pub-123" }).enabled, false);
  assert.equal(adsenseConfig({ ADSENSE_CLIENT: "<script>alert(1)</script>" }).enabled, false);
  assert.equal(adsenseConfig({ ADSENSE_CLIENT: "ca-pub-1234567890123456\"><x" }).enabled, false);
  const off = { ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT_HOME: "1234567890", ADSENSE_ENABLED: "false" };
  assert.equal(adsenseConfig(off).enabled, false);
  assert.equal(webUnit("home", off), null);
  assert.equal(adsenseConfig({ ADSENSE_CLIENT: "pub-1234567890123456" }).client, CLIENT, "bare pub- form is accepted");
  assert.equal(adsenseConfig({ ADSENSE_CLIENT: `"${CLIENT}"` }).client, CLIENT, "quotes from a .env are stripped");
});

test("ads.txt carries the publisher id in Google's DIRECT format", () => {
  assert.equal(adsTxt({ ADSENSE_CLIENT: CLIENT }), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  assert.equal(adsTxt({ ADSENSE_CLIENT: CLIENT, ADSENSE_ENABLED: "0" }), null);
});

test("AdMob: off by default; needs the switch AND a valid unit", () => {
  assert.equal(admobConfig({}).enabled, false);
  assert.equal(admobConfig({ ADMOB_ENABLED: "true" }).enabled, false, "switch with no unit stays off");
  assert.equal(admobConfig({ ADMOB_BANNER_HOME: "ca-app-pub-1234567890123456/1234567890" }).enabled, false, "unit without the switch stays off");
  const env = { ADMOB_ENABLED: "true", ADMOB_BANNER_HOME: "ca-app-pub-1234567890123456/1234567890", ADMOB_BANNER_BROWSE: "garbage" };
  const c = admobConfig(env);
  assert.equal(c.enabled, true);
  assert.equal(c.banners.home, "ca-app-pub-1234567890123456/1234567890");
  assert.equal(c.banners.browse, null);
  assert.equal(c.banners.product, null);
});

test("AdMob: test mode serves only Google's sample unit, and is reported as such", () => {
  const c = admobConfig({ ADMOB_ENABLED: "true", ADMOB_USE_TEST_UNITS: "true" });
  assert.equal(c.enabled, true);
  assert.equal(c.testUnits, true);
  assert.equal(c.banners.home, ADMOB_TEST_BANNER);
  const off = admobConfig({ ADMOB_USE_TEST_UNITS: "true" });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.banners, { home: null, browse: null, product: null }, "a disabled config leaks no unit ids");
});

test("status summary never exposes full ids", () => {
  const st = adNetworkStatus({ ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT_HOME: "1234567890" });
  assert.equal(st.adsense.enabled, true);
  assert.ok(!JSON.stringify(st).includes(CLIENT));
  assert.equal(st.adsense.placements.find((p) => p.placement === "home")!.ready, true);
  assert.equal(st.adsense.placements.find((p) => p.placement === "store")!.ready, false);
});

test("no ad code on private, money or checkout pages; allowed on public ones", () => {
  for (const p of ["/dashboard", "/dashboard/ads", "/admin/ads", "/login", "/signup", "/payment/status", "/orders", "/pro", "/store/shop/order", "/store/shop/order/ORD-1", "/api/m/v1/home"]) {
    assert.equal(isAdFreePath(p), true, p);
  }
  for (const p of ["/", "/browse", "/store/shop", "/about", "/privacy", "/stores", "/store/order-shop"]) {
    assert.equal(isAdFreePath(p), false, p);
  }
});
