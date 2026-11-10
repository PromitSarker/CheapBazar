import { HttpError, requireFields } from "../../../packages/service-kit";
import type { Db, Runner } from "./db";
import { addDays, dayStr, daysInclusive, eachDay, parseDay, toDate } from "./dates";

/** Bookings in these states hold their dates (a pending request reserves the slot too). */
export const BLOCKING = ["PENDING_REVIEW", "APPROVED", "ACTIVE", "SUSPENDED"] as const;

export const shapeSlot = (s: any) => ({
  id: s.id, code: s.code, name: s.name, placement: s.placement, capacity: s.capacity, pricePerDay: Number(s.pricePerDay), active: s.active,
});

/** Day -> number of blocking bookings running that day, for [from, to]. */
export function occupancy(rows: { startDate: Date; endDate: Date }[], from: string, to: string): Map<string, number> {
  const m = new Map<string, number>(eachDay(from, to).map((d) => [d, 0]));
  for (const r of rows) {
    const s = dayStr(r.startDate) < from ? from : dayStr(r.startDate);
    const e = dayStr(r.endDate) > to ? to : dayStr(r.endDate);
    for (const d of eachDay(s, e)) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

export async function overlapping(db: Runner, slotId: string, from: string, to: string) {
  return db.adBooking.findMany({
    where: { slotId, status: { in: [...BLOCKING] }, startDate: { lte: toDate(to) }, endDate: { gte: toDate(from) } },
    select: { storeId: true, startDate: true, endDate: true },
  });
}

export async function availability(db: Db, code: string, from: string, to: string) {
  from = parseDay(from, "from");
  to = parseDay(to, "to");
  if (to < from) throw new HttpError(400, "to must not be before from", "VALIDATION");
  if (daysInclusive(from, to) > 92) throw new HttpError(400, "Range too long (max 92 days)", "VALIDATION");
  const slot = await db.adSlot.findUnique({ where: { code } });
  if (!slot) throw new HttpError(404, "Slot not found", "SLOT_NOT_FOUND");
  const occ = occupancy(await overlapping(db, slot.id, from, to), from, to);
  return {
    slot: shapeSlot(slot),
    days: [...occ].map(([date, booked]) => ({ date, booked, free: Math.max(0, slot.capacity - booked) })),
  };
}

export async function upsertSlot(db: Db, body: any) {
  requireFields(body, ["code", "name", "placement", "capacity", "pricePerDay"]);
  const code = String(body.code);
  if (!/^[A-Z0-9_]{3,40}$/.test(code)) throw new HttpError(400, "code must be 3-40 chars of A-Z, 0-9 and _", "VALIDATION");
  if (!["AGGREGATOR", "STOREFRONT"].includes(body.placement)) throw new HttpError(400, "placement must be AGGREGATOR or STOREFRONT", "VALIDATION");
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) throw new HttpError(400, "capacity must be an integer 1-20", "VALIDATION");
  const price = Math.round(Number(body.pricePerDay) * 100) / 100;
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) throw new HttpError(400, "pricePerDay must be a positive number", "VALIDATION");
  const data = { name: String(body.name).slice(0, 80), placement: body.placement, capacity, pricePerDay: price, active: body.active !== false };
  // Existing bookings keep the price they were booked at (it is locked on the booking row).
  return shapeSlot(await db.adSlot.upsert({ where: { code }, create: { code, ...data }, update: data }));
}

/** Placeholder starting inventory; admins tune prices/capacity via POST /admin/ads/slots. Only seeds an empty table. */
export async function seedDefaultSlots(db: Db) {
  if ((await db.adSlot.count()) > 0) return false;
  const defaults = [
    { code: "HOME_HERO", name: "Marketplace home - hero banner", placement: "AGGREGATOR", capacity: 3, pricePerDay: 1500 },
    { code: "BROWSE_TOP", name: "Browse page - top banner", placement: "AGGREGATOR", capacity: 2, pricePerDay: 800 },
    { code: "BROWSE_SIDEBAR", name: "Browse page - sidebar", placement: "AGGREGATOR", capacity: 4, pricePerDay: 300 },
    { code: "STOREFRONT_BANNER", name: "Storefront - sponsored banner", placement: "STOREFRONT", capacity: 2, pricePerDay: 400 },
  ];
  for (const d of defaults) await upsertSlot(db, d);
  return true;
}

export { addDays };
