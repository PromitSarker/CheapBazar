import crypto from "crypto";
import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { config } from "./config";
import { asHttpError, type Deps } from "./deps";
import { num, round2, withTx, type Db, type Runner } from "./db";

// ------------------------------------------------------------------ shaping

export function shapeOrder(o: any) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    storeId: o.storeId,
    storeSlug: o.storeSlug,
    storeName: o.storeName,
    buyerId: o.buyerId,
    buyerName: o.buyerName,
    buyerEmail: o.buyerEmail,
    buyerPhone: o.buyerPhone,
    shippingAddress: o.shippingAddress,
    shippingCity: o.shippingCity,
    orderType: o.orderType,
    paymentMethod: o.paymentMethod,
    paymentRef: o.paymentRef,
    status: o.status,
    totalAmount: num(o.totalAmount),
    platformFee: num(o.platformFee),
    sellerNet: num(o.sellerNet),
    reservationExpiresAt: o.reservationExpiresAt,
    courierName: o.courierName,
    trackingNumber: o.trackingNumber,
    items: (o.items ?? []).map((i: any) => ({
      productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: num(i.unitPrice),
    })),
    events: o.events?.map((e: any) => ({ from: e.fromStatus, to: e.toStatus, source: e.source, note: e.note, at: e.createdAt })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export const eventData = (o: any) => ({
  orderId: o.id,
  orderNumber: o.orderNumber,
  storeId: o.storeId,
  storeSlug: o.storeSlug,
  ownerId: o.ownerId,
  buyerId: o.buyerId,
  buyerName: o.buyerName,
  buyerPhone: o.buyerPhone,
  orderType: o.orderType,
  paymentMethod: o.paymentMethod,
  paymentRef: o.paymentRef,
  total: num(o.totalAmount),
  fee: num(o.platformFee),
  net: num(o.sellerNet),
  status: o.status,
});

const include = { items: true, feeSnapshot: true } as const;

// -------------------------------------------------------------- validation

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,16}$/;

export interface CheckoutInput {
  storeId?: string;
  storeSlug?: string;
  orderType: "RETAIL" | "WHOLESALE";
  paymentMethod: "COD" | "SSLCOMMERZ";
  buyer: { id?: string | null; name: string; email?: string; phone: string };
  shipping: { address: string; city: string };
  items: Array<{ productId: string; quantity: number }>;
  idempotencyKey?: string;
}

export function parseCheckout(b: any): CheckoutInput {
  const buyer = b.buyer ?? {};
  const shipping = b.shipping ?? {};
  const name = String(buyer.name ?? "").trim();
  const phone = String(buyer.phone ?? "").trim();
  const address = String(shipping.address ?? "").trim();
  if (!b.storeId && !b.storeSlug) throw new HttpError(400, "Missing required order information", "VALIDATION");
  if (!name || name.length > 120) throw new HttpError(400, "Buyer name is required.", "VALIDATION");
  if (!PHONE_RE.test(phone)) throw new HttpError(400, "Enter a valid phone number.", "VALIDATION");
  if (address.length < 3 || address.length > 500) throw new HttpError(400, "A delivery address is required.", "VALIDATION");
  const email = String(buyer.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.", "VALIDATION");

  const paymentMethod = String(b.paymentMethod ?? "COD").toUpperCase();
  if (paymentMethod !== "COD" && paymentMethod !== "SSLCOMMERZ") throw new HttpError(400, "Unsupported payment method.", "VALIDATION");
  const orderType = String(b.orderType ?? "RETAIL").toUpperCase();
  if (orderType !== "RETAIL" && orderType !== "WHOLESALE") throw new HttpError(400, "Unknown order type.", "VALIDATION");

  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 100) throw new HttpError(400, "Your bag is empty.", "VALIDATION");
  const merged = new Map<string, number>();
  for (const it of b.items) {
    const id = it?.productId ?? it?.id;
    if (!id || typeof it.quantity !== "number" || !Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 100_000) {
      throw new HttpError(400, "Invalid product quantity in bag. Must be a positive whole number.", "VALIDATION");
    }
    merged.set(String(id), (merged.get(String(id)) ?? 0) + it.quantity);
  }
  const key = b.idempotencyKey ? String(b.idempotencyKey).slice(0, 100) : undefined;
  return {
    storeId: b.storeId ? String(b.storeId) : undefined,
    storeSlug: b.storeSlug ? String(b.storeSlug) : undefined,
    orderType: orderType as any,
    paymentMethod: paymentMethod as any,
    buyer: { id: buyer.id ? String(buyer.id) : null, name, email, phone },
    shipping: { address, city: String(shipping.city ?? "Dhaka").trim().slice(0, 80) || "Dhaka" },
    items: [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity })),
    idempotencyKey: key,
  };
}

const newOrderNumber = () => `ORD-${crypto.randomBytes(5).toString("hex").slice(0, 8).toUpperCase()}`;

// ------------------------------------------------------------------- saga

/**
 * Checkout saga (Diagram 4). Each step has a compensating action:
 *
 *   1 persist order (PLACING)           -> cancel row
 *   2 catalog.reserve (15 min hold)     -> catalog.release
 *   3 COD: ledger.placeHold(fee)        -> ledger.releaseHold
 *   4 COD: catalog.commit               -> (nothing: stock already sold)
 *   5 CAS PLACING -> CONFIRMED | PENDING_PAYMENT, publish OrderCreated
 *
 * A crash anywhere leaves the order in PLACING; `recoverStuckOrders` compensates it.
 */
export async function createOrder(db: Db, deps: Deps, raw: unknown) {
  const input = parseCheckout(raw);

  // ---- idempotency: same key => same order, never a second charge/reservation
  if (input.idempotencyKey) {
    const prior = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
    if (prior) return { ...shapeOrder(prior), duplicate: true };
  }

  if (input.paymentMethod === "SSLCOMMERZ" && !config.onlinePaymentsEnabled) {
    throw new HttpError(400, "Online payment is temporarily unavailable. Please choose Cash on Delivery.", "ONLINE_DISABLED");
  }

  try {
    const store = await deps.identity.getStore({ id: input.storeId, slug: input.storeSlug });
    if (!store) throw new HttpError(404, "Store not found", "STORE_NOT_FOUND");

    if (input.buyer.id && input.buyer.id === store.ownerId) {
      throw new HttpError(403, "You cannot purchase from your own store.", "SELF_PURCHASE");
    }

    const wallet = await deps.ledger.walletStatus(store.id);
    if (!wallet.acceptsOrders) {
      throw new HttpError(403, "This store is currently not accepting orders due to platform policy.", "STORE_NOT_ACCEPTING");
    }
    if (input.paymentMethod === "COD" && !wallet.codAllowed) {
      throw new HttpError(409, "Cash on Delivery is unavailable for this store.", "COD_UNAVAILABLE");
    }

    if (input.orderType === "WHOLESALE") {
      if (!input.buyer.id) throw new HttpError(401, "Log in with a Pro account to place a wholesale order.", "LOGIN_REQUIRED");
      if (!(await deps.billing.buyerProActive(input.buyer.id))) {
        throw new HttpError(403, "A Buyer Pro plan is required for wholesale orders.", "PRO_REQUIRED");
      }
    }

    // ---- prices come from the catalog, never from the client
    const quote = await deps.catalog.quote({ storeId: store.id, orderType: input.orderType, items: input.items });
    const total = round2(quote.subtotal);

    if (input.orderType === "WHOLESALE" && input.paymentMethod === "COD" && total > config.wholesaleCodCap) {
      throw new HttpError(
        409,
        config.onlinePaymentsEnabled
          ? `Wholesale orders above ৳${config.wholesaleCodCap} must be paid online.`
          : `Wholesale orders above ৳${config.wholesaleCodCap} must be prepaid, and online payment is temporarily unavailable. Please split the order or contact support.`,
        "PREPAID_REQUIRED"
      );
    }

    const feePercent = config.platformFeePercent;
    const fee = round2((total * feePercent) / 100);
    const net = round2(total - fee);
    const cod = input.paymentMethod === "COD";
    const orderNumber = newOrderNumber();
    const ttl = config.reservationMinutes;

    // ---- step 1: persist (PLACING)
    let order;
    try {
      order = await db.order.create({
        data: {
          orderNumber,
          storeId: store.id, storeSlug: store.slug, storeName: store.name, ownerId: store.ownerId,
          buyerId: input.buyer.id, buyerName: input.buyer.name,
          buyerEmail: input.buyer.email || `${input.buyer.phone.replace(/\D/g, "")}@storeforge.buyer`,
          buyerPhone: input.buyer.phone,
          shippingAddress: input.shipping.address, shippingCity: input.shipping.city,
          orderType: input.orderType, paymentMethod: input.paymentMethod, status: "PLACING",
          totalAmount: total, platformFee: fee, sellerNet: net,
          idempotencyKey: input.idempotencyKey,
          reservationExpiresAt: new Date(Date.now() + ttl * 60_000),
          items: { create: quote.lines.map((l) => ({ productId: l.productId, productName: l.name, quantity: l.quantity, unitPrice: l.unitPrice })) },
          feeSnapshot: { create: { orderType: input.orderType, feePercent, totalAmount: total, platformFee: fee, sellerNet: net, codFeeHold: cod ? fee : 0 } },
          events: { create: { toStatus: "PLACING", source: "SYSTEM", note: "Checkout started" } },
        },
        include,
      });
    } catch (e: any) {
      if (e?.code === "P2002" && input.idempotencyKey) {
        // lost a race with the same idempotency key: return the winner
        const prior = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include });
        if (prior) return { ...shapeOrder(prior), duplicate: true };
      }
      throw e;
    }

    // ---- steps 2-4 with compensation
    try {
      await deps.catalog.reserve({ orderRef: orderNumber, storeId: store.id, items: input.items, ttlMinutes: ttl });
      if (cod) {
        await deps.ledger.placeHold(store.id, orderNumber, fee);
        await deps.catalog.commit(orderNumber);
      }
    } catch (e) {
      await compensate(deps, store.id, orderNumber, cod);
      await cancelPlacing(db, order.id, `Checkout failed: ${(e as any)?.message ?? e}`);
      throw e;
    }

    // ---- step 5: finalize
    const finalStatus = cod ? "CONFIRMED" : "PENDING_PAYMENT";
    const done = await withTx(db, async (tx) => {
      const r = await tx.order.updateMany({
        where: { id: order.id, status: "PLACING" },
        data: { status: finalStatus, reservationExpiresAt: cod ? null : order.reservationExpiresAt },
      });
      if (r.count === 0) throw new HttpError(409, "Order was cancelled while being placed.", "ORDER_CANCELLED");
      await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: "PLACING", toStatus: finalStatus, source: "SYSTEM", note: cod ? "COD order placed" : "Awaiting online payment" } });
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include });
      await publish(tx as any, "order", "OrderCreated", eventData(fresh), store.id);
      if (cod) await publish(tx as any, "order", "OrderConfirmed", eventData(fresh), store.id);
      else await publish(tx as any, "order", "OrderPaymentPending", eventData(fresh), store.id);
      return fresh;
    });
    return { ...shapeOrder(done), duplicate: false };
  } catch (e) {
    throw asHttpError(e);
  }
}

/**
 * Undo whatever the saga may have done. We cannot know whether a call that timed
 * out actually succeeded remotely, so BOTH releases are always attempted; they are
 * idempotent (releasing something that was never taken is a harmless no-op).
 */
async function compensate(deps: Deps, storeId: string, orderNumber: string, cod: boolean) {
  if (cod) await deps.ledger.releaseHold(storeId, orderNumber, "checkout failed").catch((e) => console.error("[order] hold release failed:", e?.message));
  await deps.catalog.release(orderNumber).catch((e) => console.error("[order] stock release failed:", e?.message));
}

async function cancelPlacing(db: Runner, orderId: string, note: string) {
  await withTx(db, async (tx) => {
    const r = await tx.order.updateMany({ where: { id: orderId, status: "PLACING" }, data: { status: "CANCELLED" } });
    if (r.count) await tx.orderEvent.create({ data: { orderId, fromStatus: "PLACING", toStatus: "CANCELLED", source: "SYSTEM", note: note.slice(0, 300) } });
  });
}

/**
 * Recovery: orders stuck in PLACING (process crashed mid-saga) are rolled back by
 * releasing whatever they managed to take. Both releases are idempotent.
 */
export async function recoverStuckOrders(db: Db, deps: Deps, now = new Date()) {
  const cutoff = new Date(now.getTime() - config.placingTimeoutSeconds * 1000);
  const stuck = await db.order.findMany({ where: { status: "PLACING", createdAt: { lt: cutoff } }, take: 100 });
  let recovered = 0;
  for (const o of stuck) {
    try {
      await deps.ledger.releaseHold(o.storeId, o.orderNumber, "checkout recovery");
      await deps.catalog.release(o.orderNumber);
      await cancelPlacing(db, o.id, "Recovered: checkout did not complete");
      recovered++;
    } catch (e: any) {
      console.error("[order] recovery failed for", o.orderNumber, e?.message);
    }
  }
  return { stuck: stuck.length, recovered };
}

/** Online orders whose 15-minute payment window ran out are cancelled (stock returns via event). */
export async function expireUnpaid(db: Db, now = new Date()) {
  const due = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: now } },
    select: { id: true },
    take: 200,
  });
  let cancelled = 0;
  const { transition } = await import("./transitions");
  for (const d of due) {
    try {
      await transition(db, d.id, { to: "CANCELLED", source: "SYSTEM", note: "Payment window expired" });
      cancelled++;
    } catch (e: any) {
      if (e?.code !== "INVALID_TRANSITION") console.error("[order] expiry failed:", e?.message);
    }
  }
  return { due: due.length, cancelled };
}

// ------------------------------------------------------------------ queries

export async function getOrder(db: Runner, ref: { id?: string; orderNumber?: string }) {
  const o = await db.order.findFirst({
    where: ref.id ? { id: ref.id } : { orderNumber: ref.orderNumber },
    include: { items: true, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!o) throw new HttpError(404, "Order not found", "NOT_FOUND");
  return shapeOrder(o);
}

export async function listOrders(db: Runner, where: { storeId?: string; buyerId?: string; status?: string }, limit = 50) {
  const rows = await db.order.findMany({
    where: { storeId: where.storeId, buyerId: where.buyerId, status: where.status ? (where.status as any) : { not: "PLACING" } },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map(shapeOrder);
}
