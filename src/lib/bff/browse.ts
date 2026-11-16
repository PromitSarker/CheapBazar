/**
 * Buyer side through the services: marketplace search (aggregator-service), Buyer Pro plan and
 * status (payment-billing), live ads for the marketplace slots (ad-service).
 * Used only when USE_SERVICES=true. The wholesale paywall is decided by the aggregator from the
 * viewer id; the web tier never filters or hides prices itself.
 */
import crypto from "crypto";
import { callService, ServiceCallError } from "./client";

const q = encodeURIComponent;

export type Tab = "retail" | "wholesale";
export interface BrowseItem {
  productId: string; name: string; description: string; image: string | null;
  store: { id: string; slug: string; name: string; district?: string; distanceKm?: number }; inStock: boolean;
  images?: string[]; categoryId?: string | null; parentCategoryId?: string | null; brand?: string | null; unit?: string | null;
  compareAtPrice?: number | null; discountPct?: number;
  price?: number; stock?: number; channel?: string;
  locked?: boolean; wholesalePrice?: number; moq?: number; tiers?: { minQty: number; unitPrice: number }[];
}
/** What the buyer's position did to a request (see aggregator `LocationInfo`). */
export interface LocationInfo { enabled: boolean; radiusKm: number | null; required: boolean; applied: boolean }

export interface BrowseResult {
  tab: Tab; items: BrowseItem[]; total: number; page: number; pages: number; limit: number;
  paywall: { locked: boolean; reason: "LOGIN_REQUIRED" | "BUYER_PRO_REQUIRED" | null } | null;
  facets: {
    stores: { storeId: string; slug: string; name: string; count: number }[];
    categories?: { categoryId: string; parentCategoryId: string | null; count: number }[];
    brands?: { brand: string; count: number }[];
  };
  location: LocationInfo;
}

type Loc = { lat: number; lng: number } | null | undefined;
const locParams = (l: Loc): Record<string, string> => (l ? { lat: String(l.lat), lng: String(l.lng) } : {});

export async function searchViaServices(tab: Tab, params: Record<string, string | undefined>, viewerId?: string): Promise<BrowseResult> {
  const qs = Object.entries({ ...params, viewerId })
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${q(String(v))}`)
    .join("&");
  return callService<BrowseResult>("aggregator", "GET", `/aggregator/${tab}/search${qs ? `?${qs}` : ""}`);
}

/** One listing for a product page (retail view, or the paywalled wholesale view). 404 when hidden/missing. */
export async function productViaServices(id: string, viewerId?: string, loc?: Loc) {
  const qs = Object.entries({ viewerId, ...locParams(loc) }).filter(([, v]) => v).map(([k, v]) => `${k}=${q(String(v))}`).join("&");
  return callService<{ tab: Tab; item: BrowseItem; paywall: BrowseResult["paywall"] }>("aggregator", "GET", `/aggregator/products/${q(id)}${qs ? `?${qs}` : ""}`);
}

/** Type-ahead product names (never prices). */
export async function suggestViaServices(term: string, loc?: Loc): Promise<string[]> {
  const geo = loc ? `&lat=${q(String(loc.lat))}&lng=${q(String(loc.lng))}` : "";
  const r = await callService<{ suggestions: string[] }>("aggregator", "GET", `/aggregator/suggest?q=${q(term)}&limit=6${geo}`, undefined, { timeoutMs: 2000 });
  return r.suggestions;
}

export interface DirectoryStore {
  id: string; name: string; slug: string; template: string; customDomain: string | null; productCount: number;
  sampleProducts: { name: string; price: number }[]; district?: string; distanceKm?: number;
}

/** Shops near the buyer (nearest first when their position is known), plus what the range limit did to the request. */
export async function storeDirectoryWithLocation(limit = 8, loc?: Loc): Promise<{ stores: DirectoryStore[]; location: LocationInfo }> {
  const geo = loc ? `&lat=${q(String(loc.lat))}&lng=${q(String(loc.lng))}` : "";
  const r = await callService<{ stores: any[]; location: LocationInfo }>("aggregator", "GET", `/aggregator/stores?limit=${limit}${geo}`);
  // two sample products per store for the landing cards
  const stores = await Promise.all(
    r.stores.map(async (s) => {
      let sample: { name: string; price: number }[] = [];
      try {
        const p = await searchViaServices("retail", { storeId: s.storeId, limit: "2", ...locParams(loc) });
        sample = p.items.map((i) => ({ name: i.name, price: i.price ?? 0 }));
      } catch { /* cards still render without samples */ }
      return {
        id: s.storeId, name: s.name, slug: s.slug, template: s.template, customDomain: s.customDomain, productCount: s.productCount, sampleProducts: sample,
        ...(s.district ? { district: s.district } : {}), ...(s.distanceKm != null ? { distanceKm: s.distanceKm } : {}),
      } as DirectoryStore;
    })
  );
  return { stores, location: r.location };
}

export async function storeDirectoryViaServices(limit = 8, loc?: Loc): Promise<DirectoryStore[]> {
  return (await storeDirectoryWithLocation(limit, loc)).stores;
}

/** Live ads for a marketplace slot. An ad outage must never break the page. */
export async function marketplaceAds(slot: string): Promise<{ headline: string; imageUrl: string; targetUrl: string }[]> {
  try {
    const r = await callService<{ ads: { headline: string; imageUrl: string; targetUrl: string }[] }>("ad", "GET", `/ads/active?slot=${q(slot)}`, undefined, { timeoutMs: 1500 });
    return r.ads;
  } catch {
    return [];
  }
}

// -------------------------------------------------------------- Buyer Pro

export interface ProPlan { code: string; name: string; price: number; periodDays: number; graceDays: number }
export interface ProStatus { active: boolean; status: string; currentPeriodEnd: string | null; graceEndsAt: string | null }

export async function buyerProPlan(): Promise<ProPlan | null> {
  const r = await callService<{ plans: ProPlan[] }>("payment", "GET", "/plans");
  return r.plans.find((p) => p.code === "BUYER_PRO") ?? null;
}

export async function buyerProStatus(userId: string): Promise<ProStatus> {
  try {
    return await callService<ProStatus>("payment", "GET", `/subscriptions/buyer/${q(userId)}/status`);
  } catch {
    return { active: false, status: "UNKNOWN", currentPeriodEnd: null, graceEndsAt: null };
  }
}

export async function myProPayments(userId: string) {
  const r = await callService<{ payments: any[] }>("payment", "GET", `/admin/manual-payments?userId=${q(userId)}&limit=10`);
  return r.payments.filter((p) => p.purpose === "SUBSCRIPTION");
}

/** Buyer pays the platform by bKash/Nagad/Rocket/bank and submits the transaction id; an admin approves. */
export async function submitProPayment(userId: string, method: string, trxId: string): Promise<{ ok: true; duplicate: boolean } | { ok: false; error: string }> {
  const key = crypto.createHash("sha256").update(`pro|${userId}|${method}|${trxId.trim().toUpperCase()}`).digest("hex").slice(0, 40);
  try {
    const r = await callService<any>("payment", "POST", "/subscriptions/subscribe", {
      plan: "BUYER_PRO", method: "MANUAL", transferMethod: method, trxId, userId, idempotencyKey: key,
    });
    return { ok: true, duplicate: !!r.duplicate };
  } catch (e) {
    if (e instanceof ServiceCallError) return { ok: false, error: e.status >= 500 ? "Billing is unavailable right now. Please try again shortly." : e.message };
    throw e;
  }
}
