import { publish, type EventHandler } from "../../../packages/event-bus";
import type { Db } from "./db";
import { dayStr, dhakaToday, toDate } from "./dates";
import type { LedgerGateway } from "./ledger";
import { settleCharge } from "./bookings";
import type { ActiveAds } from "./cache";

/** Store statuses in which the platform must not show the store's ads. */
export const BLOCKED_STORE = new Set(["SUSPENDED", "BANNED"]);

const ev = (b: any) => ({
  bookingId: b.id, bookingNumber: b.bookingNumber, storeId: b.storeId, ownerId: b.ownerId, headline: b.headline,
  startDate: dayStr(b.startDate), endDate: dayStr(b.endDate),
});

/**
 * The scheduler step (runs every minute, and on demand via POST /admin/ads/tick).
 * Every transition is a compare-and-swap, so overlapping runs or several instances are harmless.
 */
export async function tick(db: Db, ledger: LedgerGateway, ads: ActiveAds, now = new Date()) {
  const today = dhakaToday(now);
  const todayD = toDate(today);
  const out = { rejectedUnreviewed: 0, rejectedUncharged: 0, chargesRetried: 0, activated: 0, expired: 0 };

  // 1. Nobody reviewed it before its start date: release the dates.
  for (const b of await db.adBooking.findMany({ where: { status: "PENDING_REVIEW", startDate: { lte: todayD } } })) {
    const ok = await db.$transaction(async (tx) => {
      const r = await tx.adBooking.updateMany({
        where: { id: b.id, status: "PENDING_REVIEW" },
        data: { status: "REJECTED", reviewNote: "Not reviewed before the start date.", reviewedAt: new Date() },
      });
      if (r.count === 0) return false;
      await publish(tx as any, "ad", "AdRejected", { ...ev(b), note: "Not reviewed before the start date." }, b.storeId);
      return true;
    });
    if (ok) out.rejectedUnreviewed++;
  }

  // 2. Approved but the charge never went through: keep retrying until the campaign would be over.
  for (const b of await db.adBooking.findMany({ where: { status: "APPROVED", chargeState: "PENDING" }, take: 50, orderBy: { createdAt: "asc" } })) {
    if (dayStr(b.endDate) < today) {
      const ok = await db.$transaction(async (tx) => {
        const r = await tx.adBooking.updateMany({
          where: { id: b.id, status: "APPROVED", chargeState: "PENDING" },
          data: { status: "REJECTED", chargeState: "NONE", reviewNote: "Could not be charged before the campaign ended." },
        });
        if (r.count === 0) return false;
        await publish(tx as any, "ad", "AdRejected", { ...ev(b), note: "Could not be charged before the campaign ended." }, b.storeId);
        return true;
      });
      if (ok) out.rejectedUncharged++;
      continue;
    }
    try { await settleCharge(db, ledger, b.id, now); out.chargesRetried++; } catch { /* still unavailable: next tick */ }
  }

  // 3. Go live: charged, inside the window, store in good standing.
  const due = await db.adBooking.findMany({ where: { status: "APPROVED", chargeState: "CHARGED", startDate: { lte: todayD }, endDate: { gte: todayD } }, include: { slot: true } });
  for (const b of due) {
    const state = await db.storeAdState.findUnique({ where: { storeId: b.storeId } });
    if (state && BLOCKED_STORE.has(state.status)) continue; // stays APPROVED; goes live when the store recovers
    const ok = await db.$transaction(async (tx) => {
      const r = await tx.adBooking.updateMany({ where: { id: b.id, status: "APPROVED", chargeState: "CHARGED" }, data: { status: "ACTIVE" } });
      if (r.count === 0) return false;
      await publish(tx as any, "ad", "AdPushedToCache", { ...ev(b), slot: b.slot.code }, b.storeId);
      return true;
    });
    if (ok) out.activated++;
  }

  // 4. Over: expire (paid campaigns only; unpaid ones were handled in step 2).
  for (const b of await db.adBooking.findMany({
    where: { endDate: { lt: todayD }, OR: [{ status: { in: ["ACTIVE", "SUSPENDED"] } }, { status: "APPROVED", chargeState: "CHARGED" }] },
  })) {
    const ok = await db.$transaction(async (tx) => {
      const r = await tx.adBooking.updateMany({ where: { id: b.id, status: b.status }, data: { status: "EXPIRED" } });
      if (r.count === 0) return false;
      await publish(tx as any, "ad", "AdExpired", ev(b), b.storeId);
      return true;
    });
    if (ok) out.expired++;
  }

  await ads.refresh();
  return out;
}

/**
 * StoreStatusChanged from ledger-service. A store that is SUSPENDED/BANNED (admin actions) stops
 * showing ads immediately; they come back (if their dates still cover today) when it recovers.
 * No refund and no extension while the store is blocked.
 * Older-than-recorded events are ignored, so out-of-order delivery cannot flip the state backwards.
 */
export const storeStatusHandler = (clock: () => Date): EventHandler => async (env, tx) => {
  const storeId = String(env.data?.storeId ?? "");
  const to = String(env.data?.to ?? "");
  if (!storeId || !to) return;
  const at = new Date(env.timestamp);
  const prev = await tx.storeAdState.findUnique({ where: { storeId } });
  if (prev && prev.eventAt > at) return;
  await tx.storeAdState.upsert({ where: { storeId }, create: { storeId, status: to, eventAt: at }, update: { status: to, eventAt: at } });

  if (BLOCKED_STORE.has(to)) {
    await tx.adBooking.updateMany({ where: { storeId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
  } else {
    // Resume what is still inside its window; anything past its end date is left for the expiry step.
    await tx.adBooking.updateMany({ where: { storeId, status: "SUSPENDED", endDate: { gte: toDate(dhakaToday(clock())) } }, data: { status: "ACTIVE" } });
  }
};
