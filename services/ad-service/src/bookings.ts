import crypto from "crypto";
import { HttpError, requireFields } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import type { Db, Runner } from "./db";
import { addDays, dayStr, daysInclusive, dhakaToday, parseDay, toDate } from "./dates";
import { isInsufficient, type LedgerGateway } from "./ledger";
import { BLOCKING, occupancy, overlapping } from "./slots";

export const OK_TO_ADVERTISE = new Set(["ACTIVE", "WARNING", "COD_BLOCKED"]);

export interface AdConfig {
  minLeadDays: number;   // earliest start = today + this (gives admins time to review)
  maxDays: number;       // longest single booking
  maxPendingPerStore: number; // pending requests hold dates, so cap how many one store can hold
}
export const defaultConfig: AdConfig = { minLeadDays: 1, maxDays: 60, maxPendingPerStore: 3 };

const round2 = (n: number) => Math.round(n * 100) / 100;
const bookingNumber = () => "AD-" + crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);

export const shapeBooking = (b: any) => ({
  id: b.id, bookingNumber: b.bookingNumber, storeId: b.storeId, slot: b.slot ? { code: b.slot.code, name: b.slot.name, placement: b.slot.placement } : undefined,
  headline: b.headline, imageUrl: b.imageUrl, targetUrl: b.targetUrl,
  startDate: dayStr(b.startDate), endDate: dayStr(b.endDate), days: b.days,
  pricePerDay: Number(b.pricePerDay), totalPrice: Number(b.totalPrice),
  status: b.status, chargeState: b.chargeState, reviewNote: b.reviewNote, reviewedAt: b.reviewedAt, createdAt: b.createdAt,
});

function validUrl(v: unknown, name: string, allowPath: boolean): string {
  const s = String(v ?? "").trim();
  if (s.length < 1 || s.length > 500) throw new HttpError(400, `${name} is required (max 500 chars)`, "VALIDATION");
  if (allowPath && s.startsWith("/") && !s.startsWith("//")) return s;
  let u: URL;
  try { u = new URL(s); } catch { throw new HttpError(400, `${name} must be a valid https URL`, "VALIDATION"); }
  if (u.protocol !== "https:") throw new HttpError(400, `${name} must use https`, "VALIDATION");
  return s;
}

/**
 * Creative image: either an https URL, or a file the platform itself stored under /uploads/
 * (a generated name + a real image extension). Anything else with a leading slash is refused,
 * so a path can never point at an arbitrary file or another host.
 */
const OWN_UPLOAD = /^\/uploads\/[A-Za-z0-9-]{8,64}\.(png|jpg|gif|webp)$/;
function validImage(v: unknown): string {
  const s = String(v ?? "").trim();
  if (OWN_UPLOAD.test(s)) return s;
  return validUrl(s, "imageUrl", false);
}

/** The ledger is a separate service: its being down must stop the action, never silently allow it. */
async function standing(ledger: LedgerGateway, storeId: string) {
  try {
    return await ledger.walletStatus(storeId);
  } catch (e: any) {
    throw new HttpError(503, "Billing is unavailable right now; try again shortly.", "BILLING_UNAVAILABLE", { cause: e?.message });
  }
}

// ------------------------------------------------------------------ create

export async function createBooking(db: Db, ledger: LedgerGateway, cfg: AdConfig, body: any, now = new Date()) {
  requireFields(body, ["slot", "storeId", "ownerId", "headline", "imageUrl", "targetUrl", "startDate", "endDate"]);
  const storeId = String(body.storeId);
  const ownerId = String(body.ownerId);
  const headline = String(body.headline).trim();
  if (headline.length < 3 || headline.length > 80) throw new HttpError(400, "headline must be 3-80 characters", "VALIDATION");
  const imageUrl = validImage(body.imageUrl);
  const targetUrl = validUrl(body.targetUrl, "targetUrl", true);
  const startDate = parseDay(body.startDate, "startDate");
  const endDate = parseDay(body.endDate, "endDate");
  const idemKey = body.idempotencyKey ? `${storeId}:${String(body.idempotencyKey).slice(0, 100)}` : null;

  if (idemKey) {
    const existing = await db.adBooking.findUnique({ where: { idempotencyKey: idemKey }, include: { slot: true } });
    if (existing) return { booking: shapeBooking(existing), duplicate: true };
  }

  const today = dhakaToday(now);
  if (startDate < addDays(today, cfg.minLeadDays)) {
    throw new HttpError(400, `startDate must be on or after ${addDays(today, cfg.minLeadDays)}`, "VALIDATION");
  }
  if (endDate < startDate) throw new HttpError(400, "endDate must not be before startDate", "VALIDATION");
  const days = daysInclusive(startDate, endDate);
  if (days > cfg.maxDays) throw new HttpError(400, `A booking can be at most ${cfg.maxDays} days`, "VALIDATION");

  const slot = await db.adSlot.findUnique({ where: { code: String(body.slot) } });
  if (!slot || !slot.active) throw new HttpError(404, "Ad slot not found", "SLOT_NOT_FOUND");
  const total = round2(Number(slot.pricePerDay) * days);

  const w = await standing(ledger, storeId);
  if (!w.exists) throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");
  if (!OK_TO_ADVERTISE.has(w.status)) {
    throw new HttpError(403, `A store in status ${w.status} cannot book ads`, "STORE_NOT_ELIGIBLE");
  }
  // Early, friendly check. The authoritative charge happens atomically at approval.
  if (w.available < total) throw new HttpError(402, `Insufficient wallet balance: this booking costs ৳${total}.`, "INSUFFICIENT_FUNDS", { required: total, available: w.available });

  try {
    const created = await db.$transaction(async (tx) => {
      // Serialise all bookings on this slot, so two requests can never both take the last place.
      await tx.$queryRaw`SELECT "id" FROM "AdSlot" WHERE "id" = ${slot.id} FOR UPDATE`;

      const pending = await tx.adBooking.count({ where: { storeId, status: "PENDING_REVIEW" } });
      if (pending >= cfg.maxPendingPerStore) {
        throw new HttpError(429, `You already have ${pending} ads awaiting review.`, "TOO_MANY_PENDING");
      }

      const rows = await overlapping(tx, slot.id, startDate, endDate);
      if (rows.some((r) => r.storeId === storeId)) {
        throw new HttpError(409, "Your store already has an ad in this slot on some of these dates.", "ALREADY_BOOKED");
      }
      const occ = occupancy(rows, startDate, endDate);
      const full = [...occ].find(([, n]) => n >= slot.capacity);
      if (full) throw new HttpError(409, `This slot is fully booked on ${full[0]}.`, "SLOT_UNAVAILABLE", { date: full[0] });

      const b = await tx.adBooking.create({
        data: {
          bookingNumber: bookingNumber(), slotId: slot.id, storeId, ownerId, headline, imageUrl, targetUrl,
          startDate: toDate(startDate), endDate: toDate(endDate), days, pricePerDay: slot.pricePerDay, totalPrice: total,
          idempotencyKey: idemKey,
        },
        include: { slot: true },
      });
      await publish(tx as any, "ad", "AdBookingRequested", {
        bookingId: b.id, bookingNumber: b.bookingNumber, storeId, ownerId, headline, slot: slot.name,
        startDate, endDate, total,
      }, storeId);
      return b;
    });
    return { booking: shapeBooking(created), duplicate: false };
  } catch (e: any) {
    // Concurrent retries with the same idempotency key: the loser (which fails on the unique key or on
    // the winner's dates) returns the winner's booking instead of an error.
    if (idemKey) {
      const existing = await db.adBooking.findUnique({ where: { idempotencyKey: idemKey }, include: { slot: true } });
      if (existing) return { booking: shapeBooking(existing), duplicate: true };
    }
    throw e;
  }
}

// ------------------------------------------------------------ read / cancel

export async function listBookings(db: Db, f: { storeId?: string; status?: string; limit?: number }) {
  const rows = await db.adBooking.findMany({
    where: { storeId: f.storeId || undefined, status: (f.status as any) || undefined },
    include: { slot: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(f.limit || 50, 200),
  });
  return rows.map(shapeBooking);
}

/** Scoped by storeId: a merchant can only ever see their own booking (others look like 404). */
export async function getBooking(db: Db, id: string, storeId?: string) {
  const b = await db.adBooking.findUnique({ where: { id }, include: { slot: true } });
  if (!b || (storeId !== undefined && b.storeId !== storeId)) throw new HttpError(404, "Booking not found", "NOT_FOUND");
  return shapeBooking(b);
}

/** Only a booking nobody has reviewed (so nobody has been charged) can be withdrawn. */
export async function cancelBooking(db: Db, id: string, storeId: string) {
  const b = await db.adBooking.findUnique({ where: { id } });
  if (!b || b.storeId !== storeId) throw new HttpError(404, "Booking not found", "NOT_FOUND");
  const r = await db.adBooking.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { status: "CANCELLED" } });
  if (r.count === 0) {
    throw new HttpError(409, "Only ads still awaiting review can be cancelled.", "NOT_CANCELLABLE", { status: (await db.adBooking.findUnique({ where: { id } }))?.status });
  }
  return getBooking(db, id, storeId);
}

// ------------------------------------------------------------------ review

export async function reviewBooking(db: Db, ledger: LedgerGateway, p: { id: string; decision: string; admin: string; note?: string }, now = new Date()) {
  if (!["APPROVE", "REJECT"].includes(p.decision)) throw new HttpError(400, "decision must be APPROVE or REJECT", "VALIDATION");
  if (!p.admin) throw new HttpError(400, "admin is required", "VALIDATION");
  const note = p.note ? String(p.note).slice(0, 500) : null;
  const b = await db.adBooking.findUnique({ where: { id: p.id } });
  if (!b) throw new HttpError(404, "Booking not found", "NOT_FOUND");

  if (p.decision === "REJECT") {
    if (!note) throw new HttpError(400, "A note explaining the rejection is required", "VALIDATION");
    await rejectIf(db, { id: p.id, from: { status: "PENDING_REVIEW" }, note, admin: p.admin });
    return { booking: await getBooking(db, p.id), charged: false };
  }

  // APPROVE. Re-approving an approved-but-uncharged booking just retries the charge.
  const today = dhakaToday(now);
  if (b.status === "APPROVED" && b.chargeState === "PENDING") return settleCharge(db, ledger, p.id, now);
  if (b.status !== "PENDING_REVIEW") throw new HttpError(409, `Booking is already ${b.status}`, "NOT_PENDING");
  if (dayStr(b.startDate) <= today) throw new HttpError(409, "The start date has already arrived; reject it so the merchant can rebook.", "DATES_PASSED");

  const claimed = await db.adBooking.updateMany({
    where: { id: p.id, status: "PENDING_REVIEW" },
    data: { status: "APPROVED", chargeState: "PENDING", reviewedBy: p.admin, reviewNote: note, reviewedAt: new Date() },
  });
  if (claimed.count === 0) throw new HttpError(409, "Booking was just reviewed by someone else", "NOT_PENDING");
  return settleCharge(db, ledger, p.id, now);
}

/** CAS reject (publishes AdRejected exactly once, however many callers race). */
async function rejectIf(db: Db, p: { id: string; from: { status: string; chargeState?: string }; note: string; admin?: string }) {
  const done = await db.$transaction(async (tx) => {
    const r = await tx.adBooking.updateMany({
      where: { id: p.id, status: p.from.status as any, ...(p.from.chargeState ? { chargeState: p.from.chargeState as any } : {}) },
      data: { status: "REJECTED", chargeState: "NONE", reviewNote: p.note, reviewedBy: p.admin, reviewedAt: new Date() },
    });
    if (r.count === 0) return false;
    const b = await tx.adBooking.findUniqueOrThrow({ where: { id: p.id } });
    await publish(tx as any, "ad", "AdRejected", {
      bookingId: b.id, bookingNumber: b.bookingNumber, storeId: b.storeId, ownerId: b.ownerId, headline: b.headline, note: p.note,
    }, b.storeId);
    return true;
  });
  if (!done) throw new HttpError(409, "Booking is no longer awaiting review", "NOT_PENDING");
}

/**
 * Charge an APPROVED booking through the ledger (idempotent by booking number).
 *  - charged            -> CHARGED, AdApproved published, goes live when its start date arrives
 *  - not enough funds /
 *    store not in good standing -> REJECTED with an explanation (the dates are released)
 *  - ledger unreachable -> stays APPROVED/PENDING; the worker keeps retrying, we answer 503
 */
export async function settleCharge(db: Db, ledger: LedgerGateway, id: string, now = new Date()) {
  const b = await db.adBooking.findUnique({ where: { id } });
  if (!b) throw new HttpError(404, "Booking not found", "NOT_FOUND");
  if (b.status !== "APPROVED" || b.chargeState !== "PENDING") return { booking: await getBooking(db, id), charged: b.chargeState === "CHARGED" };

  const reject = async (note: string) => {
    await rejectIf(db, { id, from: { status: "APPROVED", chargeState: "PENDING" }, note }).catch((e) => {
      if (!(e instanceof HttpError && e.code === "NOT_PENDING")) throw e;
    });
    return { booking: await getBooking(db, id), charged: false, rejectedReason: note };
  };

  let w;
  try {
    w = await ledger.walletStatus(b.storeId);
  } catch (e: any) {
    throw new HttpError(503, "Approved, but billing is unavailable; the charge will be retried automatically.", "CHARGE_PENDING", { cause: e?.message });
  }
  if (!OK_TO_ADVERTISE.has(w.status)) return reject(`Store is ${w.status}; ads cannot run.`);

  let res: { ledgerTxId: string; duplicate: boolean };
  try {
    res = await ledger.charge({
      storeId: b.storeId, amount: Number(b.totalPrice), reference: b.bookingNumber,
      description: `Ad ${b.bookingNumber}: "${b.headline}" ${dayStr(b.startDate)}..${dayStr(b.endDate)}`, idempotencyKey: `ad:${b.bookingNumber}`,
    });
  } catch (e: any) {
    if (isInsufficient(e)) return reject("Insufficient wallet balance at approval time. Top up and book again.");
    throw new HttpError(503, "Approved, but the charge could not be completed yet; it will be retried automatically.", "CHARGE_PENDING", { cause: e?.message });
  }

  await db.$transaction(async (tx) => {
    const r = await tx.adBooking.updateMany({
      where: { id, status: "APPROVED", chargeState: "PENDING" },
      data: { chargeState: "CHARGED", ledgerTxId: res.ledgerTxId },
    });
    if (r.count === 0) return; // someone else finished it first
    await publish(tx as any, "ad", "AdApproved", {
      bookingId: b.id, bookingNumber: b.bookingNumber, storeId: b.storeId, ownerId: b.ownerId, headline: b.headline,
      startDate: dayStr(b.startDate), endDate: dayStr(b.endDate), total: Number(b.totalPrice), note: b.reviewNote ?? undefined,
    }, b.storeId);
  });
  return { booking: await getBooking(db, id), charged: true };
}

export { BLOCKING };
export type { Runner };
