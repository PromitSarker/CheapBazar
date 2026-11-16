/**
 * Location policy (the admin's range limit) and per-shop visibility, from the aggregator-service.
 * Used only when USE_SERVICES=true. The aggregator enforces the range itself; this tier only reads/writes the setting
 * and asks "can this buyer see this shop?" for pages reached by link.
 */
import { callService } from "./client";
import type { Coords } from "../../../packages/geo";

const q = encodeURIComponent;

export interface LocationPolicy { enabled: boolean; radiusKm: number; updatedAt: string | null; updatedBy: string | null }

let cached: { at: number; v: LocationPolicy } | null = null;
const TTL_MS = 10_000;
const OFF: LocationPolicy = { enabled: false, radiusKm: 25, updatedAt: null, updatedBy: null };

/** Current policy. Cached for 10 s. If the aggregator is down the UI falls back to "off" (the aggregator itself never fails open). */
export async function locationPolicy(): Promise<LocationPolicy> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.v;
  try {
    const v = await callService<LocationPolicy>("aggregator", "GET", "/settings/location", undefined, { timeoutMs: 1500 });
    cached = { at: Date.now(), v };
    return v;
  } catch {
    return cached?.v ?? OFF;
  }
}

export async function setLocationPolicy(admin: string, input: { enabled?: boolean; radiusKm?: number }): Promise<LocationPolicy> {
  const v = await callService<LocationPolicy>("aggregator", "POST", "/admin/settings/location", { ...input, admin });
  cached = { at: Date.now(), v };
  return v;
}

export interface Visibility {
  found: boolean; visible: boolean;
  reason: null | "NOT_FOUND" | "LOCATION_REQUIRED" | "OUT_OF_RANGE" | "SHOP_HAS_NO_LOCATION";
  enabled: boolean; radiusKm: number | null; distanceKm: number | null; district: string | null;
}

export async function storeVisibility(slug: string, loc: Coords | null | undefined): Promise<Visibility> {
  const qs = loc ? `?lat=${q(String(loc.lat))}&lng=${q(String(loc.lng))}` : "";
  return callService<Visibility>("aggregator", "GET", `/aggregator/stores/${q(slug)}/visibility${qs}`, undefined, { timeoutMs: 2500 });
}

/** Customer-facing wording for a "not visible" answer. */
export function visibilityMessage(v: Visibility): string {
  if (v.reason === "LOCATION_REQUIRED") return "Set your location to see shops near you.";
  if (v.reason === "OUT_OF_RANGE") return `This shop is outside your area${v.radiusKm ? ` (shops are shown within ${v.radiusKm} km of you)` : ""}.`;
  return "This shop is not available in your area.";
}
