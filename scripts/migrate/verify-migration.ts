/**
 * Post-migration checks. Read-only on every database.
 *   SOURCE_DATABASE_URL + IDENTITY_/CATALOG_/ORDER_/LEDGER_/AGGREGATOR_DATABASE_URL
 *   tsx scripts/migrate/verify-migration.ts [--wallets=carry|zero] [--seed-accounts=lock|drop]
 * Run it AFTER the services have drained their outboxes (it checks that they did).
 */
import { PrismaClient as Legacy } from "@prisma/client";
import { PrismaClient as IdentityDb } from "../../services/identity-service/generated/client";
import { PrismaClient as CatalogDb } from "../../services/catalog-service/generated/client";
import { PrismaClient as OrderDb } from "../../services/order-service/generated/client";
import { PrismaClient as LedgerDb } from "../../services/ledger-service/generated/client";
import { PrismaClient as AggDb } from "../../services/aggregator-service/generated/client";

const opt = (n: string, d: string) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const WALLETS = opt("wallets", "carry"), SEEDS = opt("seed-accounts", "lock");
const SEED = new Set(["admin@storeforge.dev", "demo@storeforge.dev", "buyer@storeforge.dev"]);
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} required`); return v; };

const src = new Legacy({ datasourceUrl: need("SOURCE_DATABASE_URL") + (need("SOURCE_DATABASE_URL").includes("?") ? "&" : "?") + "connection_limit=1" });
const id = new IdentityDb({ datasourceUrl: need("IDENTITY_DATABASE_URL") });
const cat = new CatalogDb({ datasourceUrl: need("CATALOG_DATABASE_URL") });
const ord = new OrderDb({ datasourceUrl: need("ORDER_DATABASE_URL") });
const led = new LedgerDb({ datasourceUrl: need("LEDGER_DATABASE_URL") });
const agg = new AggDb({ datasourceUrl: need("AGGREGATOR_DATABASE_URL") });

let fails = 0;
const check = (ok: boolean, label: string, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`); if (!ok) fails++; };
const n = (v: any) => Number(v ?? 0);

async function main() {
  await src.$executeRawUnsafe("SET default_transaction_read_only = on");
  const [users, stores, products, orders, methods, wds, ledgerRows] = await Promise.all([
    src.user.findMany(), src.store.findMany(), src.product.findMany(), src.order.findMany(),
    src.storePayoutMethod.findMany(), src.withdrawalRequest.findMany(), src.ledgerEntry.findMany(),
  ]);
  const dropped = new Set(SEEDS === "drop" ? users.filter((u) => SEED.has(u.email.toLowerCase())).map((u) => u.id) : []);
  const keepStores = stores.filter((s) => !dropped.has(s.ownerId));
  const keepIds = new Set(keepStores.map((s) => s.id));

  // identity
  const tUsers = await id.user.findMany();
  check(tUsers.filter((u) => users.some((x) => x.id === u.id)).length === users.length - dropped.size, "every kept legacy user exists");
  const byId = new Map(tUsers.map((u) => [u.id, u]));
  const hashOk = users.filter((u) => !SEED.has(u.email.toLowerCase()) && byId.get(u.id)).every((u) => byId.get(u.id)!.passwordHash === u.passwordHash && byId.get(u.id)!.role === u.role);
  check(hashOk, "non-seed users keep their exact password hash + role");
  const seedsSafe = users.filter((u) => SEED.has(u.email.toLowerCase())).every((u) => !byId.get(u.id) || (byId.get(u.id)!.passwordHash !== u.passwordHash && byId.get(u.id)!.role !== "ADMIN"));
  check(seedsSafe, "seed accounts do NOT keep their known password or ADMIN role");
  check(await id.session.count() === 0, "no sessions migrated");
  check(await id.store.count() === keepStores.length, "store count", `${await id.store.count()}/${keepStores.length}`);
  const adminCount = await id.user.count({ where: { role: "ADMIN" } });
  check(adminCount >= 1, "at least one ADMIN exists", `admins=${adminCount}`);

  // catalog
  const keepProducts = products.filter((p) => keepIds.has(p.storeId));
  check(await cat.product.count() === keepProducts.length, "product count", `${await cat.product.count()}/${keepProducts.length}`);
  const tProd = new Map((await cat.product.findMany()).map((p) => [p.id, p]));
  check(keepProducts.every((p) => tProd.get(p.id) && n(tProd.get(p.id)!.price) === n(p.price) && tProd.get(p.id)!.stock === p.stock), "product price + stock identical");

  // orders
  const keepOrders = orders.filter((o) => keepIds.has(o.storeId));
  check(await ord.order.count() === keepOrders.length, "order count", `${await ord.order.count()}/${keepOrders.length}`);
  const tOrd = new Map((await ord.order.findMany()).map((o) => [o.orderNumber, o]));
  check(keepOrders.every((o) => tOrd.get(o.orderNumber)?.status === o.status && n(tOrd.get(o.orderNumber)?.totalAmount) === n(o.totalAmount)), "order status + totals identical");

  // ledger
  const wallets = await led.wallet.findMany();
  check(wallets.length === keepStores.length, "one wallet per store", `${wallets.length}/${keepStores.length}`);
  const sums = await led.$queryRawUnsafe<any[]>(`SELECT a."storeId" s, COALESCE(SUM(p."credit"-p."debit"),0) bal FROM "LedgerAccount" a LEFT JOIN "LedgerPosting" p ON p."accountId"=a.id WHERE a.type=\x27STORE_WALLET\x27 GROUP BY a."storeId"`);
  const postedBy = new Map(sums.map((r) => [r.s, n(r.bal)]));
  check(wallets.every((w) => Math.abs(n(w.balance) - (postedBy.get(w.storeId) ?? 0)) < 0.005), "wallet balance == sum of ledger postings (reconciles)");
  const tb = await led.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM("debit"),0) d, COALESCE(SUM("credit"),0) c FROM "LedgerPosting"`);
  check(n(tb[0].d) === n(tb[0].c), "trial balance: total debits == total credits", `${n(tb[0].d)}`);
  const expect = (s: any) => (WALLETS === "carry" ? n(s.walletBalance) : 0);
  check(keepStores.every((s) => Math.abs(n(wallets.find((w) => w.storeId === s.id)?.balance) - expect(s)) < 0.005), `wallet balances are per --wallets=${WALLETS}`);
  const heldOrders = keepOrders.filter((o) => o.paymentMethod === "COD" && ["CONFIRMED", "PROCESSING", "SHIPPED"].includes(o.status));
  check((await led.hold.count({ where: { status: "HELD" } })) === heldOrders.length, "COD fee hold per in-flight COD order", `${heldOrders.length}`);
  check(await led.payoutMethod.count() === methods.filter((m) => keepIds.has(m.storeId)).length, "payout methods");
  check(await led.withdrawal.count() === wds.filter((w) => keepIds.has(w.storeId)).length, "withdrawals");
  check(await led.statementEntry.count({ where: { entryType: { not: "OPENING_BALANCE" } } }) === ledgerRows.filter((l) => keepIds.has(l.storeId)).length, "statement history copied");

  // outboxes drained -> aggregator + ledger built from events
  // notification is not part of migration correctness (and is not running in the rehearsal)
  const pending = { deliveredAt: null, consumer: { not: "notification" } };
  const undelivered = (await id.outboxMessage.count({ where: pending })) + (await cat.outboxMessage.count({ where: pending })) + (await led.outboxMessage.count({ where: pending }));
  check(undelivered === 0, "all migration events delivered", `undelivered=${undelivered}`);
  check((await agg.storeProjection.count()) === keepStores.length, "aggregator has every store", `${await agg.storeProjection.count()}/${keepStores.length}`);
  check((await agg.listingIndex.count({ where: { deleted: false } })) === keepProducts.length, "aggregator has every product", `${await agg.listingIndex.count({ where: { deleted: false } })}/${keepProducts.length}`);
  const nonActive = keepStores.filter((s) => s.status !== "ACTIVE");
  const proj = new Map((await agg.storeProjection.findMany()).map((p) => [p.storeId, p.status]));
  check(nonActive.every((s) => proj.get(s.id) === s.status), "non-ACTIVE store statuses reached the aggregator");

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  if (fails) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => Promise.allSettled([src, id, cat, ord, led, agg].map((c: any) => c.$disconnect())));
