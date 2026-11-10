import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { num, withTx, type Db, type Runner, type Tx } from "./db";
import { snapshot } from "./products";
import { wholesaleUnitPrice } from "./pricing";

/**
 * Stock reservation engine (Diagram 4 saga participant).
 *
 *   reserve  : atomically takes units out of Product.stock (all items or none)
 *   commit   : the order is confirmed; units are permanently sold
 *   release  : compensating action - returns units (checkout failed / timed out)
 *   restock  : returns units of a COMMITTED order (cancelled / refused delivery)
 *
 * Every transition is a compare-and-swap on the reservation status, so retries,
 * duplicate events and the expiry job can never return the same units twice.
 */

export interface ItemInput {
  productId: string;
  quantity: number;
}

export function parseItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "At least one item is required.", "VALIDATION");
  const merged = new Map<string, number>();
  for (const it of raw as any[]) {
    const q = it?.quantity;
    if (!it?.productId || typeof q !== "number" || !Number.isInteger(q) || q <= 0 || q > 100_000) {
      throw new HttpError(400, "Invalid product quantity. Must be a positive whole number.", "VALIDATION");
    }
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + q);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
}

async function emitStockChange(tx: Tx, storeId: string, productIds: string[], before: Map<string, number>) {
  const rows = await tx.product.findMany({ where: { id: { in: productIds } }, include: { tiers: true } });
  for (const p of rows) {
    await publish(tx as any, "catalog", "ProductUpdated", snapshot(p), storeId);
    if (p.stock === 0 && (before.get(p.id) ?? 0) > 0) {
      await publish(tx as any, "catalog", "StockDepleted", { productId: p.id, storeId, name: p.name }, storeId);
    }
  }
}

export async function reserve(
  db: Db,
  p: { orderRef: string; storeId: string; items: unknown; ttlMinutes?: number | null; autoCommit?: boolean }
) {
  const items = parseItems(p.items);
  if (!p.orderRef) throw new HttpError(400, "orderRef is required", "VALIDATION");

  return withTx(db, async (tx) => {
    const existing = await tx.stockReservation.findUnique({ where: { orderRef: p.orderRef } });
    if (existing) {
      if (existing.status === "RELEASED") throw new HttpError(409, "This reservation was already released.", "RESERVATION_RELEASED");
      return { reservationId: existing.id, status: existing.status, expiresAt: existing.expiresAt, duplicate: true };
    }

    const before = new Map<string, number>();
    const short: Array<{ productId: string; requested: number; available: number }> = [];
    for (const it of items) {
      const prod = await tx.product.findFirst({ where: { id: it.productId, storeId: p.storeId }, select: { stock: true } });
      if (!prod) throw new HttpError(400, "Some products are invalid or no longer available.", "INVALID_PRODUCT");
      before.set(it.productId, prod.stock);
      const n = await tx.$executeRaw`
        UPDATE "Product" SET "stock" = "stock" - ${it.quantity}, "updatedAt" = now()
         WHERE "id" = ${it.productId} AND "storeId" = ${p.storeId} AND "stock" >= ${it.quantity}`;
      if (n === 0) {
        const cur = await tx.product.findUnique({ where: { id: it.productId }, select: { stock: true } });
        short.push({ productId: it.productId, requested: it.quantity, available: cur?.stock ?? 0 });
      }
    }
    if (short.length) {
      // Throwing rolls back every decrement made above: all-or-nothing.
      throw new HttpError(409, "Some items are out of stock.", "OUT_OF_STOCK", { items: short });
    }

    const commit = p.autoCommit === true;
    const ttl = commit ? null : Math.max(1, Math.min(Number(p.ttlMinutes) || 15, 24 * 60));
    const res = await tx.stockReservation.create({
      data: {
        orderRef: p.orderRef,
        storeId: p.storeId,
        status: commit ? "COMMITTED" : "HELD",
        expiresAt: ttl ? new Date(Date.now() + ttl * 60_000) : null,
        resolvedAt: commit ? new Date() : null,
        items: { create: items },
      },
    });
    await publish(tx as any, "catalog", "StockReserved", { orderRef: p.orderRef, storeId: p.storeId, items }, p.storeId);
    await emitStockChange(tx, p.storeId, items.map((i) => i.productId), before);
    return { reservationId: res.id, status: res.status, expiresAt: res.expiresAt, duplicate: false };
  });
}

export async function commit(db: Db, orderRef: string) {
  return withTx(db, async (tx) => {
    const r = await tx.stockReservation.updateMany({
      where: { orderRef, status: "HELD", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      data: { status: "COMMITTED", expiresAt: null, resolvedAt: new Date() },
    });
    if (r.count === 1) return { committed: true };
    const cur = await tx.stockReservation.findUnique({ where: { orderRef } });
    if (!cur) throw new HttpError(404, "Reservation not found", "NOT_FOUND");
    if (cur.status === "COMMITTED") return { committed: true, duplicate: true };
    throw new HttpError(409, "Reservation expired or was released.", "RESERVATION_EXPIRED");
  });
}

async function giveBack(tx: Tx, orderRef: string, from: Array<"HELD" | "COMMITTED">): Promise<boolean> {
  const claimed = await tx.stockReservation.updateMany({
    where: { orderRef, status: { in: from } },
    data: { status: "RELEASED", resolvedAt: new Date() },
  });
  if (claimed.count === 0) return false;
  const res = await tx.stockReservation.findUniqueOrThrow({ where: { orderRef }, include: { items: true } });
  const before = new Map<string, number>();
  for (const it of res.items) {
    await tx.$executeRaw`UPDATE "Product" SET "stock" = "stock" + ${it.quantity}, "updatedAt" = now() WHERE "id" = ${it.productId}`;
  }
  await publish(tx as any, "catalog", "StockReleased", { orderRef, storeId: res.storeId, items: res.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) }, res.storeId);
  await emitStockChange(tx, res.storeId, res.items.map((i) => i.productId), before);
  return true;
}

/** Compensating action for a HELD reservation (checkout failed / abandoned). */
export async function release(db: Runner, orderRef: string) {
  return withTx(db, async (tx) => ({ released: await giveBack(tx, orderRef, ["HELD"]) }));
}

/** Return the units of a cancelled/refused order, whether still held or already committed. */
export async function restock(db: Runner, orderRef: string) {
  return withTx(db, async (tx) => ({ restocked: await giveBack(tx, orderRef, ["HELD", "COMMITTED"]) }));
}

/** Janitor: release every HELD reservation whose time ran out. */
export async function expireReservations(db: Db, now = new Date()) {
  const due = await db.stockReservation.findMany({
    where: { status: "HELD", expiresAt: { lt: now } },
    select: { orderRef: true },
    take: 200,
  });
  let released = 0;
  for (const d of due) if ((await release(db, d.orderRef)).released) released++;
  return { due: due.length, released };
}

// -------------------------------------------------------------------- pricing

/**
 * Server-side price quote used by the checkout saga: prices come from here and
 * only from here (never from the client). Enforces channel, MOQ, tiers, stock.
 */
export async function quote(db: Runner, p: { storeId: string; orderType: "RETAIL" | "WHOLESALE"; items: unknown }) {
  const items = parseItems(p.items);
  const products = await db.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, storeId: p.storeId },
    include: { tiers: true },
  });
  if (products.length !== items.length) throw new HttpError(400, "Some products are invalid or no longer available.", "INVALID_PRODUCT");

  const wholesale = p.orderType === "WHOLESALE";
  const lines = items.map((it) => {
    const prod = products.find((x) => x.id === it.productId)!;
    const sellsHere = wholesale ? prod.channel !== "RETAIL" : prod.channel !== "WHOLESALE";
    if (!sellsHere) {
      throw new HttpError(400, `"${prod.name}" is not available for ${wholesale ? "wholesale" : "retail"} purchase.`, "WRONG_CHANNEL");
    }
    if (wholesale && it.quantity < prod.moq) {
      throw new HttpError(400, `"${prod.name}" has a minimum order quantity of ${prod.moq}.`, "MOQ_NOT_MET", { productId: prod.id, moq: prod.moq });
    }
    if (prod.stock < it.quantity) {
      throw new HttpError(409, `Insufficient stock for "${prod.name}". Only ${prod.stock} available.`, "OUT_OF_STOCK", { items: [{ productId: prod.id, requested: it.quantity, available: prod.stock }] });
    }
    const unit = wholesale
      ? wholesaleUnitPrice(num(prod.wholesalePrice), prod.tiers.map((t) => ({ minQty: t.minQty, unitPrice: num(t.unitPrice) })), it.quantity)
      : num(prod.price);
    return {
      productId: prod.id,
      name: prod.name,
      quantity: it.quantity,
      unitPrice: unit,
      lineTotal: Math.round(unit * it.quantity * 100) / 100,
      moq: prod.moq,
    };
  });
  const subtotal = Math.round(lines.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
  return { storeId: p.storeId, orderType: p.orderType, currency: "BDT", lines, subtotal };
}
