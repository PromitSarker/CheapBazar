import { HttpError } from "../../../packages/service-kit";
import { MIN_RADIUS_KM, MAX_RADIUS_KM, parseCoords, type Coords } from "../../../packages/geo";
import type { Runner } from "./db";

/**
 * Location-based visibility. The admin picks whether buyers only see shops within N km of them.
 * Off (the default) = every visible shop is shown everywhere, exactly as before.
 */
export interface LocationPolicy { enabled: boolean; radiusKm: number; updatedAt: string | null; updatedBy: string | null }

const KEY = "location.radius";
const DEFAULT_RADIUS_KM = 25;

export async function getPolicy(db: Runner): Promise<LocationPolicy> {
  const row = await db.$queryRawUnsafe<{ value: any; updatedAt: Date; updatedBy: string | null }[]>(
    `SELECT "value","updatedAt","updatedBy" FROM "PlatformSetting" WHERE "key" = $1`, KEY
  );
  const v = row[0]?.value ?? {};
  const radius = Number(v.radiusKm);
  return {
    enabled: v.enabled === true,
    radiusKm: Number.isFinite(radius) && radius >= MIN_RADIUS_KM ? Math.min(radius, MAX_RADIUS_KM) : DEFAULT_RADIUS_KM,
    updatedAt: row[0]?.updatedAt ? new Date(row[0].updatedAt).toISOString() : null,
    updatedBy: row[0]?.updatedBy ?? null,
  };
}

export async function setPolicy(db: Runner, b: { enabled?: unknown; radiusKm?: unknown; admin?: unknown }): Promise<LocationPolicy> {
  const cur = await getPolicy(db);
  const enabled = b.enabled === undefined ? cur.enabled : b.enabled === true;
  let radiusKm = cur.radiusKm;
  if (b.radiusKm !== undefined) {
    radiusKm = Number(b.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm < MIN_RADIUS_KM || radiusKm > MAX_RADIUS_KM) {
      throw new HttpError(400, `The range must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`, "VALIDATION");
    }
    radiusKm = Math.round(radiusKm * 10) / 10;
  }
  const admin = String(b.admin ?? "").slice(0, 64) || null;
  await db.$executeRawUnsafe(
    `INSERT INTO "PlatformSetting" ("key","value","updatedAt","updatedBy") VALUES ($1,$2::jsonb,now(),$3)
     ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value","updatedAt"=now(),"updatedBy"=EXCLUDED."updatedBy"`,
    KEY, JSON.stringify({ enabled, radiusKm }), admin
  );
  console.log(`[aggregator] location policy enabled=${enabled} radiusKm=${radiusKm} by ${admin ?? "?"}`);
  return getPolicy(db);
}

/** The buyer's position from `lat`/`lng` query params (null when absent or not a point in Bangladesh). */
export const buyerCoords = (q: { lat?: string; lng?: string }): Coords | null => parseCoords(q.lat, q.lng);

/**
 * SQL for the distance in km between a shop row aliased `s` and the buyer, given the two placeholders that already
 * hold the buyer's lat/lng. Plain haversine, no PostGIS needed. NULL when the shop has no location.
 */
export const distanceSql = (latPh: string, lngPh: string) =>
  `(6371 * 2 * asin(LEAST(1, sqrt(power(sin(radians(s."latitude" - ${latPh}::float8) / 2), 2)
    + cos(radians(${latPh}::float8)) * cos(radians(s."latitude")) * power(sin(radians(s."longitude" - ${lngPh}::float8) / 2), 2)))))`;

export const round1 = (n: number) => Math.round(n * 10) / 10;
