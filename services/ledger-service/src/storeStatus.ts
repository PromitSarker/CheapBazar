import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { withTx, type Db } from "./db";
import type { StoreStatus } from "../generated/client";

/**
 * Store status is ADMIN-ONLY: ACTIVE, SUSPENDED or BANNED. Nothing changes it automatically -
 * there are no balance thresholds, warning states or grace periods (removed 2026-11-11).
 * A permanent ban cannot be lifted.
 */
export async function adminChangeStatus(db: Db, storeId: string, target: StoreStatus, reason: string, admin: string) {
  await withTx(db, async (tx) => {
    await tx.$executeRaw`INSERT INTO "Wallet" ("storeId","updatedAt") VALUES (${storeId}, now()) ON CONFLICT ("storeId") DO NOTHING`;
    await tx.$queryRaw`SELECT "storeId" FROM "Wallet" WHERE "storeId" = ${storeId} FOR UPDATE`;
    const w = await tx.wallet.findUniqueOrThrow({ where: { storeId } });
    if (w.status === target) return;
    if (w.status === "BANNED") throw new HttpError(409, "A permanent ban cannot be lifted.", "BANNED");
    const note = `${reason || "Admin action"} (by ${admin})`;
    await tx.wallet.update({ where: { storeId }, data: { status: target, statusReason: note, statusChangedAt: new Date() } });
    await publish(tx as any, "ledger", "StoreStatusChanged", {
      storeId, ownerId: w.ownerId, from: w.status, to: target, reason: note, manual: true,
    }, storeId);
  });
}
