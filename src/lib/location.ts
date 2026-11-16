/**
 * The buyer's chosen position on the website. Stored in a plain cookie (`cb_loc`) as `lat_lng_label`, rounded to ~110 m:
 * it is a convenience for filtering what the buyer sees, not an identity, and it is never sent to sellers.
 * The label is a district id or "gps".
 */
import { cookies } from "next/headers";
import { parseCoords, districtById, type Coords } from "../../packages/geo";

export const LOC_COOKIE = "cb_loc";

export interface BuyerLocation extends Coords { label: string }

export function parseLocCookie(raw: string | undefined | null): BuyerLocation | null {
  if (!raw) return null;
  const [lat, lng, label = "gps"] = decodeURIComponent(raw).split("_");
  const c = parseCoords(lat, lng);
  if (!c) return null;
  return { ...c, label: label === "gps" || districtById(label) ? label : "gps" };
}

export function getBuyerLocation(): BuyerLocation | null {
  try {
    return parseLocCookie(cookies().get(LOC_COOKIE)?.value);
  } catch {
    return null; // outside a request (tests, static rendering)
  }
}

/** Query params for the aggregator / mobile API. */
export const locQuery = (l: Coords | null | undefined): { lat?: string; lng?: string } => (l ? { lat: String(l.lat), lng: String(l.lng) } : {});
