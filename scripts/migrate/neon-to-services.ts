/**
 * One-way data migration: legacy monolith database (Neon) -> the per-service databases.
 *
 *   SOURCE_DATABASE_URL        legacy DB. Only ever READ (session forced read-only).
 *   IDENTITY_DATABASE_URL, CATALOG_DATABASE_URL, ORDER_DATABASE_URL, LEDGER_DATABASE_URL   targets
 *
 *   tsx scripts/migrate/neon-to-services.ts            # dry run: validates + prints the plan, writes nothing
 *   tsx scripts/migrate/neon-to-services.ts --apply    # does it
 *
 * Options:
 *   --wallets=carry|zero        carry (default) = open each wallet at its legacy balance (faithful to today);
 *                               zero = open at 0 (the legacy default of 4850 is a promo credit, not real money)
 *   --seed-accounts=lock|drop   admin@/demo@/buyer@storeforge.dev have known weak passwords.
 *                               lock (default) = keep the row with an unusable password (admin is demoted);
 *                               drop = remove them and anything they own (aborts if they own orders)
 *   --allow-remote-target       targets must be localhost unless you say so
 *   --ignore-payments           legacy PaymentTransaction rows are NOT migrated; refuse if any exist unless set
 *   env ADMIN_EMAIL / ADMIN_PASSWORD (min 8) / ADMIN_NAME   create (or promote) the real platform admin
 *
 * Sessions are never migrated (everyone logs in again). Passwords are carried as-is (bcrypt).
 * Search + wallets are built by the services themselves from events written to the identity /
 * catalog / ledger outboxes (to ledger + aggregator ONLY - never notification, so nobody gets a
 * "welcome" message for an existing store).
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient as Legacy } from "@prisma/client";
import { PrismaClient as IdentityDb } from "../../services/identity-service/generated/client";
import { PrismaClient as CatalogDb } from "../../services/catalog-service/generated/client";
import { PrismaClient as OrderDb } from "../../services/order-service/generated/client";
import { PrismaClient as LedgerDb } from "../../services/ledger-service/generated/client";
import { normalizeDomain, normalizeSlug, validateSlug, TEMPLATES } from "../../services/identity-service/src/stores";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const APPLY = flag("apply");
const WALLETS = opt("wallets", "carry");
const SEEDS = opt("seed-accounts", "lock");
const SEED_EMAILS = new Set(["admin@storeforge.dev", "demo@storeforge.dev", "buyer@storeforge.dev"]);
if (!["carry", "zero"].includes(WALLETS)) throw new Error("--wallets must be carry|zero");
if (!["lock", "drop"].includes(SEEDS)) throw new Error("--seed-accounts must be lock|drop");

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };
const SOURCE = need("SOURCE_DATABASE_URL");
const TARGETS = {
  identity: need("IDENTITY_DATABASE_URL"), catalog: need("CATALOG_DATABASE_URL"),
  order: need("ORDER_DATABASE_URL"), ledger: need("LEDGER_DATABASE_URL"),
};
const hostOf = (u: string) => new URL(u).host + new URL(u).pathname;
for (const [k, u] of Object.entries(TARGETS)) {
  const host = new URL(u).hostname;
  if (hostOf(u) === hostOf(SOURCE)) throw new Error(`REFUSING: ${k} target is the same database as the source`);
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !flag("allow-remote-target")) {
    throw new Error(`REFUSING: ${k} target host "${host}" is not local (pass --allow-remote-target if you really mean it)`);
  }
}

const src = new Legacy({ datasourceUrl: SOURCE + (SOURCE.includes("?") ? "&" : "?") + "connection_limit=1" });
const idDb = new IdentityDb({ datasourceUrl: TARGETS.identity });
const catDb = new CatalogDb({ datasourceUrl: TARGETS.catalog });
const ordDb = new OrderDb({ datasourceUrl: TARGETS.order });
const ledDb = new LedgerDb({ datasourceUrl: TARGETS.ledger });

const problems: string[] = [];
const warn: string[] = [];
const num = (v: any) => Number(v ?? 0);
const UNUSABLE = () => bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10); // a real hash of a random secret nobody knows
const IN_FLIGHT = new Set(["CONFIRMED", "PROCESSING", "SHIPPED"]);

async function emit(tx: any, producer: string, type: string, data: any, tenantId: string, to: string[], ts: Date) {
  const eventId = crypto.randomUUID();
  const envelope = JSON.stringify({ eventId, eventType: type, timestamp: ts.toISOString(), producer, tenantId, data });
  for (const consumer of to) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "OutboxMessage" ("id","eventId","consumer","eventType","envelope") VALUES ($1,$2,$3,$4,$5::jsonb)`,
      crypto.randomUUID(), eventId, consumer, type, envelope
    );
  }
}

async function main() {
  await src.$executeRawUnsafe("SET default_transaction_read_only = on");
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}   wallets=${WALLETS}   seed-accounts=${SEEDS}`);

  // ------------------------------------------------------------------ read source
  const [users, stores, products, orders, items, payments, ledger, methods, withdrawals] = await Promise.all([
    src.user.findMany(), src.store.findMany(), src.product.findMany(), src.order.findMany(),
    src.orderItem.findMany(), src.paymentTransaction.findMany(), src.ledgerEntry.findMany(),
    src.storePayoutMethod.findMany(), src.withdrawalRequest.findMany(),
  ]);
  console.log(`source: users=${users.length} stores=${stores.length} products=${products.length} orders=${orders.length} items=${items.length} payments=${payments.length} ledger=${ledger.length} payoutMethods=${methods.length} withdrawals=${withdrawals.length}`);

  // ------------------------------------------------------------------ seed account policy
  const seedUsers = users.filter((u) => SEED_EMAILS.has(u.email.toLowerCase()));
  const droppedUserIds = new Set(SEEDS === "drop" ? seedUsers.map((u) => u.id) : []);
  const droppedStoreIds = new Set(stores.filter((s) => droppedUserIds.has(s.ownerId)).map((s) => s.id));
  for (const s of droppedStoreIds) {
    const n = orders.filter((o) => o.storeId === s).length;
    if (n) problems.push(`store ${s} is owned by a dropped seed account but has ${n} orders - use --seed-accounts=lock`);
  }
  const keepUsers = users.filter((u) => !droppedUserIds.has(u.id));
  const keepStores = stores.filter((s) => !droppedStoreIds.has(s.id));
  const keepStoreIds = new Set(keepStores.map((s) => s.id));
  const keepProducts = products.filter((p) => keepStoreIds.has(p.storeId));
  const keepOrders = orders.filter((o) => keepStoreIds.has(o.storeId));
  const storeById = new Map(keepStores.map((s) => [s.id, s]));
  const userById = new Map(keepUsers.map((u) => [u.id, u]));

  // ------------------------------------------------------------------ validation
  if (payments.length && !flag("ignore-payments")) {
    problems.push(`${payments.length} legacy PaymentTransaction rows exist; they are not migrated. Review them, then pass --ignore-payments`);
  }
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && (process.env.ADMIN_PASSWORD ?? "").length < 8 && !userById.has(users.find((u) => u.email.toLowerCase() === adminEmail)?.id ?? "")) {
    problems.push("ADMIN_PASSWORD (min 8 chars) is required to create a new admin");
  }
  const realAdmins = keepUsers.filter((u) => u.role === "ADMIN" && !SEED_EMAILS.has(u.email.toLowerCase()));
  if (!adminEmail && !realAdmins.length) {
    warn.push("NO ADMIN will exist after migration (the only legacy admin is a seed account). Set ADMIN_EMAIL + ADMIN_PASSWORD.");
  }
  const slugs = new Set<string>(), domains = new Set<string>();
  for (const s of keepStores) {
    try {
      if (normalizeSlug(s.slug) !== s.slug) throw new Error(`slug "${s.slug}" is not normalized`);
      validateSlug(s.slug);
      if (!(TEMPLATES as readonly string[]).includes(s.template)) throw new Error(`unknown template "${s.template}"`);
      if (s.customDomain && normalizeDomain(s.customDomain) !== s.customDomain) throw new Error(`custom domain "${s.customDomain}" is invalid`);
      if (slugs.has(s.slug)) throw new Error("duplicate slug");
      slugs.add(s.slug);
      if (s.customDomain) { if (domains.has(s.customDomain)) throw new Error("duplicate domain"); domains.add(s.customDomain); }
      if (!userById.has(s.ownerId)) throw new Error("owner missing");
    } catch (e: any) { problems.push(`store ${s.id} (${s.slug}): ${e.message}`); }
  }
  for (const p of keepProducts) {
    if (num(p.price) < 0 || p.stock < 0) problems.push(`product ${p.id}: negative price/stock`);
  }
  const itemsByOrder = new Map<string, typeof items>();
  for (const i of items) itemsByOrder.set(i.orderId, [...(itemsByOrder.get(i.orderId) ?? []), i]);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  for (const o of keepOrders) {
    if (o.status === "PENDING_PAYMENT") problems.push(`order ${o.orderNumber} is PENDING_PAYMENT (online) - let it finish or cancel it before migrating`);
    if (!["COD", "SSLCOMMERZ"].includes(o.paymentMethod)) problems.push(`order ${o.orderNumber}: unknown payment method ${o.paymentMethod}`);
    if (!itemsByOrder.get(o.id)?.length) warn.push(`order ${o.orderNumber} has no items`);
  }
  for (const w of withdrawals) {
    if (keepStoreIds.has(w.storeId) && ["PENDING", "PROCESSING"].includes(w.status)) {
      problems.push(`withdrawal ${w.withdrawalNumber} is ${w.status} - settle or reject it before migrating`);
    }
  }
  const keepMethods = methods.filter((m) => keepStoreIds.has(m.storeId));
  const keepWithdrawals = withdrawals.filter((w) => keepStoreIds.has(w.storeId));
  const keepLedger = ledger.filter((l) => keepStoreIds.has(l.storeId));
  for (const s of keepStores) {
    const holdSum = keepOrders.filter((o) => o.storeId === s.id && o.paymentMethod === "COD" && IN_FLIGHT.has(o.status)).reduce((a, o) => a + num(o.platformFee), 0);
    if (Math.abs(holdSum - num(s.walletHolds)) > 0.005) {
      warn.push(`store ${s.slug}: legacy walletHolds ${num(s.walletHolds)} != COD fee of in-flight orders ${holdSum}; migrating the order-derived figure`);
    }
  }

  const lockedCount = seedUsers.length;
  console.log(`plan: users ${keepUsers.length} (${SEEDS === "lock" ? lockedCount + " seed accounts locked" : seedUsers.length + " seed accounts dropped"}), stores ${keepStores.length}, products ${keepProducts.length}, orders ${keepOrders.length}, payout methods ${keepMethods.length}, withdrawals ${keepWithdrawals.length}, statement rows ${keepLedger.length}`);
  console.log(`wallets: ${keepStores.map((s) => `${s.slug}=${WALLETS === "carry" ? num(s.walletBalance) : 0}`).join(", ")}`);
  console.log(`admin: ${adminEmail ?? "(none requested)"}   sessions: dropped (${(await src.session.count())} legacy)`);
  warn.forEach((w) => console.log("WARN  " + w));
  if (problems.length) { problems.forEach((p) => console.error("BLOCKER " + p)); throw new Error(`${problems.length} blocker(s) - nothing was written`); }
  if (!APPLY) { console.log("dry run OK - nothing written. Re-run with --apply."); return; }

  // ------------------------------------------------------------------ target must be empty
  const existing = (await idDb.user.count()) + (await catDb.product.count()) + (await ordDb.order.count()) + (await ledDb.wallet.count());
  if (existing) throw new Error("REFUSING: the target service databases are not empty. Recreate them (deploy/setup.sh on fresh DBs) first.");

  const now = new Date();
  const statusOf = (s: { status: string }) => s.status;

  // ------------------------------------------------------------------ identity
  await idDb.$transaction(async (tx) => {
    for (const u of keepUsers) {
      const seed = SEED_EMAILS.has(u.email.toLowerCase());
      await tx.user.create({
        data: {
          id: u.id, email: u.email.toLowerCase(), name: u.name,
          passwordHash: seed ? UNUSABLE() : u.passwordHash,
          role: seed && u.role === "ADMIN" ? "BUYER" : (u.role as any),
          createdAt: u.createdAt,
        },
      });
    }
    if (adminEmail) {
      const found = await tx.user.findUnique({ where: { email: adminEmail } });
      if (found) {
        await tx.user.update({ where: { id: found.id }, data: { role: "ADMIN", ...(process.env.ADMIN_PASSWORD ? { passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10) } : {}) } });
      } else {
        await tx.user.create({ data: { email: adminEmail, name: process.env.ADMIN_NAME || "Platform Admin", passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10), role: "ADMIN" } });
      }
    }
    for (const s of keepStores) {
      await tx.store.create({ data: { id: s.id, name: s.name, slug: s.slug, customDomain: s.customDomain, template: s.template, kycVerified: s.kycVerified, ownerId: s.ownerId, createdAt: s.createdAt } });
      await emit(tx, "identity", "StoreCreated", { storeId: s.id, ownerId: s.ownerId, name: s.name, slug: s.slug, template: s.template, customDomain: s.customDomain }, s.id, ["ledger", "aggregator"], now);
    }
  }, { timeout: 120_000 });
  console.log("identity: done");

  // ------------------------------------------------------------------ catalog
  await catDb.$transaction(async (tx) => {
    for (const p of keepProducts) {
      await tx.product.create({ data: { id: p.id, storeId: p.storeId, name: p.name, description: p.description, price: p.price, stock: p.stock, image: p.image, channel: "RETAIL", moq: 1, createdAt: p.createdAt } });
      await emit(tx, "catalog", "ProductCreated", {
        productId: p.id, storeId: p.storeId, name: p.name, description: p.description, image: p.image,
        price: num(p.price), stock: p.stock, channel: "RETAIL", moq: 1, wholesalePrice: null, tiers: [], createdAt: p.createdAt,
      }, p.storeId, ["aggregator"], now);
    }
  }, { timeout: 120_000 });
  console.log("catalog: done");

  // ------------------------------------------------------------------ orders
  await ordDb.$transaction(async (tx) => {
    for (const o of keepOrders) {
      const st = storeById.get(o.storeId)!;
      const total = num(o.totalAmount), fee = num(o.platformFee);
      const cod = o.paymentMethod === "COD";
      const ref = payments.find((p) => p.orderId === o.id)?.tranId ?? null;
      await tx.order.create({
        data: {
          id: o.id, orderNumber: o.orderNumber, storeId: o.storeId, storeSlug: st.slug, storeName: st.name, ownerId: st.ownerId,
          buyerId: null, buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerPhone: o.buyerPhone,
          shippingAddress: o.shippingAddress, shippingCity: o.shippingCity, orderType: "RETAIL",
          paymentMethod: o.paymentMethod, paymentRef: ref, status: o.status as any,
          totalAmount: o.totalAmount, platformFee: o.platformFee, sellerNet: o.sellerNet,
          createdAt: o.createdAt, updatedAt: o.updatedAt,
          items: { create: (itemsByOrder.get(o.id) ?? []).map((i) => ({ id: i.id, productId: i.productId, productName: productName.get(i.productId) ?? "Product", quantity: i.quantity, unitPrice: i.price })) },
          feeSnapshot: { create: { orderType: "RETAIL", feePercent: total > 0 ? Math.round((fee / total) * 10000) / 100 : 0, totalAmount: o.totalAmount, platformFee: o.platformFee, sellerNet: o.sellerNet, codFeeHold: cod ? o.platformFee : 0, createdAt: o.createdAt } },
          events: { create: [{ fromStatus: null, toStatus: o.status as any, source: "SYSTEM", note: "Migrated from the previous platform", createdAt: o.updatedAt }] },
        },
      });
    }
  }, { timeout: 300_000 });
  console.log("orders: done");

  // ------------------------------------------------------------------ ledger
  await ledDb.$transaction(async (tx) => {
    const acct = async (code: string, type: string, storeId: string | null, name: string) => {
      await tx.$executeRaw`INSERT INTO "LedgerAccount" ("id","code","type","storeId","name") VALUES (${crypto.randomUUID()}, ${code}, ${type}::"LedgerAccountType", ${storeId}, ${name}) ON CONFLICT ("code") DO NOTHING`;
      return (await tx.ledgerAccount.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
    };
    const equity = await acct("PLATFORM_EQUITY", "PLATFORM_EQUITY", null, "platform equity");
    for (const s of keepStores) {
      const holds = keepOrders.filter((o) => o.storeId === s.id && o.paymentMethod === "COD" && IN_FLIGHT.has(o.status));
      const holdSum = holds.reduce((a, o) => a + num(o.platformFee), 0);
      const balance = WALLETS === "carry" ? num(s.walletBalance) : 0;
      await tx.wallet.create({ data: { storeId: s.id, ownerId: s.ownerId, balance, holds: holdSum, status: statusOf(s) as any, statusReason: statusOf(s) === "ACTIVE" ? null : "Carried over from the previous platform", createdAt: s.createdAt } });
      for (const o of holds) await tx.hold.create({ data: { storeId: s.id, reference: o.orderNumber, amount: o.platformFee, status: "HELD", createdAt: o.createdAt } });
      if (balance > 0) {
        const wid = await acct(`STORE_WALLET:${s.id}`, "STORE_WALLET", s.id, `Store wallet ${s.id}`);
        const t = await tx.ledgerTransaction.create({
          data: { kind: "OPENING_BALANCE", reference: s.id, description: "Opening balance carried over from the previous platform", idempotencyKey: `migration:opening:${s.id}`,
            postings: { create: [{ accountId: equity, debit: balance, credit: 0 }, { accountId: wid, debit: 0, credit: balance }] } },
        });
        await tx.statementEntry.create({ data: { storeId: s.id, entryType: "OPENING_BALANCE", description: "Opening balance carried over from the previous platform", credit: balance, ledgerTxId: t.id } });
      }
    }
    for (const l of keepLedger) {
      await tx.statementEntry.create({ data: { id: l.id, storeId: l.storeId, transactionId: l.transactionId, entryType: l.entryType, description: l.description, debit: l.debit, credit: l.credit, createdAt: l.createdAt } });
    }
    for (const m of keepMethods) {
      await tx.payoutMethod.create({ data: { id: m.id, storeId: m.storeId, type: m.type as any, accountType: m.accountType as any, isDefault: m.isDefault, isArchived: m.isArchived, phoneNumber: m.phoneNumber, bankName: m.bankName, branchName: m.branchName, routingNumber: m.routingNumber, accountName: m.accountName, accountNumber: m.accountNumber, coolingUntil: m.coolingUntil, createdAt: m.createdAt, updatedAt: m.updatedAt } });
    }
    for (const w of keepWithdrawals) {
      await tx.withdrawal.create({ data: { id: w.id, withdrawalNumber: w.withdrawalNumber, storeId: w.storeId, payoutMethodId: w.payoutMethodId, amount: w.amount, fee: w.fee, netAmount: w.netAmount, status: w.status as any, disbursementTxId: w.disbursementTxId, rejectionReason: w.rejectionReason, processedAt: w.processedAt, processedBy: w.processedBy, createdAt: w.createdAt, updatedAt: w.updatedAt } });
    }
    // Non-ACTIVE statuses must reach the aggregator / ad-service; the services learn them from this event.
    for (const s of keepStores) {
      if (statusOf(s) !== "ACTIVE") {
        await emit(tx, "ledger", "StoreStatusChanged", { storeId: s.id, ownerId: s.ownerId, from: "ACTIVE", to: statusOf(s), reason: "Carried over from the previous platform" }, s.id, ["ad", "aggregator"], now);
      }
    }
  }, { timeout: 120_000 });
  console.log("ledger: done");
  console.log("MIGRATION APPLIED. Start/keep the services running so the outboxes drain, then run: npm run migrate:verify");
}

main()
  .catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; })
  .finally(async () => { await Promise.allSettled([src.$disconnect(), idDb.$disconnect(), catDb.$disconnect(), ordDb.$disconnect(), ledDb.$disconnect()]); });
