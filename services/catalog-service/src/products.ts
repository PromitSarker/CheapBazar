import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { num, withTx, type Db, type Runner } from "./db";
import { parseProduct } from "./pricing";
import { resolveCategory } from "./categories";

export const snapshot = (p: any) => ({
  productId: p.id,
  storeId: p.storeId,
  name: p.name,
  description: p.description,
  image: p.image,
  images: p.images ?? [],
  categoryId: p.categoryId ?? null,
  parentCategoryId: p.parentCategoryId ?? null,
  brand: p.brand ?? null,
  unit: p.unit ?? null,
  compareAtPrice: p.compareAtPrice == null ? null : num(p.compareAtPrice),
  price: num(p.price),
  stock: p.stock,
  channel: p.channel,
  moq: p.moq,
  wholesalePrice: p.wholesalePrice == null ? null : num(p.wholesalePrice),
  tiers: (p.tiers ?? []).map((t: any) => ({ minQty: t.minQty, unitPrice: num(t.unitPrice) })).sort((a: any, b: any) => a.minQty - b.minQty),
  createdAt: p.createdAt,
});

const include = { tiers: { orderBy: { minQty: "asc" as const } } };

export async function getProduct(db: Runner, id: string) {
  const p = await db.product.findUnique({ where: { id }, include });
  if (!p) throw new HttpError(404, "Product not found", "NOT_FOUND");
  return snapshot(p);
}

export async function listProducts(db: Runner, storeId: string, q: { channel?: string; q?: string; inStock?: string }) {
  const channel = q.channel?.toUpperCase();
  const rows = await db.product.findMany({
    where: {
      storeId,
      channel: channel === "RETAIL" ? { in: ["RETAIL", "BOTH"] } : channel === "WHOLESALE" ? { in: ["WHOLESALE", "BOTH"] } : undefined,
      name: q.q ? { contains: q.q, mode: "insensitive" } : undefined,
      stock: q.inStock === "true" ? { gt: 0 } : undefined,
    },
    include,
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return rows.map(snapshot);
}

export async function createProduct(db: Db, storeId: string, body: any) {
  const input = parseProduct(body);
  return withTx(db, async (tx) => {
    const cat = input.categoryId ? await resolveCategory(tx as any, input.categoryId) : { categoryId: null, parentCategoryId: null };
    const p = await tx.product.create({
      data: {
        storeId, name: input.name, description: input.description, price: input.price, stock: input.stock, image: input.image,
        images: input.images, brand: input.brand, unit: input.unit, compareAtPrice: input.compareAtPrice, ...cat,
        channel: input.channel, moq: input.moq, wholesalePrice: input.wholesalePrice,
        tiers: { create: input.tiers },
      },
      include,
    });
    await publish(tx as any, "catalog", "ProductCreated", snapshot(p), storeId);
    return snapshot(p);
  });
}

export async function updateProduct(db: Db, id: string, body: any) {
  const storeId = String(body.storeId ?? "");
  return withTx(db, async (tx) => {
    const cur = await tx.product.findFirst({ where: { id, storeId }, include });
    if (!cur) throw new HttpError(404, "Product not found", "NOT_FOUND");
    const input = parseProduct(body, {
      name: cur.name, description: cur.description, price: num(cur.price), stock: cur.stock, image: cur.image,
      images: cur.images, categoryId: cur.categoryId, brand: cur.brand, unit: cur.unit,
      compareAtPrice: cur.compareAtPrice == null ? null : num(cur.compareAtPrice),
      channel: cur.channel, moq: cur.moq, wholesalePrice: cur.wholesalePrice == null ? null : num(cur.wholesalePrice),
      tiers: cur.tiers.map((t) => ({ minQty: t.minQty, unitPrice: num(t.unitPrice) })),
    });
    await tx.priceTier.deleteMany({ where: { productId: id } });
    // Only re-validate the category when it changed (an already-assigned category that was hidden later must not block edits).
    const cat = input.categoryId === cur.categoryId
      ? { categoryId: cur.categoryId, parentCategoryId: cur.parentCategoryId }
      : input.categoryId ? await resolveCategory(tx as any, input.categoryId) : { categoryId: null, parentCategoryId: null };
    const p = await tx.product.update({
      where: { id },
      data: {
        name: input.name, description: input.description, price: input.price, stock: input.stock, image: input.image,
        images: input.images, brand: input.brand, unit: input.unit, compareAtPrice: input.compareAtPrice, ...cat,
        channel: input.channel, moq: input.moq, wholesalePrice: input.wholesalePrice,
        tiers: { create: input.tiers },
      },
      include,
    });
    await publish(tx as any, "catalog", "ProductUpdated", snapshot(p), storeId);
    return snapshot(p);
  });
}

export async function deleteProduct(db: Db, id: string, storeId: string) {
  return withTx(db, async (tx) => {
    const cur = await tx.product.findFirst({ where: { id, storeId } });
    if (!cur) throw new HttpError(404, "Product not found", "NOT_FOUND");
    const usedByOrders = await tx.reservationItem.count({ where: { productId: id } });
    if (usedByOrders > 0) {
      // Products referenced by real orders are kept (order history); hide them instead.
      throw new HttpError(409, "This product is part of existing orders and cannot be deleted. Set its stock to 0 instead.", "IN_USE");
    }
    await tx.product.delete({ where: { id } });
    await publish(tx as any, "catalog", "ProductDeleted", { productId: id, storeId }, storeId);
    return { success: true };
  });
}

/** Seller stock correction (+/-). Never goes below zero. */
export async function adjustStock(db: Db, id: string, storeId: string, delta: number) {
  if (!Number.isInteger(delta) || Math.abs(delta) > 1_000_000) throw new HttpError(400, "delta must be a whole number", "VALIDATION");
  return withTx(db, async (tx) => {
    const n = await tx.$executeRaw`
      UPDATE "Product" SET "stock" = GREATEST("stock" + ${delta}, 0), "updatedAt" = now()
       WHERE "id" = ${id} AND "storeId" = ${storeId}`;
    if (n === 0) throw new HttpError(404, "Product not found", "NOT_FOUND");
    const p = await tx.product.findUniqueOrThrow({ where: { id }, include });
    await publish(tx as any, "catalog", "ProductUpdated", snapshot(p), storeId);
    if (p.stock === 0) await publish(tx as any, "catalog", "StockDepleted", { productId: id, storeId, name: p.name }, storeId);
    return snapshot(p);
  });
}
