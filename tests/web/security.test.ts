import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, clientIp } from "../../src/lib/security/ratelimit";
import { validateImage, sniffImage, UploadError, MAX_IMAGE_BYTES } from "../../src/lib/security/uploads";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

test("rate limiter blocks after max and resets after the window", () => {
  const rl = new RateLimiter(3, 1000);
  assert.equal(rl.allow("a", 0), true);
  assert.equal(rl.allow("a", 1), true);
  assert.equal(rl.allow("a", 2), true);
  assert.equal(rl.allow("a", 3), false);
  assert.equal(rl.allow("b", 3), true); // other keys unaffected
  assert.equal(rl.allow("a", 1001), true); // new window
});

test("rate limiter reset clears a key", () => {
  const rl = new RateLimiter(1, 10_000);
  assert.equal(rl.allow("k", 0), true);
  assert.equal(rl.allow("k", 1), false);
  rl.reset("k");
  assert.equal(rl.allow("k", 2), true);
});

test("clientIp prefers the last forwarded hop and falls back safely", () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
  assert.equal(clientIp(h({})), "unknown");
});

test("real images are recognised and get an extension from their bytes", () => {
  assert.equal(validateImage(png).ext, ".png");
  assert.equal(validateImage(jpg).ext, ".jpg");
  assert.equal(validateImage(gif).ext, ".gif");
  assert.equal(validateImage(webp).ext, ".webp");
});

test("svg, html and scripts are rejected whatever the file is called", () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.equal(sniffImage(svg), null);
  assert.throws(() => validateImage(svg), UploadError);
  assert.throws(() => validateImage(html), UploadError);
});

test("empty and oversized files are rejected", () => {
  assert.throws(() => validateImage(new Uint8Array(0)), UploadError);
  const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
  big.set(png);
  assert.throws(() => validateImage(big), /5 MB/);
});
