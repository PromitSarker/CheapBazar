import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { serviceClient, ServiceError } from "../../../packages/service-kit";
import { resetDatabase } from "../../../packages/service-kit/testing";
import { createDb } from "../src/db";
import { startIdentityService } from "../src/app";

const SECRET = "test-secret";
const PORT = 14001;
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:54329/postgres";

let svc: Awaited<ReturnType<typeof startIdentityService>>;
let api: ReturnType<typeof serviceClient>;
let n = 0;
const email = () => `user${++n}_${Math.random().toString(36).slice(2, 6)}@example.com`;
const PW = "correct-horse-1";

async function expectErr(p: Promise<any>, code: string, status?: number) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof ServiceError, String(e));
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status);
    return true;
  });
}
const reg = (role = "SELLER", ip = `10.0.0.${++n}`) => api.post("/auth/register", { email: email(), name: "Test User", password: PW, role, ip });

before(async () => {
  const url = await resetDatabase(ADMIN_URL, "identity_test", path.join(__dirname, "../prisma/schema.prisma"), createDb);
  svc = await startIdentityService({ secret: SECRET, port: PORT, databaseUrl: url, relay: false });
  api = serviceClient({ baseUrl: `http://127.0.0.1:${PORT}`, secret: SECRET, caller: "test" });
});
after(async () => { await svc.stop(); });

test("register -> session -> logout; token is stored hashed", async () => {
  const e = email();
  const r = await api.post("/auth/register", { email: e.toUpperCase(), name: "Ada", password: PW, role: "buyer", ip: "1.1.1.1" });
  assert.equal(r.user.email, e, "emails are normalised");
  assert.equal(r.user.role, "BUYER");
  assert.equal(r.user.passwordHash, undefined, "hash never leaves the service");
  assert.ok(r.token.length >= 64);

  const stored = await svc.db.session.findFirstOrThrow({ where: { userId: r.user.id } });
  assert.notEqual(stored.tokenHash, r.token, "raw token is not persisted");

  assert.equal((await api.post("/auth/session", { token: r.token })).user.id, r.user.id);
  await api.post("/auth/logout", { token: r.token });
  await expectErr(api.post("/auth/session", { token: r.token }), "NO_SESSION", 401);
  await expectErr(api.post("/auth/session", { token: "garbage" }), "NO_SESSION", 401);
});

test("registration validation: duplicates, weak passwords, forbidden roles", async () => {
  const e = email();
  await api.post("/auth/register", { email: e, name: "A", password: PW, ip: "2.2.2.2" });
  await expectErr(api.post("/auth/register", { email: e, name: "A", password: PW, ip: "2.2.2.2" }), "EMAIL_TAKEN", 409);
  await expectErr(api.post("/auth/register", { email: email(), name: "A", password: "short", ip: "2.2.2.2" }), "VALIDATION", 400);
  await expectErr(api.post("/auth/register", { email: "not-an-email", name: "A", password: PW, ip: "2.2.2.2" }), "VALIDATION", 400);
  await expectErr(api.post("/auth/register", { email: email(), name: "A", password: PW, role: "ADMIN", ip: "2.2.2.2" }), "VALIDATION", 400);
});

test("login: correct password works; wrong/unknown fail identically; brute force is throttled", async () => {
  const e = email();
  await api.post("/auth/register", { email: e, name: "B", password: PW, ip: "3.3.3.3" });
  assert.ok((await api.post("/auth/login", { email: e, password: PW, ip: "3.3.3.3" })).token);
  const wrong = await api.post("/auth/login", { email: e, password: "nope-nope", ip: "3.3.3.4" }).catch((x) => x);
  const unknown = await api.post("/auth/login", { email: email(), password: "nope-nope", ip: "3.3.3.5" }).catch((x) => x);
  assert.equal(wrong.code, "BAD_CREDENTIALS");
  assert.equal(unknown.code, "BAD_CREDENTIALS");
  assert.equal(wrong.message, unknown.message, "no account enumeration");

  for (let i = 0; i < 8; i++) await api.post("/auth/login", { email: e, password: "bad-pass-1", ip: "9.9.9.9" }).catch(() => {});
  await expectErr(api.post("/auth/login", { email: e, password: PW, ip: "9.9.9.9" }), "RATE_LIMITED", 429);
});

test("buyer account deletion: needs the password, anonymises, ends sessions; sellers cannot self-delete", async () => {
  const b = await api.post("/auth/register", { email: "del-me@example.com", name: "Del Me", password: "supersecret1", role: "BUYER", ip: "9.9.9.1" });
  await expectErr(api.post(`/users/${b.user.id}/delete`, { password: "wrong-password" }), "BAD_CREDENTIALS", 401);
  assert.equal((await api.post(`/users/${b.user.id}/delete`, { password: "supersecret1" })).ok, true);
  await expectErr(api.post("/auth/session", { token: b.token }), "NO_SESSION", 401);
  await expectErr(api.post("/auth/login", { email: "del-me@example.com", password: "supersecret1", ip: "9.9.9.1" }), "BAD_CREDENTIALS", 401);
  const gone = await api.get(`/users/${b.user.id}`);
  assert.equal(gone.name, "Deleted user");
  assert.match(gone.email, /@deleted\.invalid$/);
  const s = await api.post("/auth/register", { email: "seller-del@example.com", name: "S", password: "supersecret1", role: "SELLER", ip: "9.9.9.2" });
  await expectErr(api.post(`/users/${s.user.id}/delete`, { password: "supersecret1" }), "NOT_ALLOWED", 403);
});

test("expired sessions are rejected and cleaned up", async () => {
  const r = await reg("BUYER");
  await svc.db.session.updateMany({ where: { userId: r.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expectErr(api.post("/auth/session", { token: r.token }), "NO_SESSION", 401);
  const c = await api.post("/admin/sessions/cleanup");
  assert.ok(c.deleted >= 1);
});

test("roles: change role, the last admin cannot be demoted", async () => {
  const a = await reg("SELLER");
  await api.patch(`/users/${a.user.id}/role`, { role: "ADMIN", admin: "root" });
  assert.deepEqual((await api.get(`/users/${a.user.id}/roles`)).roles, ["ADMIN"]);
  await expectErr(api.patch(`/users/${a.user.id}/role`, { role: "SELLER", admin: "root" }), "LAST_ADMIN", 409);
  const b = await reg("SELLER");
  await api.patch(`/users/${b.user.id}/role`, { role: "ADMIN", admin: "root" });
  await api.patch(`/users/${a.user.id}/role`, { role: "SELLER", admin: "root" }); // now allowed
  await expectErr(api.patch(`/users/${b.user.id}/role`, { role: "KING", admin: "root" }), "VALIDATION", 400);
});

test("stores: only sellers, one per owner, slug rules, StoreCreated fans out", async () => {
  const seller = await reg("SELLER");
  const buyer = await reg("BUYER");
  await expectErr(api.post("/stores", { ownerId: buyer.user.id, name: "Nope" }), "NOT_SELLER", 403);
  await expectErr(api.post("/stores", { ownerId: seller.user.id, name: "Admin Hub", slug: "Admin" }), "SLUG_RESERVED", 400);

  const s = await api.post("/stores", { ownerId: seller.user.id, name: "  Rahim's Bakery!  ", template: "modern" });
  assert.equal(s.slug, "rahim-s-bakery", "slug derived from the name when omitted");
  assert.equal(s.template, "modern");
  await expectErr(api.post("/stores", { ownerId: seller.user.id, name: "Again" }), "STORE_EXISTS", 409);

  const other = await reg("SELLER");
  await expectErr(api.post("/stores", { ownerId: other.user.id, name: "Clash", slug: "rahim-s-bakery" }), "SLUG_TAKEN", 409);
  await expectErr(api.post("/stores", { ownerId: other.user.id, name: "Bad", template: "neon" }), "VALIDATION", 400);

  const rows = await svc.db.$queryRawUnsafe<{ consumer: string }[]>(
    `SELECT "consumer" FROM "OutboxMessage" WHERE "eventType" = 'StoreCreated' AND "envelope"->'data'->>'storeId' = $1`, s.id);
  assert.deepEqual(rows.map((x) => x.consumer).sort(), ["aggregator", "ledger", "notification"]);

  assert.equal((await api.get(`/stores/by-owner/${seller.user.id}`)).id, s.id);
  assert.equal((await api.get(`/stores/${s.id}`)).slug, s.slug);
});

test("store settings: ownership enforced, custom domains validated and unique, events emitted", async () => {
  const seller = await reg("SELLER");
  const intruder = await reg("SELLER");
  const s = await api.post("/stores", { ownerId: seller.user.id, name: "Tenant One" });

  await expectErr(api.patch(`/stores/${s.id}`, { actorId: intruder.user.id, name: "Hijack" }), "FORBIDDEN", 403);
  const upd = await api.patch(`/stores/${s.id}`, { actorId: seller.user.id, name: "Tenant 1", customDomain: "https://Shop.Example.com/path" });
  assert.equal(upd.customDomain, "shop.example.com");
  assert.equal(upd.name, "Tenant 1");

  await expectErr(api.patch(`/stores/${s.id}`, { actorId: seller.user.id, customDomain: "cheap-bazar.com" }), "VALIDATION", 400);
  await expectErr(api.patch(`/stores/${s.id}`, { actorId: seller.user.id, customDomain: "not a domain" }), "VALIDATION", 400);

  const s2 = await api.post("/stores", { ownerId: intruder.user.id, name: "Tenant Two" });
  await expectErr(api.patch(`/stores/${s2.id}`, { actorId: intruder.user.id, customDomain: "shop.example.com" }), "DOMAIN_TAKEN", 409);
  await expectErr(api.patch(`/stores/${s2.id}`, { actorId: intruder.user.id, slug: "tenant-one" }), "SLUG_TAKEN", 409);

  const kinds = await svc.db.$queryRawUnsafe<{ eventType: string; consumer: string }[]>(
    `SELECT DISTINCT "eventType","consumer" FROM "OutboxMessage" WHERE "envelope"->'data'->>'storeId' = $1`, s.id);
  assert.ok(kinds.some((k) => k.eventType === "StoreUpdated" && k.consumer === "aggregator"));
  assert.ok(kinds.some((k) => k.eventType === "StoreDomainUpdated" && k.consumer === "aggregator"));
});

test("tenant resolution by custom domain and by slug (used by the edge router)", async () => {
  const seller = await reg("SELLER");
  const s = await api.post("/stores", { ownerId: seller.user.id, name: "Resolver Shop" });
  await api.patch(`/stores/${s.id}`, { actorId: seller.user.id, customDomain: "resolver.example.org" });
  assert.equal((await api.get("/tenants/resolve?domain=resolver.example.org")).id, s.id);
  assert.equal((await api.get("/tenants/resolve?domain=RESOLVER.example.org")).id, s.id);
  assert.equal((await api.get("/tenants/resolve?slug=resolver-shop")).id, s.id);
  await expectErr(api.get("/tenants/resolve?domain=nobody.example.org"), "NOT_FOUND", 404);
  await expectErr(api.get("/tenants/resolve"), "NOT_FOUND", 404);
});

test("KYC flag, admin stats and store listing", async () => {
  const seller = await reg("SELLER");
  const s = await api.post("/stores", { ownerId: seller.user.id, name: "Listing Lane" });
  assert.equal(s.kycVerified, false);
  assert.equal((await api.patch(`/stores/${s.id}/kyc`, { kycVerified: true, admin: "root" })).kycVerified, true);
  await expectErr(api.patch(`/stores/nope/kyc`, { kycVerified: true, admin: "root" }), "NOT_FOUND", 404);

  const stats = await api.get("/admin/stats");
  assert.ok(stats.users >= 5 && stats.stores >= 3 && stats.kycVerified >= 1);
  assert.ok(stats.roles.SELLER >= 1);

  const found = await api.get("/stores?q=listing%20lane");
  assert.equal(found.stores.length, 1);
  assert.equal(found.stores[0].owner.email, seller.user.email);
  assert.equal((await api.get(`/stores?ids=${s.id}`)).stores.length, 1);

  const users = await api.get("/users?role=SELLER");
  assert.ok(users.users.every((u: any) => u.role === "SELLER" && u.passwordHash === undefined));
});

test("store branding: logo must be an uploaded image path, colour must be #rrggbb, both can be removed", async () => {
  const { user } = await reg("SELLER");
  const store = await api.post("/stores", { ownerId: user.id, name: "Brand Shop", slug: `brand-${Math.random().toString(36).slice(2, 7)}`, template: "modern" });
  assert.equal(store.logoUrl, null);
  assert.equal(store.themeColor, null);

  const ok = await api.patch(`/stores/${store.id}`, { actorId: user.id, logoUrl: "/uploads/abc-123.png", themeColor: "#1D4ED8" });
  assert.equal(ok.logoUrl, "/uploads/abc-123.png");
  assert.equal(ok.themeColor, "#1d4ed8", "colour is normalised to lower case");
  const resolved = await api.get(`/tenants/resolve?slug=${store.slug}`);
  assert.equal(resolved.logoUrl, "/uploads/abc-123.png");

  await expectErr(api.patch(`/stores/${store.id}`, { actorId: user.id, logoUrl: "https://evil.example/x.png" }), "VALIDATION", 400);
  await expectErr(api.patch(`/stores/${store.id}`, { actorId: user.id, logoUrl: "/uploads/../etc/passwd" }), "VALIDATION", 400);
  await expectErr(api.patch(`/stores/${store.id}`, { actorId: user.id, logoUrl: "/uploads/x.svg" }), "VALIDATION", 400);
  await expectErr(api.patch(`/stores/${store.id}`, { actorId: user.id, themeColor: "red" }), "VALIDATION", 400);
  const still = await api.get(`/tenants/resolve?slug=${store.slug}`);
  assert.equal(still.themeColor, "#1d4ed8", "a rejected update changes nothing");

  const other = await reg("SELLER");
  await expectErr(api.patch(`/stores/${store.id}`, { actorId: other.user.id, themeColor: "#000000" }), "FORBIDDEN", 403);

  const cleared = await api.patch(`/stores/${store.id}`, { actorId: user.id, logoUrl: null, themeColor: null });
  assert.equal(cleared.logoUrl, null);
  assert.equal(cleared.themeColor, null);
});
