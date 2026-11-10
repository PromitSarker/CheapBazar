import test from "node:test";
import assert from "node:assert/strict";
import { safeLink } from "../../src/lib/bff/notifications";

test("safeLink only allows same-site paths", () => {
  for (const ok of ["/dashboard/orders", "/pro", "/store/my-shop/order/ORD-1", "/browse?tab=wholesale&q=a%20b"]) assert.equal(safeLink(ok), ok);
  for (const bad of ["//evil.com/x", "https://evil.com", "http://x", "javascript:alert(1)", "data:text/html,x", "/\\evil.com", "/a b", "/<script>", "", null, undefined, "dashboard"]) {
    assert.equal(safeLink(bad as any), null, String(bad));
  }
});
