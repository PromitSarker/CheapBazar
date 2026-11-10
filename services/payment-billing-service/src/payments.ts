import crypto from "crypto";
import { HttpError, requireFields } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { lockKey, num, round2, withTx, type Db } from "./db";
import type { BillingConfig } from "./config";
import type { Gateway } from "./gateway";
import type { LedgerGateway } from "./ledger";
import type { OrderGateway } from "./orders";
import { activateSubscription, getPlan, parsePlan, subjectFor } from "./subscriptions";

const PURPOSES = new Set(["STORE_ORDER", "WALLET_TOPUP", "SUBSCRIPTION"]);
/** States a VERIFIED gateway payment may still capture from: money that really arrived always wins. */
const CAPTURABLE = ["PENDING", "FAILED", "CANCELLED", "EXPIRED"] as const;
const PREFIX: Record<string, string> = { STORE_ORDER: "ORD", WALLET_TOPUP: "TOPUP", SUBSCRIPTION: "SUB" };
const tranId = (purpose: string) => `SF-${PREFIX[purpose]}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
const minutes = (n: number) => n * 60_000;

export const shapePayment = (p: any) => ({
  id: p.id, tranId: p.tranId, purpose: p.purpose, status: p.status, gateway: p.gateway, amount: num(p.amount), currency: p.currency,
  orderNumber: p.orderNumber, storeId: p.storeId, userId: p.userId, plan: p.plan, gatewayUrl: p.status === "PENDING" ? p.gatewayUrl : null,
  expiresAt: p.expiresAt, capturedAt: p.capturedAt, refundedAmount: num(p.refundedAmount), failureReason: p.failureReason, createdAt: p.createdAt,
});

// ------------------------------------------------------------------- charge

/**
 * Start an online payment. The amount is decided HERE from trusted sources (the order in
 * order-service, the plan price, a validated top-up amount), never copied from the caller.
 * Idempotent per idempotencyKey; one live session per order.
 */
export async function createCharge(
  db: Db, gw: Gateway, ledger: LedgerGateway, orders: OrderGateway, cfg: BillingConfig, body: any, now = new Date()
) {
  if (!cfg.onlinePaymentsEnabled) {
    throw new HttpError(400, "Online payment is temporarily unavailable. Please choose Cash on Delivery or pay manually.", "ONLINE_DISABLED");
  }
  requireFields(body, ["purpose", "idempotencyKey"]);
  const purpose = String(body.purpose).toUpperCase();
  if (!PURPOSES.has(purpose)) throw new HttpError(400, "purpose must be STORE_ORDER, WALLET_TOPUP or SUBSCRIPTION", "VALIDATION");
  const idempotencyKey = String(body.idempotencyKey).slice(0, 100);
  const buyer = body.buyer ?? {};

  let amount = 0;
  let fee: number | undefined, net: number | undefined;
  let orderNumber: string | undefined, storeId: string | undefined, userId: string | undefined;
  let plan: "BUYER_PRO" | undefined;
  let productName = "";
  let customer = { name: String(buyer.name ?? "Customer"), email: String(buyer.email ?? "customer@cheapbazar.invalid"), phone: String(buyer.phone ?? "01700000000"), address: String(buyer.address ?? "Dhaka"), city: String(buyer.city ?? "Dhaka") };
  let subjectLock = `idem:${idempotencyKey}`;

  if (purpose === "STORE_ORDER") {
    requireFields(body, ["orderNumber"]);
    orderNumber = String(body.orderNumber);
    const o = await orders.get(orderNumber);
    if (!o) throw new HttpError(404, "Order not found.", "ORDER_NOT_FOUND");
    if (o.paymentMethod === "COD") throw new HttpError(400, "This is a Cash on Delivery order.", "NOT_ONLINE");
    if (o.status !== "PENDING_PAYMENT") throw new HttpError(409, `This order cannot be paid (status ${o.status}).`, "ORDER_NOT_PAYABLE");
    amount = round2(o.totalAmount);
    fee = round2(o.platformFee);
    net = round2(o.sellerNet);
    storeId = o.storeId;
    productName = `Order ${orderNumber}${o.storeName ? ` - ${o.storeName}` : ""}`;
    customer = {
      name: o.buyerName || customer.name, email: o.buyerEmail || customer.email, phone: o.buyerPhone || customer.phone,
      address: o.shippingAddress || customer.address, city: o.shippingCity || customer.city,
    };
    subjectLock = `order:${orderNumber}`;
  } else if (purpose === "WALLET_TOPUP") {
    requireFields(body, ["storeId", "amount"]);
    storeId = String(body.storeId);
    amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < cfg.minTopUp || amount > cfg.maxTopUp) {
      throw new HttpError(400, `Top-up must be between ৳${cfg.minTopUp} and ৳${cfg.maxTopUp}.`, "VALIDATION");
    }
    amount = round2(amount);
    if (!(await ledger.walletExists(storeId))) throw new HttpError(404, "Store wallet not found.", "STORE_NOT_FOUND");
    productName = "Cheap-Bazar wallet top-up";
  } else {
    requireFields(body, ["plan"]);
    plan = parsePlan(body.plan);
    userId = subjectFor(plan, { userId: body.userId ? String(body.userId) : undefined }).userId; // Buyer Pro belongs to the buyer
    const row = await getPlan(db, plan);
    amount = num(row.price);
    productName = row.name;
  }
  if (!(amount > 0)) throw new HttpError(400, "Nothing to pay.", "VALIDATION");

  const fingerprint = { purpose, amount, orderNumber: orderNumber ?? null, storeId: storeId ?? null, plan: plan ?? null };
  const sameRequest = (p: any) =>
    p.purpose === fingerprint.purpose && Math.abs(num(p.amount) - fingerprint.amount) < 0.009 &&
    (p.orderNumber ?? null) === fingerprint.orderNumber && (p.storeId ?? null) === fingerprint.storeId && (p.plan ?? null) === fingerprint.plan;

  const created = await withTx(db, async (tx) => {
    await lockKey(tx, subjectLock);
    const again = await tx.payment.findUnique({ where: { idempotencyKey } });
    if (again) {
      if (!sameRequest(again)) throw new HttpError(409, "This idempotency key was already used for a different payment.", "IDEMPOTENCY_MISMATCH");
      if (again.status === "PENDING" && !again.gatewayUrl) throw new HttpError(409, "Your payment is being prepared. Try again in a moment.", "IN_PROGRESS");
      return { payment: again, fresh: false };
    }
    if (orderNumber) {
      if (await tx.payment.findFirst({ where: { orderNumber, status: "CAPTURED" } })) throw new HttpError(409, "This order has already been paid.", "ALREADY_PAID");
      const live = await tx.payment.findFirst({ where: { orderNumber, status: "PENDING" }, orderBy: { createdAt: "desc" } });
      if (live) {
        if (live.gatewayUrl && live.expiresAt > now) return { payment: live, fresh: false }; // reuse the open session
        if (!live.gatewayUrl && now.getTime() - live.createdAt.getTime() < 60_000) throw new HttpError(409, "Your payment is being prepared. Try again in a moment.", "IN_PROGRESS");
        await tx.payment.updateMany({ where: { id: live.id, status: "PENDING" }, data: { status: "EXPIRED", failureReason: "Superseded by a new payment session" } });
      }
    }
    const row = await tx.payment.create({
      data: {
        tranId: tranId(purpose), idempotencyKey, purpose: purpose as any, gateway: gw.name, amount, fee, net, orderNumber, storeId, userId, plan,
        buyerName: customer.name, buyerEmail: customer.email, buyerPhone: customer.phone,
        createdAt: now, expiresAt: new Date(now.getTime() + minutes(cfg.paymentWindowMinutes)),
      },
    });
    return { payment: row, fresh: true };
  });
  if (!created.fresh) return { success: true, duplicate: true, payment: shapePayment(created.payment) };

  const p = created.payment;
  const init = await gw.init({
    tranId: p.tranId, amount, currency: "BDT", purpose, productName,
    successUrl: `${cfg.appUrl}/api/payments/sslcommerz/success`,
    failUrl: `${cfg.appUrl}/api/payments/sslcommerz/fail`,
    cancelUrl: `${cfg.appUrl}/api/payments/sslcommerz/cancel`,
    ipnUrl: cfg.publicUrl ? `${cfg.publicUrl}/payments/webhooks/sslcommerz` : undefined,
    customer, meta: { a: purpose, b: storeId, c: orderNumber ?? plan },
  });
  if (!init.ok || !init.gatewayUrl) {
    // No money moved. No event either: the order simply waits out its own reservation window,
    // and the buyer may retry with a new idempotency key.
    await db.payment.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `GATEWAY_INIT: ${init.error ?? "unknown"}`.slice(0, 300) } });
    throw new HttpError(502, "The payment gateway is not available right now. Please try again or use another method.", "GATEWAY_ERROR");
  }
  const saved = await db.payment.update({ where: { id: p.id }, data: { gatewayUrl: init.gatewayUrl, sessionKey: init.sessionKey ?? null } });
  return { success: true, duplicate: false, payment: shapePayment(saved) };
}

// ------------------------------------------------------------------ capture

const capturedEvent = (p: any) => ({
  purpose: p.purpose, tranId: p.tranId, storeId: p.storeId ?? undefined, userId: p.userId ?? undefined, orderNumber: p.orderNumber ?? undefined,
  plan: p.plan ?? undefined, total: num(p.amount), fee: p.fee != null ? num(p.fee) : undefined, net: p.net != null ? num(p.net) : undefined,
  method: p.cardType || "Online", buyerPhone: p.buyerPhone ?? undefined,
});

/**
 * Settle a payment after the gateway confirmed it. The ONLY way to CAPTURED is a server-to-server
 * validation by val_id whose tran id, amount and currency all match what we asked for.
 *
 *  - A validation that does not match NEVER changes the status (audit finding #5: the monolith
 *    marked the payment FAILED, which blocked every later valid callback).
 *  - Capture is a compare-and-swap, so the IPN and the browser return can race harmlessly.
 *  - FAILED / CANCELLED / EXPIRED payments can still capture: money that really arrived is recorded.
 */
export async function capture(db: Db, gw: Gateway, tranIdIn: string, valId: string, now = new Date()) {
  if (!tranIdIn || !valId) throw new HttpError(400, "tran_id and val_id are required", "VALIDATION");
  const pay = await db.payment.findUnique({ where: { tranId: tranIdIn } });
  if (!pay) throw new HttpError(404, "Unknown transaction.", "NOT_FOUND");
  if (pay.status === "CAPTURED" || pay.status === "REFUNDED" || pay.status === "CHARGEBACK") return { status: "ALREADY_CAPTURED", payment: shapePayment(pay) };

  const v = await gw.validate(valId);
  if (v.status === "ERROR") throw new HttpError(503, "Could not reach the payment gateway to verify this payment. It will be retried.", "GATEWAY_UNREACHABLE");

  const problems: string[] = [];
  if (!v.valid) problems.push(`gateway status ${v.status}`);
  if (v.tranId !== pay.tranId) problems.push("tran_id mismatch");
  if (Math.abs(v.amount - num(pay.amount)) >= 0.01) problems.push(`amount ${v.amount} != ${num(pay.amount)}`);
  if (v.currency !== pay.currency) problems.push(`currency ${v.currency}`);
  if (problems.length) {
    await db.payment.update({ where: { id: pay.id }, data: { validationFailures: { increment: 1 }, lastError: problems.join("; ").slice(0, 300), rawValidation: (v.raw ?? undefined) as any } });
    return { status: "REJECTED", reason: problems.join("; "), payment: shapePayment(pay) };
  }

  return withTx(db, async (tx) => {
    const r = await tx.payment.updateMany({
      where: { id: pay.id, status: { in: [...CAPTURABLE] } },
      data: { status: "CAPTURED", valId, bankTranId: v.bankTranId ?? null, cardType: v.cardType ?? null, rawValidation: (v.raw ?? undefined) as any, capturedAt: now, failureReason: null, lastError: null },
    });
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: pay.id } });
    if (r.count === 0) return { status: "ALREADY_CAPTURED", payment: shapePayment(fresh) }; // someone else won the race

    if (fresh.purpose === "SUBSCRIPTION" && fresh.plan) {
      await activateSubscription(tx, { plan: fresh.plan, userId: fresh.userId ?? undefined, amount: num(fresh.amount), method: "GATEWAY", paymentRef: fresh.tranId, now });
    }
    // order-service confirms, ledger books the split / top-up (each dedupes on tranId)
    await publish(tx as any, "payment", "PaymentCaptured", capturedEvent(fresh), fresh.storeId ?? undefined);
    return { status: "CAPTURED", payment: shapePayment(fresh) };
  });
}

/** Gateway said the attempt failed/was abandoned. Only a PENDING payment moves; a captured one never goes backwards. */
export async function markFailed(db: Db, tranIdIn: string, to: "FAILED" | "CANCELLED" | "EXPIRED", reason: string) {
  return withTx(db, async (tx) => {
    const r = await tx.payment.updateMany({ where: { tranId: tranIdIn, status: "PENDING" }, data: { status: to, failureReason: reason.slice(0, 300) } });
    const p = await tx.payment.findUnique({ where: { tranId: tranIdIn } });
    if (!p) throw new HttpError(404, "Unknown transaction.", "NOT_FOUND");
    if (r.count && p.purpose === "STORE_ORDER" && to !== "EXPIRED") {
      // order-service cancels the order and releases the stock now instead of waiting out the window
      await publish(tx as any, "payment", "PaymentFailed", { purpose: p.purpose, orderNumber: p.orderNumber, tranId: p.tranId, storeId: p.storeId, reason: reason.slice(0, 120), buyerPhone: p.buyerPhone ?? undefined }, p.storeId ?? undefined);
    }
    return { changed: r.count > 0, payment: shapePayment(p) };
  });
}

/**
 * Ask the gateway what really happened and apply it. This is what the buyer's browser return
 * (success / fail / cancel pages) triggers: the redirect itself is never trusted (audit finding
 * #4: the monolith changed payments from unauthenticated GETs), only the gateway's answer is.
 */
export async function reconcile(db: Db, gw: Gateway, tranIdIn: string, now = new Date()) {
  const p = await db.payment.findUnique({ where: { tranId: tranIdIn } });
  if (!p) throw new HttpError(404, "Unknown transaction.", "NOT_FOUND");
  if (p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "CHARGEBACK") return { status: p.status, payment: shapePayment(p) };

  let q;
  try {
    q = await gw.query(p.tranId);
  } catch {
    throw new HttpError(503, "Could not reach the payment gateway. Please check again shortly.", "GATEWAY_UNREACHABLE");
  }
  if (q.status === "PAID" && q.valId) return capture(db, gw, p.tranId, q.valId, now);
  if (q.status === "FAILED" || q.status === "CANCELLED" || q.status === "EXPIRED") {
    const r = await markFailed(db, p.tranId, q.status, `Gateway reported ${q.status.toLowerCase()}`);
    return { status: r.payment.status, payment: r.payment };
  }
  return { status: p.status, payment: shapePayment(p) }; // still pending / unknown: nothing to change
}

/**
 * Gateway IPN (server-to-server POST, form-encoded). It must carry a valid verify_sign
 * (audit finding #3), and even then it only tells us WHERE to look: the actual outcome is
 * re-verified with the gateway before anything changes.
 */
export async function handleIpn(db: Db, gw: Gateway, rawBody: string, now = new Date()) {
  const fields = Object.fromEntries(new URLSearchParams(rawBody));
  if (!gw.verifyIpn(fields)) throw new HttpError(401, "Invalid IPN signature.", "BAD_SIGNATURE");
  const id = String(fields.tran_id ?? "");
  if (!id) throw new HttpError(400, "tran_id is required", "VALIDATION");
  const status = String(fields.status ?? "").toUpperCase();
  if ((status === "VALID" || status === "VALIDATED") && fields.val_id) {
    const r = await capture(db, gw, id, String(fields.val_id), now);
    return { ok: true, result: r.status };
  }
  const r = await reconcile(db, gw, id, now);
  return { ok: true, result: r.status };
}

// ---------------------------------------------------------------- reads

export async function getPayment(db: Db, id: string, scope?: { storeId?: string; userId?: string }) {
  const p = (await db.payment.findUnique({ where: { tranId: id } })) ?? (await db.payment.findUnique({ where: { id } }));
  // A caller may only see its own payments (the web tier passes who is asking).
  if (!p || (scope?.storeId && p.storeId !== scope.storeId) || (scope?.userId && p.userId !== scope.userId)) {
    throw new HttpError(404, "Payment not found.", "NOT_FOUND");
  }
  return shapePayment(p);
}

export async function listPayments(db: Db, q: { storeId?: string; userId?: string; orderNumber?: string; status?: string; purpose?: string; limit?: number }) {
  const rows = await db.payment.findMany({
    where: {
      ...(q.storeId ? { storeId: q.storeId } : {}), ...(q.userId ? { userId: q.userId } : {}), ...(q.orderNumber ? { orderNumber: q.orderNumber } : {}),
      ...(q.status ? { status: q.status.toUpperCase() as any } : {}), ...(q.purpose ? { purpose: q.purpose.toUpperCase() as any } : {}),
    },
    orderBy: { createdAt: "desc" }, take: Math.min(q.limit ?? 50, 200),
  });
  return rows.map(shapePayment);
}

// --------------------------------------------------- refunds & chargebacks

/**
 * Full refund of an online ORDER payment (admin). Order of operations is chosen so money can
 * never be refunded twice: the status flips first (compare-and-swap), then the gateway is asked;
 * if the gateway refuses, the flip is undone. The ledger reversal is idempotent and retryable:
 * repeat the call on an already-refunded payment to re-run only that step.
 */
export async function refundPayment(db: Db, gw: Gateway, ledger: LedgerGateway, p: { tranId: string; admin: string; reason: string }) {
  if (!p.reason?.trim()) throw new HttpError(400, "A refund needs a written reason.", "VALIDATION");
  const pay = await db.payment.findUnique({ where: { tranId: p.tranId } });
  if (!pay) throw new HttpError(404, "Unknown transaction.", "NOT_FOUND");
  if (pay.purpose !== "STORE_ORDER") throw new HttpError(409, "Only order payments can be refunded here (top-ups and plans have no refund path yet).", "UNSUPPORTED");

  if (pay.status === "REFUNDED") {
    const prior = await db.refund.findFirst({ where: { paymentId: pay.id, status: "INITIATED" } });
    if (!prior) throw new HttpError(409, "This payment was already refunded.", "ALREADY_REFUNDED");
    const led = await reverseInLedger(ledger, pay, p.reason);
    return { success: true, duplicate: true, refundRef: prior.refundRef, ledger: led };
  }
  if (pay.status !== "CAPTURED") throw new HttpError(409, `Only a captured payment can be refunded (status ${pay.status}).`, "NOT_REFUNDABLE");
  if (!pay.bankTranId) throw new HttpError(409, "The gateway did not return a bank transaction id for this payment, so it must be refunded from the gateway panel.", "NO_BANK_TRAN_ID");

  const refundRef = "RF-" + crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
  const claimed = await withTx(db, async (tx) => {
    const r = await tx.payment.updateMany({ where: { id: pay.id, status: "CAPTURED" }, data: { status: "REFUNDED", refundedAmount: pay.amount } });
    if (r.count === 0) return false;
    await tx.refund.create({ data: { refundRef, paymentId: pay.id, amount: pay.amount, reason: p.reason.slice(0, 300), requestedBy: p.admin, status: "INITIATED" } });
    return true;
  });
  if (!claimed) throw new HttpError(409, "This payment is already being refunded.", "ALREADY_REFUNDED");

  const res = await gw.refund({ bankTranId: pay.bankTranId, amount: num(pay.amount), remarks: p.reason.slice(0, 100), refundRef });
  if (!res.ok) {
    await withTx(db, async (tx) => {
      await tx.payment.updateMany({ where: { id: pay.id, status: "REFUNDED" }, data: { status: "CAPTURED", refundedAmount: 0 } });
      await tx.refund.update({ where: { refundRef }, data: { status: "FAILED", error: String(res.error ?? "refused").slice(0, 300) } });
    });
    throw new HttpError(502, `The gateway refused the refund: ${res.error ?? "unknown reason"}`, "REFUND_REFUSED");
  }
  await db.refund.update({ where: { refundRef }, data: { gatewayRefId: res.gatewayRefId ?? null } });
  const led = await reverseInLedger(ledger, pay, p.reason);
  return { success: true, duplicate: false, refundRef, ledger: led };
}

async function reverseInLedger(ledger: LedgerGateway, pay: any, reason: string): Promise<"REVERSED" | "ALREADY_REVERSED_OR_NONE" | "RETRY_NEEDED"> {
  if (!pay.storeId) return "ALREADY_REVERSED_OR_NONE";
  try {
    const r = await ledger.reverseSettlement({ storeId: pay.storeId, tranId: pay.tranId, reason: `Refund: ${reason}`.slice(0, 200) });
    return r.reversed ? "REVERSED" : "ALREADY_REVERSED_OR_NONE";
  } catch (e: any) {
    console.error("[payment] ledger reversal failed (repeat the refund call to retry):", e?.message);
    return "RETRY_NEEDED";
  }
}

/**
 * A bank dispute: the money has already been taken back from us, so unlike a refund the
 * gateway is not asked to do anything. The books follow: order payments are reversed in the
 * ledger, subscription payments revoke the plan. (Top-up chargebacks need a wallet clawback
 * that ledger-service does not have yet: refused honestly rather than half-done.)
 */
export async function chargeback(db: Db, ledger: LedgerGateway, p: { tranId: string; admin: string; note?: string }, now = new Date()) {
  const pay = await db.payment.findUnique({ where: { tranId: p.tranId } });
  if (!pay) throw new HttpError(404, "Unknown transaction.", "NOT_FOUND");
  if (pay.purpose === "WALLET_TOPUP") throw new HttpError(409, "Top-up chargebacks are not supported yet: ledger-service has no wallet clawback.", "UNSUPPORTED");
  if (pay.status === "CHARGEBACK") {
    return { success: true, duplicate: true, ledger: pay.purpose === "STORE_ORDER" ? await reverseInLedger(ledger, pay, p.note ?? "chargeback") : undefined };
  }
  if (pay.status !== "CAPTURED") throw new HttpError(409, `Only a captured payment can be charged back (status ${pay.status}).`, "NOT_CAPTURED");

  const won = await withTx(db, async (tx) => {
    const r = await tx.payment.updateMany({ where: { id: pay.id, status: "CAPTURED" }, data: { status: "CHARGEBACK", failureReason: (p.note ?? "Chargeback").slice(0, 300) } });
    if (r.count === 0) return false;
    if (pay.purpose === "SUBSCRIPTION" && pay.plan) {
      // the money is gone: the buyer loses wholesale access and the platform's revenue posting is reversed
      const subj = subjectFor(pay.plan, { userId: pay.userId ?? undefined });
      const sub = await tx.subscription.findUnique({ where: { plan_subjectKey: { plan: pay.plan, subjectKey: subj.key } } });
      if (sub && sub.status !== "LAPSED") {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "LAPSED", graceEndsAt: null, currentPeriodEnd: now } });
        await publish(tx as any, "payment", "SubscriptionLapsed", { plan: sub.plan, userId: sub.userId, subscriptionId: sub.id, reason: "chargeback" });
      }
      await publish(tx as any, "payment", "PlatformRevenueReversed", { source: pay.plan, reference: pay.tranId, amount: num(pay.amount), reason: (p.note ?? "chargeback").slice(0, 200) });
    }
    return true;
  });
  if (!won) throw new HttpError(409, "This payment was already charged back.", "ALREADY_CHARGEDBACK");
  const led = pay.purpose === "STORE_ORDER" ? await reverseInLedger(ledger, pay, p.note ?? "chargeback") : undefined;
  return { success: true, duplicate: false, ledger: led };
}

// ----------------------------------------------------------------- janitor

/**
 * Housekeeping: PENDING payments past their window are re-checked with the gateway (the buyer
 * may have paid and closed the tab), and only expired when the gateway session itself is over.
 */
export async function sweep(db: Db, gw: Gateway, cfg: BillingConfig, now = new Date()) {
  const out = { checked: 0, captured: 0, expired: 0, failed: 0, errors: 0 };
  const stale = await db.payment.findMany({ where: { status: "PENDING", expiresAt: { lte: now } }, take: 200, orderBy: { createdAt: "asc" } });
  for (const p of stale) {
    out.checked++;
    try {
      if (p.gatewayUrl) {
        const r = await reconcile(db, gw, p.tranId, now);
        if (r.status === "CAPTURED") { out.captured++; continue; }
        if (r.status === "FAILED" || r.status === "CANCELLED") { out.failed++; continue; }
      }
      const sessionOver = !p.gatewayUrl || now.getTime() - p.createdAt.getTime() >= minutes(cfg.sessionHours * 60);
      if (sessionOver) {
        const m = await markFailed(db, p.tranId, "EXPIRED", "Payment window expired");
        if (m.changed) out.expired++;
      }
    } catch (e: any) {
      out.errors++;
      console.error("[payment] sweep failed for", p.tranId, e?.message);
    }
  }
  return out;
}
