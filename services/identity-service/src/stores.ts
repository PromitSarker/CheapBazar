import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { parseCoords, districtById, nearestDistrict } from "../../../packages/geo";
import type { Db } from "./db";

export const TEMPLATES = ["classic", "modern"] as const;
const RESERVED_SLUGS = new Set([
  "www", "admin", "api", "app", "dashboard", "login", "signup", "register", "onboarding", "store", "stores",
  "browse", "cart", "checkout", "static", "uploads", "payment", "account", "auth", "cheapbazar", "cheap-bazar",
]);
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function platformHosts(): string[] {
  const extra = (process.env.PLATFORM_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ["cheap-bazar.com", "cheapbazar.com", "storeforge.dev", "localhost", ...extra];
}

export function normalizeSlug(raw: string): string {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function validateSlug(slug: string) {
  if (slug.length < 2 || slug.length > 40) throw new HttpError(400, "Store URL must be 2-40 characters (letters, numbers, hyphens).", "VALIDATION");
  if (RESERVED_SLUGS.has(slug)) throw new HttpError(400, "That store URL is reserved. Choose another.", "SLUG_RESERVED");
}

export function normalizeDomain(raw: unknown): string | null {
  const d = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d) return null;
  if (!HOST_RE.test(d)) throw new HttpError(400, "Enter a valid domain such as shop.example.com.", "VALIDATION");
  if (platformHosts().some((h) => d === h || d.endsWith(`.${h}`))) {
    throw new HttpError(400, "That domain belongs to the platform and cannot be used as a custom domain.", "VALIDATION");
  }
  return d;
}

const LOGO_RE = /^\/uploads\/[A-Za-z0-9._-]{1,100}\.(png|jpg|gif|webp)$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Validates a shop location from a request body. Coordinates must be a real point inside Bangladesh; the district is
 * taken from the request when it is a known id, otherwise it is the district whose centre is nearest to the pin.
 */
function parseLocation(b: any) {
  const c = parseCoords(b.latitude, b.longitude);
  if (!c) {
    const missing = [b.latitude, b.longitude].some((v) => v === undefined || v === null || v === "");
    throw new HttpError(
      400,
      missing ? "Pin your shop's location on the map." : "That location is not valid. Pin your shop on the map, inside Bangladesh.",
      missing ? "LOCATION_REQUIRED" : "LOCATION_INVALID"
    );
  }
  let district = nearestDistrict(c).id;
  if (b.district !== undefined && b.district !== null && String(b.district) !== "") {
    const d = districtById(b.district);
    if (!d) throw new HttpError(400, "Choose a district from the list.", "VALIDATION");
    district = d.id;
  }
  const address = String(b.address ?? "").trim().slice(0, 200) || null;
  return { latitude: Math.round(c.lat * 1e5) / 1e5, longitude: Math.round(c.lng * 1e5) / 1e5, district, address };
}

const shape = (s: any) => ({
  id: s.id, name: s.name, slug: s.slug, customDomain: s.customDomain, template: s.template,
  logoUrl: s.logoUrl ?? null, themeColor: s.themeColor ?? null,
  latitude: s.latitude ?? null, longitude: s.longitude ?? null, address: s.address ?? null, district: s.district ?? null,
  hasLocation: s.latitude != null && s.longitude != null,
  kycVerified: s.kycVerified, ownerId: s.ownerId, createdAt: s.createdAt,
});
const eventData = (s: any) => ({
  storeId: s.id, ownerId: s.ownerId, name: s.name, slug: s.slug, template: s.template, customDomain: s.customDomain,
  latitude: s.latitude ?? null, longitude: s.longitude ?? null, district: s.district ?? null,
});

export async function createStore(db: Db, b: any) {
  const ownerId = String(b.ownerId ?? "");
  const name = String(b.name ?? "").trim();
  const slug = normalizeSlug(b.slug ?? name);
  const template = String(b.template ?? "classic");
  if (!ownerId) throw new HttpError(400, "ownerId is required", "VALIDATION");
  if (!name || name.length > 80) throw new HttpError(400, "Store name is required (max 80 characters).", "VALIDATION");
  if (!(TEMPLATES as readonly string[]).includes(template)) throw new HttpError(400, "Unknown template.", "VALIDATION");
  validateSlug(slug);
  const location = parseLocation(b); // a shop cannot be opened without a place

  try {
    return await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { id: ownerId } });
      if (!owner) throw new HttpError(404, "Owner not found", "NOT_FOUND");
      if (owner.role !== "SELLER") throw new HttpError(403, "Only seller accounts can open a store.", "NOT_SELLER");
      if (await tx.store.findUnique({ where: { ownerId } })) throw new HttpError(409, "This account already has a store.", "STORE_EXISTS");
      const store = await tx.store.create({ data: { ownerId, name, slug, template, ...location, locationUpdatedAt: new Date() } });
      await publish(tx as any, "identity", "StoreCreated", eventData(store), store.id);
      return shape(store);
    });
  } catch (e: any) {
    if (e?.code === "P2002") throw new HttpError(409, "That store URL is already taken.", "SLUG_TAKEN");
    throw e;
  }
}

export async function updateStore(db: Db, storeId: string, b: any) {
  const actorId = String(b.actorId ?? "");
  const isAdmin = b.actorIsAdmin === true;
  try {
    return await db.$transaction(async (tx) => {
      const cur = await tx.store.findUnique({ where: { id: storeId } });
      if (!cur) throw new HttpError(404, "Store not found", "NOT_FOUND");
      if (!isAdmin && cur.ownerId !== actorId) throw new HttpError(403, "You do not own this store.", "FORBIDDEN");

      const data: Record<string, any> = {};
      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (!name || name.length > 80) throw new HttpError(400, "Store name is required (max 80 characters).", "VALIDATION");
        data.name = name;
      }
      if (b.slug !== undefined) {
        const slug = normalizeSlug(b.slug);
        validateSlug(slug);
        data.slug = slug;
      }
      if (b.template !== undefined) {
        if (!(TEMPLATES as readonly string[]).includes(String(b.template))) throw new HttpError(400, "Unknown template.", "VALIDATION");
        data.template = String(b.template);
      }
      if (b.customDomain !== undefined) data.customDomain = normalizeDomain(b.customDomain);
      if (b.logoUrl !== undefined) {
        // null/"" removes the logo; anything else must be one of our own uploaded images
        const v = b.logoUrl === null || b.logoUrl === "" ? null : String(b.logoUrl);
        if (v !== null && !LOGO_RE.test(v)) throw new HttpError(400, "The logo must be an uploaded PNG, JPEG, GIF or WebP image.", "VALIDATION");
        data.logoUrl = v;
      }
      if (b.themeColor !== undefined) {
        const v = b.themeColor === null || b.themeColor === "" ? null : String(b.themeColor).toLowerCase();
        if (v !== null && !COLOR_RE.test(v)) throw new HttpError(400, "The theme colour must look like #1d4ed8.", "VALIDATION");
        data.themeColor = v;
      }

      if (b.latitude !== undefined || b.longitude !== undefined || b.district !== undefined || b.address !== undefined) {
        // Changing any part of the location re-validates the whole thing (a pin is always sent with its district/address).
        Object.assign(data, parseLocation({
          latitude: b.latitude ?? cur.latitude, longitude: b.longitude ?? cur.longitude,
          district: b.district ?? (b.latitude !== undefined ? undefined : cur.district), address: b.address ?? cur.address,
        }), { locationUpdatedAt: new Date() });
      }

      const store = await tx.store.update({ where: { id: storeId }, data });
      await publish(tx as any, "identity", "StoreUpdated", eventData(store), store.id);
      if (data.customDomain !== undefined && data.customDomain !== cur.customDomain || (data.slug && data.slug !== cur.slug)) {
        await publish(tx as any, "identity", "StoreDomainUpdated", { ...eventData(store), previousSlug: cur.slug, previousDomain: cur.customDomain }, store.id);
      }
      return shape(store);
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const field = String(e.meta?.target ?? "");
      throw new HttpError(409, field.includes("customDomain") ? "That domain is already connected to another store." : "That store URL is already taken.", field.includes("customDomain") ? "DOMAIN_TAKEN" : "SLUG_TAKEN");
    }
    throw e;
  }
}

export async function setKyc(db: Db, storeId: string, verified: boolean, admin: string) {
  const s = await db.store.update({ where: { id: storeId }, data: { kycVerified: verified } }).catch(() => null);
  if (!s) throw new HttpError(404, "Store not found", "NOT_FOUND");
  console.log(`[identity] KYC store=${storeId} verified=${verified} by ${admin}`);
  return shape(s);
}

export async function resolveTenant(db: Db, q: { domain?: string; slug?: string }) {
  const host = (q.domain ?? "").trim().toLowerCase();
  const slug = (q.slug ?? "").trim().toLowerCase();
  const store = host
    ? await db.store.findUnique({ where: { customDomain: host } }) ?? (await db.store.findUnique({ where: { slug: host } }))
    : slug
    ? await db.store.findUnique({ where: { slug } })
    : null;
  if (!store) throw new HttpError(404, "Store not found", "NOT_FOUND");
  return shape(store);
}

export async function listStores(db: Db, q: { ids?: string; q?: string; limit?: string; sort?: string }) {
  const ids = q.ids ? q.ids.split(",").filter(Boolean) : undefined;
  const rows = await db.store.findMany({
    where: {
      id: ids ? { in: ids } : undefined,
      OR: q.q ? [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q, mode: "insensitive" } }] : undefined,
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(q.limit) || 100, 500),
  });
  return rows.map((s) => ({ ...shape(s), owner: s.owner }));
}
