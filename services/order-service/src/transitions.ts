import { HttpError } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { config } from "./config";
import { withTx, type Runner } from "./db";
import { eventData, shapeOrder } from "./orders";

/**
 * Order state machine. Money and stock effects are NOT done here: each transition
 * publishes an event and the owning service reacts (ledger settles/releases the
 * COD hold, catalog restocks). That keeps order-service the single writer of order
 * state while staying eventually consistent with the rest.
 */
export type Status = "PLACING" | "PENDING_PAYMENT" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUSED";
export type Source = "SELLER" | "COURIER" | "ADMIN" | "SYSTEM" | "BUYER";

const FLOW: Record<Status, Status[]> = {
  PLACING: [],
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "REFUSED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUSED: [],
};

const EVENT_FOR: Partial<Record<Status, string>> = {
  CONFIRMED: "OrderConfirmed",
  SHIPPED: "OrderShipped",
  DELIVERED: "OrderDelivered",
  CANCELLED: "OrderCancelled",
  REFUSED: "OrderRefused",
};

function allowed(source: Source, from: Status, to: Status, order: { buyerId: string | null }, actor?: string): string | null {
  if (!FLOW[from].includes(to)) return `Cannot move an order from ${from} to ${to}.`;
  switch (source) {
    case "ADMIN":
      return null;
    case "SYSTEM":
      return null;
    case "COURIER":
      return ["SHIPPED", "DELIVERED", "REFUSED"].includes(to) ? null : "Couriers can only report shipping outcomes.";
    case "SELLER":
      if (to === "CONFIRMED") return "Sellers cannot confirm payment.";
      if ((to === "DELIVERED" || to === "REFUSED") && !config.allowSellerFinalize) {
        return "Delivery outcomes are reported by the courier.";
      }
      return null;
    case "BUYER":
      if (to !== "CANCELLED") return "Buyers can only cancel.";
      if (!order.buyerId || order.buyerId !== actor) return "Only the buyer who placed this order can cancel it.";
      return null;
  }
}

export async function transition(
  db: Runner,
  orderId: string,
  p: { to: Status; source: Source; actor?: string; storeId?: string; note?: string; trackingNumber?: string; courier?: string; paymentRef?: string }
) {
  return withTx(db, async (tx) => {
    const cur = await tx.order.findUnique({ where: { id: orderId } });
    // A seller may only ever see/act on their own store's orders.
    if (!cur || (p.source === "SELLER" && cur.storeId !== p.storeId)) throw new HttpError(404, "Order not found", "NOT_FOUND");

    if (cur.status === p.to && ["DELIVERED", "CANCELLED", "REFUSED"].includes(cur.status)) {
      return { ...shapeOrder(cur), unchanged: true }; // idempotent replay (e.g. duplicate courier webhook)
    }
    const why = allowed(p.source, cur.status as Status, p.to, cur, p.actor);
    if (why) throw new HttpError(409, why, "INVALID_TRANSITION");

    // compare-and-swap: concurrent updates cannot both win
    const r = await tx.order.updateMany({
      where: { id: orderId, status: cur.status },
      data: {
        status: p.to,
        courierName: p.courier ?? undefined,
        trackingNumber: p.trackingNumber ?? undefined,
        paymentRef: p.paymentRef ?? undefined,
        reservationExpiresAt: p.to === "CONFIRMED" ? null : undefined,
      },
    });
    if (r.count === 0) throw new HttpError(409, "The order was updated by someone else. Refresh and try again.", "CONFLICT");

    await tx.orderEvent.create({
      data: { orderId, fromStatus: cur.status, toStatus: p.to, source: p.source, actor: p.actor, note: p.note },
    });
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    const evt = EVENT_FOR[p.to];
    if (evt) await publish(tx as any, "order", evt, eventData(fresh), fresh.storeId);
    return { ...shapeOrder(fresh), previousStatus: cur.status, unchanged: false };
  });
}
