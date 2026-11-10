import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { callService, ServiceCallError, servicesEnabled } from "../../src/lib/bff/client";

function start(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => {
      const port = (s.address() as any).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => s.close() });
    });
  });
}

test("callService sends the bearer secret and parses JSON", async () => {
  let seen: any = {};
  const srv = await start((req, res) => {
    seen = { auth: req.headers.authorization, who: req.headers["x-service-name"], method: req.method, url: req.url };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  process.env.INTERNAL_AUTH_SECRET = "s3cret";
  process.env.SERVICE_URL_IDENTITY = srv.url;
  const r = await callService("identity", "POST", "/auth/session", { token: "t" });
  srv.close();
  assert.deepEqual(r, { ok: true });
  assert.equal(seen.auth, "Bearer s3cret");
  assert.equal(seen.who, "web");
  assert.equal(seen.url, "/auth/session");
});

test("service errors keep their status and code", async () => {
  const srv = await start((_req, res) => {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Session expired", code: "NO_SESSION" }));
  });
  process.env.INTERNAL_AUTH_SECRET = "s3cret";
  process.env.SERVICE_URL_IDENTITY = srv.url;
  await assert.rejects(
    () => callService("identity", "POST", "/auth/session", {}),
    (e: any) => e instanceof ServiceCallError && e.status === 401 && e.code === "NO_SESSION"
  );
  srv.close();
});

test("an unreachable service becomes a 503 UNREACHABLE", async () => {
  process.env.INTERNAL_AUTH_SECRET = "s3cret";
  process.env.SERVICE_URL_IDENTITY = "http://127.0.0.1:1";
  await assert.rejects(
    () => callService("identity", "GET", "/users", undefined, { timeoutMs: 500 }),
    (e: any) => e.status === 503 && e.code === "UNREACHABLE"
  );
});

test("missing secret fails closed and the flag is off by default", async () => {
  delete process.env.INTERNAL_AUTH_SECRET;
  await assert.rejects(() => callService("identity", "GET", "/users"), (e: any) => e.code === "CONFIG");
  delete process.env.USE_SERVICES;
  assert.equal(servicesEnabled(), false);
  process.env.USE_SERVICES = "true";
  assert.equal(servicesEnabled(), true);
});
