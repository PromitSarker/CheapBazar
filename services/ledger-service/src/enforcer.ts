import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { config } from "./config";
import { num, withTx, type Db, type Runner, type Tx } from "./db";
import type { StoreStatus } from "../generated/client";

/**
 * Store Status Enforcer (Diagram 2). available = balance - holds.
 *
 *   ACTIVE ─ available<soft ─► WARNING ─ available<hard ─► COD_BLOCKED
 *   ACTIVE ─ available<hard ─► COD_BLOCKED
 *   COD_BLOCKED ─ grace1 elapsed, still <hard ─► PAUSED
 *   PAUSED ─ grace2 elapsed, still <soft ─► DELISTED
 *   WARNING/COD_BLOCKED/PAUSED ─ available>=soft (top-up) ─► ACTIVE
 *   DELISTED ─ admin + available>=soft ─► ACTIVE   (never automatic)
 *   SUSPENDED / BANNED are admin-only and never touched by the daemon.
 */

export interface Thresholds {
  soft: number;
  hard: number;
  grace1Hours: number;
  grace2Hours: number;
}
export const currentThresholds = (): Thresholds => ({
  soft: config.softThreshold,
  hard: config.hardThreshold,
  grace1Hours: config.grace1Hours,
  grace2Hours: config.grace2Hours,
});

export interface Decision {
  next: StoreStatus;
  reason: string;
}

/** Pure state-machine step; null = no change. */
export function decideNextStatus(i: {
  status: StoreStatus;
  available: number;
  statusChangedAt: Date;
  now: Date;
  thresholds?: Thresholds;
}): Decision | null {
  const th = i.thresholds ?? currentThresholds();
  const hours = (i.now.getTime() - i.statusChangedAt.getTime()) / 3_600_000;
  const a = i.available;
  const money = (v: number) => `৳${v.toFixed(2)}`;
  switch (i.status) {
    case "ACTIVE":
      if (a < th.hard) return { next: "COD_BLOCKED", reason: `Available balance ${money(a)} fell below the hard threshold ${money(th.hard)}` };
      if (a < th.soft) return { next: "WARNING", reason: `Available balance ${money(a)} fell below the soft threshold ${money(th.soft)}` };
      return null;
    case "WARNING":
      if (a >= th.soft) return { next: "ACTIVE", reason: "Balance restored above the soft threshold" };
      if (a < th.hard) return { next: "COD_BLOCKED", reason: `Available balance ${money(a)} fell below the hard threshold ${money(th.hard)}` };
      return null;
    case "COD_BLOCKED":
      if (a >= th.soft) return { next: "ACTIVE", reason: "Balance restored above the soft threshold" };
      if (a >= th.hard) return { next: "WARNING", reason: "Balance recovered above the hard threshold" };
      if (hours >= th.grace1Hours) return { next: "PAUSED", reason: `Grace period 1 (${th.grace1Hours}h) ended without a top-up` };
      return null;
    case "PAUSED":
      if (a >= th.soft) return { next: "ACTIVE", reason: "Top-up received; storefront restored" };
      if (hours >= th.grace2Hours) return { next: "DELISTED", reason: `Grace period 2 (${th.grace2Hours}h) ended without a top-up` };
      return null;
    default:
      return null; // DELISTED needs an admin; SUSPENDED/BANNED are manual-only
  }
}

/**
 * Evaluate one wallet and apply the transition inside the caller's transaction
 * (so it commits atomically with whatever changed the balance).
 */
export async function enforceWithin(tx: Tx, storeId: string, now = new Date()): Promise<Decision | null> {
  await tx.$queryRaw`SELECT "storeId" FROM "Wallet" WHERE "storeId" = ${storeId} FOR UPDATE`;
  const w = await tx.wallet.findUnique({ where: { storeId } });
  if (!w) return null;
  const available = num(w.balance) - num(w.holds);
  const decision = decideNextStatus({ status: w.status, available, statusChangedAt: w.statusChangedAt, now });
  if (!decision) return null;

  await tx.wallet.update({
    where: { storeId },
    data: { status: decision.next, statusReason: decision.reason, statusChangedAt: now },
  });
  await publish(tx as any, "ledger", "StoreStatusChanged", {
    storeId, ownerId: w.ownerId, from: w.status, to: decision.next, reason: decision.reason, available,
  }, storeId);
  if (decision.next === "WARNING" || decision.next === "COD_BLOCKED") {
    await publish(tx as any, "ledger", "BalanceLow", { storeId, ownerId: w.ownerId, available, status: decision.next }, storeId);
  }
  return decision;
}

export async function enforceStore(db: Runner, storeId: string, now = new Date()) {
  return withTx(db, (tx) => enforceWithin(tx, storeId, now));
}

/** Sweep every wallet in an automatic state (called by the daemon). */
export async function enforceAll(db: Db, now = new Date()) {
  const wallets = await db.wallet.findMany({
    where: { status: { in: ["ACTIVE", "WARNING", "COD_BLOCKED", "PAUSED"] } },
    select: { storeId: true },
  });
  let changed = 0;
  for (const w of wallets) {
    try {
      if (await enforceStore(db, w.storeId, now)) changed++;
    } catch (e: any) {
      console.error("[ledger] enforcer failed for", w.storeId, e?.message);
    }
  }
  return { checked: wallets.length, changed };
}

/** Admin override: suspend / ban / reinstate / manual state. */
export async function adminChangeStatus(db: Db, storeId: string, target: StoreStatus, reason: string, admin: string) {
  await withTx(db, async (tx) => {
    await tx.$executeRaw`INSERT INTO "Wallet" ("storeId","updatedAt") VALUES (${storeId}, now()) ON CONFLICT ("storeId") DO NOTHING`;
    await tx.$queryRaw`SELECT "storeId" FROM "Wallet" WHERE "storeId" = ${storeId} FOR UPDATE`;
    const w = await tx.wallet.findUniqueOrThrow({ where: { storeId } });
    if (w.status === target) return;
    if (w.status === "BANNED") throw new HttpError(409, "A permanent ban cannot be lifted.", "BANNED");
    const available = num(w.balance) - num(w.holds);
    if (w.status === "DELISTED" && target === "ACTIVE" && available < config.softThreshold) {
      throw new HttpError(
        409,
        `Store must top up to at least ৳${config.softThreshold} available before re-listing (currently ৳${available.toFixed(2)}).`,
        "TOPUP_REQUIRED"
      );
    }
    const note = `${reason || "Admin action"} (by ${admin})`;
    await tx.wallet.update({ where: { storeId }, data: { status: target, statusReason: note, statusChangedAt: new Date() } });
    await publish(tx as any, "ledger", "StoreStatusChanged", {
      storeId, ownerId: w.ownerId, from: w.status, to: target, reason: note, available, manual: true,
    }, storeId);
    // A reinstated store settles at the status its balance actually warrants.
    if (target === "ACTIVE") await enforceWithin(tx, storeId);
  });
}
