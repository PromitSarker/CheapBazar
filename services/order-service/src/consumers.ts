import type { EventHandler } from "../../../packages/event-bus";
import type { Db } from "./db";
import type { Deps } from "./deps";
import { transition } from "./transitions";

/**
 * Events order-service consumes. Handlers are tolerant: an event for an order that
 * is already past the relevant state is a no-op, never an error (events can arrive
 * late, twice, or out of order).
 */
export function buildHandlers(db: Db, deps: Deps): Record<string, EventHandler> {
  const byNumber = (n: string) => db.order.findUnique({ where: { orderNumber: n }, select: { id: true, status: true } });

  return {
    // payment-billing-service: online payment captured
    PaymentCaptured: async (env, tx) => {
      const d = env.data;
      if (d.purpose !== "STORE_ORDER") return;
      const o = await byNumber(d.orderNumber);
      if (!o) return;
      if (o.status === "PENDING_PAYMENT") {
        await deps.catalog.commit(d.orderNumber); // stock becomes permanent
        await transition(tx, o.id, { to: "CONFIRMED", source: "SYSTEM", note: `Paid online (${d.tranId})`, paymentRef: d.tranId });
      } else if (o.status === "CANCELLED") {
        // Money arrived for an order that already expired: needs a manual refund.
        console.warn(`[order] LATE PAYMENT for cancelled order ${d.orderNumber} (${d.tranId}) - refund required`);
        await tx.orderEvent.create({ data: { orderId: o.id, fromStatus: "CANCELLED", toStatus: "CANCELLED", source: "SYSTEM", note: `Late payment ${d.tranId} received after cancellation - refund required` } });
      }
    },

    PaymentFailed: async (env, tx) => {
      const o = await byNumber(env.data.orderNumber);
      if (o?.status === "PENDING_PAYMENT") {
        await transition(tx, o.id, { to: "CANCELLED", source: "SYSTEM", note: `Payment failed (${env.data.reason ?? "gateway"})` });
      }
    },

    // notification-service (courier integration): shipment status webhook
    ShipmentUpdated: async (env, tx) => {
      const d = env.data;
      const o = await byNumber(d.orderNumber);
      if (!o) return;
      const to = String(d.status).toUpperCase();
      if (!["SHIPPED", "DELIVERED", "REFUSED"].includes(to)) return;
      try {
        // A courier may report SHIPPED for an order we never marked processing: allow CONFIRMED->SHIPPED.
        await transition(tx, o.id, { to: to as any, source: "COURIER", actor: d.courier, courier: d.courier, trackingNumber: d.trackingNumber, note: `Courier update${d.eventRef ? ` (${d.eventRef})` : ""}` });
      } catch (e: any) {
        if (e?.code !== "INVALID_TRANSITION") throw e; // stale / out-of-order update: ignore
      }
    },
  };
}
