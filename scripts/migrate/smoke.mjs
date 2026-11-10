// Smoke test through the REAL rehearsal services (identity :4101, catalog :4102, order :4103,
// ledger :4105, aggregator :4107): proves the migrated data is usable, not just present.
const S = process.env.INTERNAL_AUTH_SECRET;
const call = async (port, method, path, body) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { authorization: `Bearer ${S}`, "x-service-name": "migration-smoke", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j };
};
let fails = 0;
const check = (ok, label, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${d ? "  " + d : ""}`); if (!ok) fails++; };

// 1. a migrated seller logs in with the OLD bcrypt hash
let r = await call(4101, "POST", "/auth/login", { email: "rahatkhan@unifiedit.xyz", password: "rehearsal-pass-1" });
check(r.status === 200 && r.body.user?.email === "rahatkhan@unifiedit.xyz", "migrated seller logs in with carried-over password hash", `status=${r.status}`);
const token = r.body.token ?? r.body.sessionToken;
const owner = r.body.user;
r = await call(4101, "POST", "/auth/login", { email: "rahatkhan@unifiedit.xyz", password: "wrong-password" });
check(r.status === 401 || r.status === 400, "wrong password is rejected", `status=${r.status}`);
r = await call(4101, "POST", "/auth/session", { token });
check(r.status === 200 && r.body.user?.id === owner?.id, "session issued by identity-service verifies");

// 2. the seed accounts cannot log in with their documented weak passwords
for (const [email, pw] of [["admin@storeforge.dev", "admin12345"], ["demo@storeforge.dev", "demo12345"], ["buyer@storeforge.dev", "buyer12345"], ["admin@storeforge.dev", "password"], ["admin@storeforge.dev", "admin123"]]) {
  r = await call(4101, "POST", "/auth/login", { email, password: pw });
  check(r.status !== 200, `seed account ${email} cannot log in with "${pw}"`, `status=${r.status}`);
}
// 3. the new admin works and is ADMIN
r = await call(4101, "POST", "/auth/login", { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
check(r.status === 200 && r.body.user?.role === "ADMIN", "new platform admin logs in as ADMIN", `status=${r.status}`);

// 4. store + product + wallet + search
r = await call(4101, "GET", `/stores/by-owner/${owner.id}`);
const store = r.body.store ?? r.body;
check(store?.slug === "unified-cloud", "owner -> store lookup", `slug=${store?.slug}`);
r = await call(4101, "GET", "/stores/" + store.id);
check(r.status === 200, "store by id");
r = await call(4105, "GET", `/wallets/${store.id}/status`);
check(r.status === 200 && r.body.exists, "wallet exists in ledger-service", `balance=${r.body.balance} holds=${r.body.holds} status=${r.body.status}`);
const wallets = (await call(4105, "GET", "/wallets")).body.wallets;
check(wallets.find((w) => w.storeId === store.id)?.holds === 22.5, "in-flight COD fee hold carried (৳22.50 for the SHIPPED order)");
r = await call(4105, "GET", `/wallets/${store.id}/statement`);
check(r.status === 200, "wallet statement readable");
r = await call(4107, "GET", "/aggregator/retail/search?q=Logo");
check(r.status === 200 && JSON.stringify(r.body).includes("Logo"), "aggregator search finds a migrated product (Logo)");
r = await call(4107, "GET", "/aggregator/stores");
check((r.body.stores ?? []).length >= 3, "aggregator store directory populated", `stores=${(r.body.stores ?? []).length}`);
const susp = (await call(4105, "GET", "/wallets?status=SUSPENDED")).body.wallets;
check(susp?.length === 1, "SUSPENDED store status carried to the ledger (fixture)");
r = await call(4107, "GET", "/aggregator/retail/search?q=mango");
check((r.body.items ?? r.body.results ?? r.body.listings ?? []).length === 0, "a SUSPENDED store's product is hidden from search (fixture: hghjg/mango)");
console.log("info  search for a SUSPENDED store's product returns", (r.body.items ?? r.body.results ?? []).length, "item(s)");

// 5. orders readable + advance through the state machine (delivery settles the hold)
r = await call(4103, "GET", "/orders/by-number/ORD-FX1");
check(r.status === 200 && r.body.status === "SHIPPED" && r.body.items?.length === 1, "migrated order readable with its items", `status=${r.body.status}`);
r = await call(4103, "GET", `/stores/${store.id}/orders`);
check((r.body.orders ?? []).length === 2, "store order list", `orders=${(r.body.orders ?? []).length}`);
r = await call(4103, "PATCH", `/orders/${(await call(4103, "GET", "/orders/by-number/ORD-FX1")).body.id}/status`, { to: "DELIVERED", source: "SELLER", actor: owner.id, storeId: store.id });
check(r.status === 200, "migrated order can be marked DELIVERED", `status=${r.status} ${r.status !== 200 ? JSON.stringify(r.body) : ""}`);
let hold = null;
for (let i = 0; i < 30 && !(hold === 0); i++) { await new Promise((x) => setTimeout(x, 1000)); hold = (await call(4105, "GET", `/wallets/${store.id}/status`)).body.holds; }
check(hold === 0, "delivery settled the carried hold in the ledger (holds -> 0)", `holds=${hold}`);

console.log(fails ? `\n${fails} SMOKE CHECK(S) FAILED` : "\nSMOKE OK");
process.exit(fails ? 1 : 0);
