/**
 * Ads through ad-service: slots and bookings for sellers, moderation for admins, and the
 * sponsored banner shown on storefronts. Used only when USE_SERVICES=true.
 * Pricing, date collisions, the wallet charge and expiry are all decided by the service.
 */
import crypto from "crypto";
import { callService, ServiceCallError } from "./client";

const q = encodeURIComponent;

export interface AdSlot { code: string; name: string; placement: string; capacity: number; pricePerDay: number }
export interface AdBooking {
  id: string; bookingNumber: string; storeId: string; slot?: { code: string; name: string; placement: string };
  headline: string; imageUrl: string; targetUrl: string; startDate: string; endDate: string; days: number;
  pricePerDay: number; totalPrice: number; status: string; chargeState: string; reviewNote: string | null; createdAt: string;
}
export interface Sponsored { headline: string; imageUrl: string; targetUrl: string }

export async function adSlotsViaServices(): Promise<AdSlot[]> {
  const r = await callService<{ slots: AdSlot[] }>("ad", "GET", "/ads/slots");
  return r.slots;
}

export async function storeBookingsViaServices(storeId: string): Promise<AdBooking[]> {
  const r = await callService<{ bookings: AdBooking[] }>("ad", "GET", `/ads/bookings?storeId=${q(storeId)}&limit=50`);
  return r.bookings;
}

/** { ok:true, bookingNumber } or { ok:false, error } with the service's customer-facing message. */
export async function bookAdViaServices(input: {
  storeId: string; ownerId: string; slot: string; headline: string; imageUrl: string; targetUrl: string; startDate: string; endDate: string;
}): Promise<{ ok: true; bookingNumber: string } | { ok: false; error: string }> {
  // the same form submitted twice (double click) maps to one booking
  const idempotencyKey = crypto.createHash("sha256").update([input.slot, input.startDate, input.endDate, input.headline, input.imageUrl].join("|")).digest("hex").slice(0, 40);
  try {
    const r = await callService<{ booking: AdBooking }>("ad", "POST", "/ads/bookings", { ...input, idempotencyKey });
    return { ok: true, bookingNumber: r.booking.bookingNumber };
  } catch (e) {
    if (e instanceof ServiceCallError) {
      return { ok: false, error: e.status >= 500 ? "Ads are unavailable right now. Please try again shortly." : e.message };
    }
    throw e;
  }
}

export async function cancelAdViaServices(storeId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await callService("ad", "POST", `/ads/bookings/${q(id)}/cancel`, { storeId });
    return { ok: true };
  } catch (e) {
    if (e instanceof ServiceCallError) return { ok: false, error: e.status >= 500 ? "Ads are unavailable right now." : e.message };
    throw e;
  }
}

/** The banner for a storefront: a live ad from another store (an advertiser's own page shows none). */
export async function sponsoredForStorefront(ownStoreId: string): Promise<Sponsored | null> {
  try {
    const r = await callService<{ ads: (Sponsored & { storeId: string })[] }>("ad", "GET", "/ads/active?slot=STOREFRONT_BANNER", undefined, { timeoutMs: 1500 });
    const pool = r.ads.filter((a) => a.storeId !== ownStoreId);
    if (!pool.length) return null;
    const a = pool[Math.floor(Math.random() * pool.length)];
    return { headline: a.headline, imageUrl: a.imageUrl, targetUrl: a.targetUrl };
  } catch {
    return null; // an ad outage must never break a storefront
  }
}

// ------------------------------------------------------------------- admin

export async function adminBookingsViaServices(status?: string) {
  const r = await callService<{ bookings: AdBooking[] }>("ad", "GET", `/admin/ads/bookings${status ? `?status=${q(status)}&` : "?"}limit=100`);
  const ids = Array.from(new Set(r.bookings.map((b) => b.storeId)));
  const stores = ids.length
    ? await callService<{ stores: { id: string; name: string; slug: string }[] }>("identity", "GET", `/stores?ids=${q(ids.join(","))}&limit=500`)
    : { stores: [] };
  const byId = new Map(stores.stores.map((s) => [s.id, s]));
  return r.bookings.map((b) => ({ ...b, storeName: byId.get(b.storeId)?.name ?? "(unknown store)", storeSlug: byId.get(b.storeId)?.slug ?? "" }));
}

export async function reviewAdViaServices(id: string, decision: "APPROVE" | "REJECT", admin: string, note?: string) {
  return callService<any>("ad", "PATCH", `/admin/ads/${q(id)}/review`, { decision, admin, note });
}
