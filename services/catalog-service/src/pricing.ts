import { HttpError } from "../../../packages/service-kit";

export interface Tier {
  minQty: number;
  unitPrice: number;
}

/** Wholesale unit price for a quantity: highest tier whose minQty <= qty, else the base wholesale price. */
export function wholesaleUnitPrice(base: number, tiers: Tier[], qty: number): number {
  let best: Tier | null = null;
  for (const t of tiers) if (t.minQty <= qty && (!best || t.minQty > best.minQty)) best = t;
  return best ? best.unitPrice : base;
}

const money = (v: unknown, name: string, max = 10_000_000): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new HttpError(400, `${name} must be a positive amount`, "VALIDATION");
  return Math.round(n * 100) / 100;
};
const int = (v: unknown, name: string, min: number, max: number): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} must be a whole number between ${min} and ${max}`, "VALIDATION");
  return n;
};

export interface ProductInput {
  name: string;
  description: string;
  price: number;
  stock: number;
  image: string | null;
  images: string[];
  categoryId: string | null;
  brand: string | null;
  unit: string | null;
  compareAtPrice: number | null;
  channel: "RETAIL" | "WHOLESALE" | "BOTH";
  moq: number;
  wholesalePrice: number | null;
  tiers: Tier[];
}

/** Validate + normalise a create/patch payload. `cur` supplies defaults for PATCH. */
export function parseProduct(b: any, cur?: Partial<ProductInput>): ProductInput {
  const name = String(b.name ?? cur?.name ?? "").trim();
  if (!name || name.length > 140) throw new HttpError(400, "Product name is required (max 140 characters).", "VALIDATION");
  const description = String(b.description ?? cur?.description ?? "").trim().slice(0, 4000);
  const price = money(b.price ?? cur?.price, "price");
  const stock = int(b.stock ?? cur?.stock ?? 0, "stock", 0, 10_000_000);

  const validImage = (v: unknown): string => {
    const u = String(v ?? "");
    if (!u || u.length > 500 || !(u.startsWith("/uploads/") || /^https:\/\//.test(u))) {
      throw new HttpError(400, "Images must be uploaded files or https URLs.", "VALIDATION");
    }
    return u;
  };
  let image: string | null = b.image === undefined ? cur?.image ?? null : b.image || null;
  if (image) image = validImage(image);
  let images: string[] = cur?.images ?? (image ? [image] : []);
  if (b.images !== undefined) {
    if (!Array.isArray(b.images) || b.images.length > 8) throw new HttpError(400, "images must be a list of at most 8 pictures.", "VALIDATION");
    images = [...new Set<string>((b.images as unknown[]).map(validImage))];
    if (images.length) image = images[0]; // the gallery decides the cover
    else image = b.image === undefined ? null : image;
  } else if (b.image !== undefined) {
    // legacy single-image callers: the cover replaces slot 0
    images = image ? [image, ...images.filter((i) => i !== image)].slice(0, 8) : [];
  }
  if (image && !images.includes(image)) images = [image, ...images].slice(0, 8);

  const brand = b.brand === undefined ? cur?.brand ?? null : String(b.brand ?? "").trim().slice(0, 60) || null;
  const unit = b.unit === undefined ? cur?.unit ?? null : String(b.unit ?? "").trim().slice(0, 30) || null;
  const categoryId = b.categoryId === undefined ? cur?.categoryId ?? null : String(b.categoryId ?? "").trim() || null;
  let compareAtPrice: number | null = cur?.compareAtPrice ?? null;
  if (b.compareAtPrice !== undefined) compareAtPrice = b.compareAtPrice === null || b.compareAtPrice === "" || Number(b.compareAtPrice) === 0 ? null : money(b.compareAtPrice, "compareAtPrice");
  if (compareAtPrice !== null && compareAtPrice <= price) {
    throw new HttpError(400, "The original (crossed-out) price must be higher than the selling price.", "VALIDATION");
  }

  const channel = String(b.channel ?? cur?.channel ?? "RETAIL").toUpperCase() as ProductInput["channel"];
  if (!["RETAIL", "WHOLESALE", "BOTH"].includes(channel)) throw new HttpError(400, "Unknown sales channel.", "VALIDATION");

  const wholesale = channel !== "RETAIL";
  let moq = 1;
  let wholesalePrice: number | null = null;
  let tiers: Tier[] = [];
  if (wholesale) {
    moq = int(b.moq ?? cur?.moq ?? 1, "moq", 1, 100_000);
    wholesalePrice = money(b.wholesalePrice ?? cur?.wholesalePrice, "wholesalePrice");
    tiers = (b.tiers ?? cur?.tiers ?? []).map((t: any) => ({
      minQty: int(t.minQty, "tier minQty", 2, 1_000_000),
      unitPrice: money(t.unitPrice, "tier unitPrice"),
    }));
    tiers.sort((a, c) => a.minQty - c.minQty);
    for (let i = 0; i < tiers.length; i++) {
      if (i > 0 && tiers[i].minQty === tiers[i - 1].minQty) throw new HttpError(400, "Duplicate tier quantity.", "VALIDATION");
      if (tiers[i].minQty <= moq) throw new HttpError(400, "Tier quantities must be above the minimum order quantity.", "VALIDATION");
      const prev = i === 0 ? wholesalePrice : tiers[i - 1].unitPrice;
      if (tiers[i].unitPrice >= prev) throw new HttpError(400, "Volume tiers must get cheaper as quantity grows.", "VALIDATION");
    }
  }
  return { name, description, price, stock, image, images, categoryId, brand, unit, compareAtPrice, channel, moq, wholesalePrice, tiers };
}
