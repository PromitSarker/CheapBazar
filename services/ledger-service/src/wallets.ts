import { HttpError } from "../../../packages/service-kit";
import { config } from "./config";
import { D, num, withTx, Prisma, type Runner } from "./db";
import { enforceWithin } from "./enforcer";
import {
  InsufficientFundsError,
  ensureWallet,
  postTransaction,
  publish,
  releaseFunds,
  reserveFunds,
  reverseTransaction,
} from "./ledger";

const COD_OK = new Set(["ACTIVE", "WARNING"]);
const ACCEPTS_ORDERS = new Set(["ACTIVE", "WARNING", "COD_BLOCKED"]);

export async function getWalletStatus(db: Runner, storeId: string) {
  const w = await db.wallet.findUnique({ where: { storeId } });
  const balance = num(w?.balance);
  const holds = num(w?.holds);
  const status = w?.status ?? "ACTIVE";
  const available = balance - holds;
  return {
    storeId,
    exists: !!w,
    status,
    statusReason: w?.statusReason ?? null,
    statusChangedAt: w?.statusChangedAt ?? null,
    balance,
    holds,
    available,
    withdrawable: Math.max(0, available - config.minOperatingReserve),
    codAllowed: COD_OK.has(status),
    acceptsOrders: ACCEPTS_ORDERS.has(status),
    thresholds: { soft: config.softThreshold, hard: config.hardThreshold, reserve: config.minOperatingReserve },
  };
}

// --------------------------------------------------------------- COD holds

/**
 * Place the platform-fee hold for a COD order. Atomic: succeeds only if
 * (balance - holds) >= fee and the store may still take COD. Idempotent by reference.
 */
export async function placeCodHold(db: Runner, storeId: string, reference: string, amount: number) {
  return withTx(db, async (tx) => {
    const existing = await tx.hold.findUnique({ where: { reference } });
    if (existing) return { holdId: existing.id, status: existing.status, duplicate: true };

    await ensureWallet(tx, storeId);
    const w = await tx.wallet.findUniqueOrThrow({ where: { storeId } });
    if (!COD_OK.has(w.status)) {
      throw new HttpError(409, "Cash on Delivery is unavailable for this store.", "COD_UNAVAILABLE");
    }
    if (!(await reserveFunds(tx, storeId, amount))) {
      throw new HttpError(409, "Cash on Delivery is unavailable for this store.", "COD_UNAVAILABLE");
    }
    const hold = await tx.hold.create({ data: { storeId, reference, amount: D(amount) } });
    await tx.statementEntry.create({
      data: {
        storeId,
        transactionId: reference,
        entryType: "COD_FEE_HOLD",
        description: `Platform commission hold (৳${amount}) for active COD order ${reference}`,
        debit: D(amount),
      },
    });
    await publish(tx as any, "ledger", "WalletHoldCreated", { storeId, reference, amount }, storeId);
    await enforceWithin(tx, storeId); // available just dropped
    return { holdId: hold.id, status: hold.status, duplicate: false };
  });
}

/** Delivery succeeded: convert the hold into a confirmed fee debit. */
export async function settleCodHold(db: Runner, reference: string) {
  return withTx(db, async (tx) => {
    const claimed = await tx.hold.updateMany({
      where: { reference, status: "HELD" },
      data: { status: "SETTLED", resolvedAt: new Date() },
    });
    if (claimed.count === 0) return { settled: false };
    const hold = await tx.hold.findUniqueOrThrow({ where: { reference } });
    await postTransaction(tx, {
      kind: "COD_FEE_SETTLED",
      reference,
      description: `COD Delivery Completed: Platform fee settled for ${reference}`,
      idempotencyKey: `cod-settle:${reference}`,
      postings: [
        { account: { type: "STORE_WALLET", storeId: hold.storeId }, debit: hold.amount },
        { account: { type: "PLATFORM_FEE_REVENUE" }, credit: hold.amount },
      ],
    });
    await releaseFunds(tx, hold.storeId, hold.amount);
    await publish(tx as any, "ledger", "WalletHoldSettled", { storeId: hold.storeId, reference, amount: num(hold.amount) }, hold.storeId);
    await enforceWithin(tx, hold.storeId);
    return { settled: true };
  });
}

/** Refused / cancelled: release the hold; the seller is not charged. */
export async function releaseCodHold(db: Runner, reference: string, why: string) {
  return withTx(db, async (tx) => {
    const claimed = await tx.hold.updateMany({
      where: { reference, status: "HELD" },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
    if (claimed.count === 0) return { released: false };
    const hold = await tx.hold.findUniqueOrThrow({ where: { reference } });
    await releaseFunds(tx, hold.storeId, hold.amount);
    await tx.statementEntry.create({
      data: {
        storeId: hold.storeId,
        transactionId: reference,
        entryType: "COD_HOLD_RELEASED",
        description: `COD order ${why}: fee hold released for ${reference}`,
      },
    });
    await publish(tx as any, "ledger", "WalletHoldReleased", { storeId: hold.storeId, reference, amount: num(hold.amount) }, hold.storeId);
    await enforceWithin(tx, hold.storeId);
    return { released: true };
  });
}

// ----------------------------------------------------------------- credits

export async function topUp(
  db: Runner,
  p: { storeId: string; amount: number; reference: string; method?: string; source?: "CASH" | "GATEWAY"; idempotencyKey: string }
) {
  return withTx(db, async (tx) => {
    const res = await postTransaction(tx, {
      kind: "WALLET_TOP_UP",
      reference: p.reference,
      description: `Merchant prepaid balance top-up via ${p.method ?? (p.source === "GATEWAY" ? "online gateway" : "manual payment")} (${p.reference})`,
      idempotencyKey: p.idempotencyKey,
      postings: [
        { account: { type: p.source === "GATEWAY" ? "GATEWAY_CLEARING" : "PLATFORM_CASH" }, debit: p.amount },
        { account: { type: "STORE_WALLET", storeId: p.storeId }, credit: p.amount },
      ],
    });
    if (res.created) {
      const w = await tx.wallet.findUniqueOrThrow({ where: { storeId: p.storeId } });
      await publish(tx as any, "ledger", "WalletToppedUp", { storeId: p.storeId, ownerId: w.ownerId, amount: p.amount, reference: p.reference }, p.storeId);
    }
    await enforceWithin(tx, p.storeId);
    return { ...res };
  });
}

const REVENUE = {
  AD_FEE: "PLATFORM_AD_REVENUE",
  SUBSCRIPTION: "PLATFORM_SUBSCRIPTION_REVENUE",
  PLATFORM_FEE: "PLATFORM_FEE_REVENUE",
} as const;

/** Charge a seller wallet for a platform service (ads, subscription). */
export async function chargeWallet(
  db: Runner,
  p: { storeId: string; amount: number; kind: keyof typeof REVENUE; reference: string; description: string; idempotencyKey: string }
) {
  const revenue = REVENUE[p.kind];
  if (!revenue) throw new HttpError(400, "Unknown charge kind", "VALIDATION");
  try {
    return await withTx(db, async (tx) => {
      const res = await postTransaction(tx, {
        kind: `CHARGE_${p.kind}`,
        reference: p.reference,
        description: p.description,
        entryType: p.kind,
        idempotencyKey: p.idempotencyKey,
        walletGuard: { minAvailableAfter: 0 },
        postings: [
          { account: { type: "STORE_WALLET", storeId: p.storeId }, debit: p.amount },
          { account: { type: revenue as any }, credit: p.amount },
        ],
      });
      await enforceWithin(tx, p.storeId);
      return { ledgerTxId: res.id, duplicate: !res.created };
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) {
      throw new HttpError(402, "Insufficient available wallet balance.", "INSUFFICIENT_FUNDS");
    }
    throw e;
  }
}

/**
 * Money the PLATFORM (admin) earns directly, not through a seller wallet: today the Buyer Pro
 * monthly fee. The cash side is where the buyer's money landed (online gateway clearing, or
 * bank / bKash / Nagad held by the platform); the revenue side is the platform's own account.
 * Idempotent by `reference` (one posting per real payment, however often the event is replayed).
 */
export async function recordPlatformRevenue(
  db: Runner,
  p: { source: string; amount: number; reference: string; method: "GATEWAY" | "MANUAL"; description?: string }
) {
  if (!(p.amount > 0)) throw new HttpError(400, "amount must be positive", "VALIDATION");
  return withTx(db, async (tx) =>
    postTransaction(tx, {
      kind: `PLATFORM_REVENUE_${p.source}`,
      reference: p.reference,
      description: p.description ?? `${p.source} payment ${p.reference} (${p.method === "GATEWAY" ? "online gateway" : "manual payment"})`,
      idempotencyKey: `platform-revenue:${p.reference}`,
      postings: [
        { account: { type: p.method === "GATEWAY" ? "GATEWAY_CLEARING" : "PLATFORM_CASH" }, debit: p.amount },
        { account: { type: "PLATFORM_SUBSCRIPTION_REVENUE" }, credit: p.amount },
      ],
    })
  );
}

/** A chargeback took a platform payment back: mirror the revenue posting. Idempotent; a no-op if it was never booked. */
export async function reversePlatformRevenue(db: Runner, reference: string, reason: string) {
  return withTx(db, async (tx) => {
    const original = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: `platform-revenue:${reference}` } });
    if (!original) return { reversed: false };
    const res = await reverseTransaction(tx, original.id, { reason, idempotencyKey: `platform-revenue-reverse:${reference}`, entryType: "REVERSAL" });
    return { reversed: res.created };
  });
}

// -------------------------------------------------------- online (on hold)

/** Split settlement for an online order: net to seller, fee to platform. */
export async function recordOnlineSettlement(
  db: Runner,
  p: { storeId: string; orderNumber: string; tranId: string; total: number; fee: number; net: number; method?: string }
) {
  return withTx(db, async (tx) => {
    const res = await postTransaction(tx, {
      kind: "ORDER_SPLIT_SETTLEMENT",
      reference: p.tranId,
      description: `Net settlement from Order ${p.orderNumber} via SSLCommerz (${p.method ?? "Online"})`,
      entryType: "ORDER_SPLIT_SETTLEMENT",
      idempotencyKey: `online-settle:${p.tranId}`,
      postings: [
        { account: { type: "GATEWAY_CLEARING" }, debit: p.total },
        { account: { type: "STORE_WALLET", storeId: p.storeId }, credit: p.net },
        { account: { type: "PLATFORM_FEE_REVENUE" }, credit: p.fee },
      ],
    });
    await enforceWithin(tx, p.storeId);
    return res;
  });
}

/** Refund / chargeback: reverse the settlement. Seller may go negative (= debt). */
export async function reverseOnlineSettlement(db: Runner, tranId: string, reason: string) {
  return withTx(db, async (tx) => {
    const original = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: `online-settle:${tranId}` } });
    if (!original) return { reversed: false };
    const res = await reverseTransaction(tx, original.id, { reason, idempotencyKey: `online-reverse:${tranId}`, entryType: "REFUND" });
    const accounts = await tx.ledgerPosting.findMany({ where: { transactionId: original.id }, include: { account: true } });
    const store = accounts.find((a) => a.account.storeId)?.account.storeId;
    if (store) await enforceWithin(tx, store);
    return { reversed: res.created };
  });
}

export async function getStatement(db: Runner, storeId: string, limit = 25) {
  const rows = await db.statementEntry.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 200) });
  return rows.map((e) => ({
    id: e.id,
    transactionId: e.transactionId,
    entryType: e.entryType,
    description: e.description,
    debit: e.debit ? Number(e.debit) : null,
    credit: e.credit ? Number(e.credit) : null,
    createdAt: e.createdAt,
  }));
}

export { Prisma };
