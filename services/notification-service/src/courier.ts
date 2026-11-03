import crypto from "crypto";
import { HttpError, RateLimiter, safeEqual } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import type { Db } from "./db";

/**
 * Courier webhook receiver (public through the gateway; authenticated by HMAC).
 *
 * Signature:  x-timestamp: <unix seconds>   x-signature: hex(HMAC_SHA256(secret, `${ts}.${rawBody}`))
 *             (a `sha256=` prefix is accepted). Requests older/newer than 5 minutes are rejected.
 * Secret:     COURIER_WEBHOOK_SECRET_<COURIER> or COURIER_WEBHOOK_SECRET. No secret => 503 (feature off).
 *
 * The payload adapter below accepts a GENERIC shape (order_number / merchant_order_id / invoice,
 * status, tracking_number / tracking_code / consignment_id, event_id). Real vendors (Pathao, RedX,
 * Steadfast, ...) each need a thin adapter written against their documentation + credentials.
 */

const limiter = new RateLimiter(600, 60_000);
const TOLERANCE_SECONDS = 300;

export function courierSecret(courier: string): string {
  return process.env[`COURIER_WEBHOOK_SECRET_${courier.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`] || process.env.COURIER_WEBHOOK_SECRET || "";
}

export function sign(secret: string, timestamp: string | number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifySignature(secret: string, headers: Record<string, any>, rawBody: string, nowMs = Date.now()): boolean {
  const ts = String(headers["x-timestamp"] ?? "");
  const sigRaw = String(headers["x-signature"] ?? "").replace(/^sha256=/, "");
  if (!/^\d{9,13}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(sigRaw)) return false;
  const tsSec = ts.length > 10 ? Math.floor(Number(ts) / 1000) : Number(ts);
  if (Math.abs(nowMs / 1000 - tsSec) > TOLERANCE_SECONDS) return false;
  return safeEqual(sign(secret, ts, rawBody), sigRaw.toLowerCase());
}

const SHIPPED = new Set(["picked_up", "pickup_done", "pickup_completed", "in_transit", "shipped", "dispatched", "out_for_delivery", "at_sorting_hub", "at_hub", "on_the_way", "assigned_for_delivery"]);
const DELIVERED = new Set(["delivered", "delivered_to_customer", "delivery_completed", "completed"]);
const REFUSED = new Set(["returned", "return", "return_to_merchant", "returned_to_merchant", "returned_to_sender", "return_completed", "refused", "customer_refused", "refused_by_customer", "cancelled_by_customer"]);

export function mapStatus(raw: string): "SHIPPED" | "DELIVERED" | "REFUSED" | null {
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (DELIVERED.has(s)) return "DELIVERED";
  if (REFUSED.has(s)) return "REFUSED";
  if (SHIPPED.has(s)) return "SHIPPED";
  return null; // e.g. pending, in_review, partial_delivered: recorded, never acted on automatically
}

export function normalizePayload(courier: string, p: any) {
  const orderNumber = String(p.order_number ?? p.merchant_order_id ?? p.invoice ?? p.orderNumber ?? "").trim().toUpperCase();
  const rawStatus = String(p.status ?? p.delivery_status ?? p.event ?? "").trim();
  const tracking = p.tracking_number ?? p.tracking_code ?? p.consignment_id ?? null;
  const eventRef = String(
    p.event_id ?? p.eventId ??
      crypto.createHash("sha256").update([courier, orderNumber, rawStatus, tracking, p.updated_at ?? ""].join("|")).digest("hex").slice(0, 32)
  );
  return { orderNumber, rawStatus, trackingNumber: tracking ? String(tracking).slice(0, 80) : null, eventRef };
}

export async function handleCourierWebhook(db: Db, courier: string, headers: Record<string, any>, rawBody: string) {
  if (!/^[a-z0-9_-]{2,30}$/i.test(courier)) throw new HttpError(404, "Unknown courier", "NOT_FOUND");
  if (!limiter.allow(courier.toLowerCase())) throw new HttpError(429, "Too many requests", "RATE_LIMITED");

  const secret = courierSecret(courier);
  if (!secret) throw new HttpError(503, "Courier webhooks are not configured.", "NOT_CONFIGURED");
  if (!verifySignature(secret, headers, rawBody)) throw new HttpError(401, "Invalid signature", "BAD_SIGNATURE");

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { throw new HttpError(400, "Invalid JSON", "BAD_JSON"); }
  const n = normalizePayload(courier, payload);
  if (!/^ORD-[A-Z0-9]{4,20}$/.test(n.orderNumber)) throw new HttpError(400, "Missing or invalid order number.", "VALIDATION");
  if (!n.rawStatus) throw new HttpError(400, "Missing status.", "VALIDATION");
  const mapped = mapStatus(n.rawStatus);

  return db.$transaction(async (tx) => {
    const inserted = await tx.$executeRawUnsafe(
      `INSERT INTO "CourierEvent" ("id","courier","eventRef","orderNumber","rawStatus","mappedStatus","trackingNumber")
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("courier","eventRef") DO NOTHING`,
      crypto.randomUUID(), courier.toLowerCase(), n.eventRef, n.orderNumber, n.rawStatus, mapped, n.trackingNumber
    );
    if (inserted === 0) return { accepted: true, duplicate: true, mapped };
    if (mapped) {
      await publish(tx as any, "notification", "ShipmentUpdated", {
        orderNumber: n.orderNumber, status: mapped, courier: courier.toLowerCase(), trackingNumber: n.trackingNumber, eventRef: n.eventRef,
      });
    }
    return { accepted: true, duplicate: false, mapped };
  });
}
