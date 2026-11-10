import crypto from "crypto";
import { HttpError, requireFields } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { num, round2, withTx, lockKey, type Db } from "./db";
import type { BillingConfig } from "./config";
import type { LedgerGateway } from "./ledger";
import { activateSubscription, getPlan, parsePlan, subjectFor } from "./subscriptions";

/**
 * Manual payments: the merchant (or buyer) sends money by bKash / Nagad / Rocket / bank
 * transfer / cash and submits the transaction id; an admin verifies it against the real
 * account statement and approves or rejects. This is how wallets get funded and Pro plans
 * get paid while the online gateway is on hold.
 */
export const METHODS = new Set(["BKASH", "NAGAD", "ROCKET", "BANK", "CASH"]);

const reference = () => "MP-" + crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8);

export const shapeManual = (m: any) => ({
  id: m.id, reference: m.reference, purpose: m.purpose, method: m.method, trxId: m.trxId, senderNumber: m.senderNumber,
  proofUrl: m.proofUrl, amount: num(m.amount), storeId: m.storeId, userId: m.userId, plan: m.plan, status: m.status,
  reviewedBy: m.reviewedBy, reviewNote: m.reviewNote, reviewedAt: m.reviewedAt, createdAt: m.createdAt,
});

function cleanTrx(v: unknown): string {
  const s = String(v ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_/]{3,39}$/.test(s)) throw new HttpError(400, "trxId must be 4-40 letters/digits (the transaction id from your bKash/Nagad/bank receipt)", "VALIDATION");
  return s;
}

export async function createManualPayment(db: Db, ledger: LedgerGateway, cfg: BillingConfig, body: any) {
  requireFields(body, ["purpose", "method", "trxId", "idempotencyKey"]);
  const purpose = String(body.purpose).toUpperCase();
  if (purpose !== "WALLET_TOPUP" && purpose !== "SUBSCRIPTION") throw new HttpError(400, "purpose must be WALLET_TOPUP or SUBSCRIPTION", "VALIDATION");
  const method = String(body.method).toUpperCase();
  if (!METHODS.has(method)) throw new HttpError(400, `method must be one of ${[...METHODS].join(", ")}`, "VALIDATION");
  const trxId = cleanTrx(body.trxId);
  const idempotencyKey = String(body.idempotencyKey).slice(0, 100);

  let amount: number;
  let storeId: string | undefined;
  let userId: string | undefined;
  let plan: "BUYER_PRO" | undefined;
  if (purpose === "WALLET_TOPUP") {
    requireFields(body, ["storeId", "amount"]);
    storeId = String(body.storeId);
    userId = body.userId ? String(body.userId) : undefined;
    amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < cfg.minTopUp || amount > cfg.maxTopUp) {
      throw new HttpError(400, `Top-up must be between ৳${cfg.minTopUp} and ৳${cfg.maxTopUp}.`, "VALIDATION");
    }
    amount = round2(amount);
    if (!(await ledger.walletExists(storeId))) throw new HttpError(404, "Store wallet not found.", "STORE_NOT_FOUND");
  } else {
    requireFields(body, ["plan"]);
    plan = parsePlan(body.plan);
    userId = subjectFor(plan, { userId: body.userId ? String(body.userId) : undefined }).userId; // Buyer Pro belongs to the buyer
    amount = num((await getPlan(db, plan)).price); // price is decided here, never by the caller
    if (body.amount !== undefined && Math.abs(Number(body.amount) - amount) > 0.009) {
      throw new HttpError(400, `This plan costs ৳${amount}. Send exactly that amount.`, "AMOUNT_MISMATCH");
    }
  }

  const ownerKey = storeId ? `store:${storeId}` : `user:${userId}`;
  return withTx(db, async (tx) => {
    await lockKey(tx, `manual:${idempotencyKey}`);
    const again = await tx.manualPayment.findUnique({ where: { idempotencyKey } });
    if (again) {
      if (again.purpose !== purpose || again.method !== method || again.trxId !== trxId || Math.abs(num(again.amount) - amount) > 0.009) {
        throw new HttpError(409, "This idempotency key was already used for a different payment.", "IDEMPOTENCY_MISMATCH");
      }
      return { success: true, duplicate: true, payment: shapeManual(again) };
    }
    // One real transfer can only ever be claimed once, by anyone.
    const claimed = await tx.manualPayment.findUnique({ where: { method_trxId: { method, trxId } } });
    if (claimed) throw new HttpError(409, "This transaction id has already been submitted.", "DUPLICATE_TRX");

    await lockKey(tx, `manual-owner:${ownerKey}`);
    const pending = await tx.manualPayment.count({ where: { status: "PENDING", ...(storeId ? { storeId } : { userId }) } });
    if (pending >= cfg.maxPendingManual) {
      throw new HttpError(429, "You already have several payments waiting for review. Please wait for them to be approved.", "TOO_MANY_PENDING");
    }
    const row = await tx.manualPayment.create({
      data: {
        reference: reference(), idempotencyKey, purpose: purpose as any, method, trxId, amount, storeId, userId, plan,
        senderNumber: body.senderNumber ? String(body.senderNumber).slice(0, 20) : null,
        proofUrl: body.proofUrl ? String(body.proofUrl).slice(0, 500) : null,
      },
    });
    return { success: true, duplicate: false, payment: shapeManual(row) };
  });
}

export async function listManual(db: Db, q: { status?: string; storeId?: string; userId?: string; limit?: number }) {
  const rows = await db.manualPayment.findMany({
    where: { ...(q.status ? { status: q.status.toUpperCase() as any } : {}), ...(q.storeId ? { storeId: q.storeId } : {}), ...(q.userId ? { userId: q.userId } : {}) },
    orderBy: { createdAt: "desc" }, take: Math.min(q.limit ?? 100, 500),
  });
  return rows.map(shapeManual);
}

/**
 * Admin decision. Compare-and-swap on PENDING, so two admins (or a double click) can
 * never approve twice. Approval and its effects (ledger top-up event / subscription) commit
 * in ONE transaction with the status change; the outbox delivers them afterwards.
 */
export async function reviewManualPayment(db: Db, p: { id: string; decision: string; admin: string; note?: string }, now = new Date()) {
  const decision = p.decision.toUpperCase();
  if (decision !== "APPROVE" && decision !== "REJECT") throw new HttpError(400, "decision must be APPROVE or REJECT", "VALIDATION");
  const note = p.note ? String(p.note).trim().slice(0, 300) : undefined;
  if (decision === "REJECT" && !note) throw new HttpError(400, "A rejection needs a written reason.", "VALIDATION");

  return withTx(db, async (tx) => {
    const cur = await tx.manualPayment.findUnique({ where: { id: p.id } });
    if (!cur) throw new HttpError(404, "Payment not found.", "NOT_FOUND");
    const r = await tx.manualPayment.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedBy: p.admin, reviewNote: note ?? null, reviewedAt: now },
    });
    if (r.count === 0) throw new HttpError(409, "This payment has already been reviewed.", "NOT_PENDING");

    const m = await tx.manualPayment.findUniqueOrThrow({ where: { id: p.id } });
    const owner = m.storeId ?? undefined;
    if (decision === "APPROVE") {
      if (m.purpose === "WALLET_TOPUP") {
        await publish(tx as any, "payment", "TopUpApproved", { storeId: m.storeId, amount: num(m.amount), paymentRef: m.reference, method: m.method }, owner);
      } else if (m.plan) {
        // the amount the buyer actually sent (verified by the admin) is what the invoice and the platform's books record
        await activateSubscription(tx, { plan: m.plan, userId: m.userId ?? undefined, amount: num(m.amount), method: "MANUAL", paymentRef: m.reference, now });
      }
    }
    await publish(
      tx as any, "payment", "ManualPaymentReviewed",
      { status: m.status, purpose: m.purpose, amount: num(m.amount), storeId: m.storeId, userId: m.userId, reference: m.reference, note }, owner
    );
    return { success: true, payment: shapeManual(m) };
  });
}
