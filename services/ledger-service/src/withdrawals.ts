import crypto from "crypto";
import { HttpError } from "../../../packages/service-kit";
import { config } from "./config";
import { D, num, withTx, type Runner } from "./db";
import { enforceWithin } from "./enforcer";
import { InsufficientFundsError, lockKey, postTransaction, publish } from "./ledger";

// ------------------------------------------------------------ payout methods

const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
const MFS = new Set(["BKASH", "NAGAD", "ROCKET"]);

export async function listPayoutMethods(db: Runner, storeId: string) {
  return db.payoutMethod.findMany({
    where: { storeId, isArchived: false },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function addPayoutMethod(db: Runner, storeId: string, b: any) {
  const type = b.type as string;
  if (!type) throw new HttpError(400, "Payout method type is required", "VALIDATION");
  if (MFS.has(type)) {
    if (!b.phoneNumber) throw new HttpError(400, "Phone number is required for mobile wallet", "VALIDATION");
    if (!BD_PHONE.test(String(b.phoneNumber).replace(/[\s-]/g, ""))) {
      throw new HttpError(400, "Invalid Bangladeshi mobile number format (e.g., 01712345678)", "VALIDATION");
    }
  } else if (type === "BANK_TRANSFER") {
    if (!b.bankName || !b.routingNumber || !b.accountName || !b.accountNumber) {
      throw new HttpError(400, "Bank name, routing number, account name, and account number are required", "VALIDATION");
    }
    if (!/^\d{9}$/.test(String(b.routingNumber).trim())) {
      throw new HttpError(400, "Routing number must be exactly 9 numeric digits as per Bangladesh Bank standard", "VALIDATION");
    }
  } else {
    throw new HttpError(400, "Unsupported payout method type", "VALIDATION");
  }

  return withTx(db, async (tx) => {
    const count = await tx.payoutMethod.count({ where: { storeId } });
    const makeDefault = count === 0 || !!b.isDefault;
    if (makeDefault) await tx.payoutMethod.updateMany({ where: { storeId }, data: { isDefault: false } });
    return tx.payoutMethod.create({
      data: {
        storeId,
        type: type as any,
        accountType: type === "BANK_TRANSFER" ? "PERSONAL" : (b.accountType ?? "PERSONAL"),
        phoneNumber: b.phoneNumber ? String(b.phoneNumber).replace(/[\s-]/g, "") : null,
        bankName: b.bankName?.trim() || null,
        branchName: b.branchName?.trim() || null,
        routingNumber: b.routingNumber?.trim() || null,
        accountName: b.accountName?.trim() || null,
        accountNumber: b.accountNumber?.trim() || null,
        isDefault: makeDefault,
        // 24-hour anti-hijack cooling period before this destination can be paid.
        coolingUntil: new Date(Date.now() + 24 * 3_600_000),
      },
    });
  });
}

export async function deletePayoutMethod(db: Runner, storeId: string, id: string) {
  const method = await db.payoutMethod.findFirst({ where: { id, storeId } });
  if (!method) throw new HttpError(404, "Payout method not found", "NOT_FOUND");
  const active = await db.withdrawal.count({ where: { payoutMethodId: id, status: { in: ["PENDING", "PROCESSING"] } } });
  if (active > 0) throw new HttpError(409, "Cannot delete a payout method that has active pending withdrawals", "IN_USE");
  const used = await db.withdrawal.count({ where: { payoutMethodId: id } });
  if (used > 0) await db.payoutMethod.update({ where: { id }, data: { isArchived: true, isDefault: false } });
  else await db.payoutMethod.delete({ where: { id } });
  return { success: true };
}

// --------------------------------------------------------------- withdrawals

const describeDestination = (m: { type: string; bankName: string | null; accountNumber: string | null; phoneNumber: string | null }) =>
  m.type === "BANK_TRANSFER"
    ? `${m.bankName} (A/C: ${(m.accountNumber ?? "").slice(-4).padStart((m.accountNumber ?? "").length || 4, "*")})`
    : `${m.type} (${m.phoneNumber})`;

const shape = (w: any) => ({
  id: w.id,
  withdrawalNumber: w.withdrawalNumber,
  storeId: w.storeId,
  amount: num(w.amount),
  fee: num(w.fee),
  netAmount: num(w.netAmount),
  status: w.status,
  disbursementTxId: w.disbursementTxId,
  rejectionReason: w.rejectionReason,
  processedAt: w.processedAt,
  processedBy: w.processedBy,
  createdAt: w.createdAt,
  payoutMethod: w.payoutMethod
    ? { id: w.payoutMethod.id, type: w.payoutMethod.type, destination: describeDestination(w.payoutMethod), phoneNumber: w.payoutMethod.phoneNumber, bankName: w.payoutMethod.bankName, branchName: w.payoutMethod.branchName, routingNumber: w.payoutMethod.routingNumber, accountName: w.payoutMethod.accountName, accountNumber: w.payoutMethod.accountNumber }
    : undefined,
  destination: w.payoutMethod ? describeDestination(w.payoutMethod) : undefined,
});

export async function listWithdrawals(db: Runner, where: { storeId?: string; status?: string }, take = 50) {
  const rows = await db.withdrawal.findMany({
    where: { storeId: where.storeId, status: where.status as any },
    include: { payoutMethod: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(shape);
}

export async function requestWithdrawal(db: Runner, storeId: string, payoutMethodId: string, rawAmount: number) {
  const amount = Math.round(Number(rawAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < config.minWithdrawal) {
    throw new HttpError(400, `Minimum withdrawal amount is ৳${config.minWithdrawal.toFixed(2)} BDT`, "VALIDATION");
  }
  const fee = config.withdrawalFee;
  if (amount - fee <= 0) throw new HttpError(400, "Amount does not cover the withdrawal fee", "VALIDATION");

  try {
    return await withTx(db, async (tx) => {
      // Serialise this store's withdrawals: closes the check-then-act race.
      await lockKey(tx, `withdraw:${storeId}`);

      const pending = await tx.withdrawal.findFirst({ where: { storeId, status: { in: ["PENDING", "PROCESSING"] } } });
      if (pending) {
        throw new HttpError(409, `You already have an active withdrawal request (${pending.withdrawalNumber}) in progress. Please wait for it to be processed.`, "ACTIVE_WITHDRAWAL");
      }
      const method = await tx.payoutMethod.findFirst({ where: { id: payoutMethodId, storeId, isArchived: false } });
      if (!method) throw new HttpError(404, "Payout method not found or access denied", "NOT_FOUND");
      if (method.coolingUntil && new Date() < method.coolingUntil) {
        const hours = Math.ceil((method.coolingUntil.getTime() - Date.now()) / 3_600_000);
        throw new HttpError(403, `Security Protection: This payout account was registered recently. Withdrawals to this destination are locked for ${hours} more hour(s) to protect against unauthorized account changes.`, "COOLING");
      }

      const withdrawalNumber = `WD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const net = amount - fee;
      const posted = await postTransaction(tx, {
        kind: "WITHDRAWAL_REQUEST",
        reference: withdrawalNumber,
        description: `Withdrawal request ${withdrawalNumber} to ${describeDestination(method)}`,
        entryType: "WITHDRAWAL_HOLD",
        idempotencyKey: `withdraw-request:${withdrawalNumber}`,
        // Never dip into held funds or the platform reserve bond.
        walletGuard: { minAvailableAfter: config.minOperatingReserve },
        postings: [
          { account: { type: "STORE_WALLET", storeId }, debit: amount },
          { account: { type: "PAYOUT_CLEARING" }, credit: net },
          ...(fee > 0 ? [{ account: { type: "PLATFORM_FEE_REVENUE" as const }, credit: fee }] : []),
        ],
      });
      const w = await tx.withdrawal.create({
        data: { withdrawalNumber, storeId, payoutMethodId, amount: D(amount), fee: D(fee), netAmount: D(net), ledgerTxId: posted.id },
        include: { payoutMethod: true },
      });
      await enforceWithin(tx, storeId);
      return shape(w);
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) {
      const wal = await db.wallet.findUnique({ where: { storeId } });
      const eligible = Math.max(0, num(wal?.balance) - num(wal?.holds) - config.minOperatingReserve);
      throw new HttpError(
        409,
        `Insufficient withdrawable funds. Eligible: ৳${eligible.toFixed(2)} (after deducting active COD holds and ৳${config.minOperatingReserve.toFixed(2)} platform reserve bond).`,
        "INSUFFICIENT_FUNDS"
      );
    }
    throw e;
  }
}

/** Admin: mark a withdrawal paid (APPROVE) or refund it to the wallet (REJECT). */
export async function reviewWithdrawal(
  db: Runner,
  id: string,
  p: { action: "APPROVE" | "REJECT"; admin: string; disbursementTxId?: string; rejectionReason?: string }
) {
  if (p.action === "APPROVE" && !p.disbursementTxId?.trim()) {
    throw new HttpError(400, "Disbursement Transaction ID / Banking Reference is required to approve", "VALIDATION");
  }
  return withTx(db, async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id } });
    if (!w) throw new HttpError(404, "Withdrawal request not found", "NOT_FOUND");
    const next = p.action === "APPROVE" ? "COMPLETED" : "REJECTED";
    // Compare-and-swap: two admins cannot both process the same request.
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: next,
        processedAt: new Date(),
        processedBy: p.admin,
        disbursementTxId: p.action === "APPROVE" ? p.disbursementTxId!.trim() : undefined,
        rejectionReason: p.action === "REJECT" ? p.rejectionReason?.trim() || "Rejected by administration" : undefined,
      },
    });
    if (claimed.count === 0) throw new HttpError(409, `Cannot process a withdrawal that is already ${w.status}`, "ALREADY_PROCESSED");

    if (p.action === "APPROVE") {
      await postTransaction(tx, {
        kind: "WITHDRAWAL_PAID",
        reference: w.withdrawalNumber,
        description: `Withdrawal ${w.withdrawalNumber} paid out (ref ${p.disbursementTxId})`,
        idempotencyKey: `withdraw-paid:${w.id}`,
        postings: [
          { account: { type: "PAYOUT_CLEARING" }, debit: w.netAmount },
          { account: { type: "PLATFORM_CASH" }, credit: w.netAmount },
        ],
      });
    } else {
      const reason = p.rejectionReason?.trim() || "Rejected by administration";
      await postTransaction(tx, {
        kind: "WITHDRAWAL_REFUND",
        reference: w.withdrawalNumber,
        description: `Withdrawal ${w.withdrawalNumber} rejected: ${reason}. Funds returned to wallet.`,
        entryType: "WITHDRAWAL_REFUNDED",
        idempotencyKey: `withdraw-refund:${w.id}`,
        postings: [
          { account: { type: "PAYOUT_CLEARING" }, debit: w.netAmount },
          ...(num(w.fee) > 0 ? [{ account: { type: "PLATFORM_FEE_REVENUE" as const }, debit: w.fee }] : []),
          { account: { type: "STORE_WALLET", storeId: w.storeId }, credit: w.amount },
        ],
      });
      await enforceWithin(tx, w.storeId);
    }
    const wal = await tx.wallet.findUnique({ where: { storeId: w.storeId } });
    await publish(tx as any, "ledger", "PayoutGenerated", {
      storeId: w.storeId, ownerId: wal?.ownerId, withdrawalNumber: w.withdrawalNumber, status: next, amount: num(w.amount),
      reason: p.action === "REJECT" ? p.rejectionReason ?? null : null,
    }, w.storeId);
    const fresh = await tx.withdrawal.findUniqueOrThrow({ where: { id }, include: { payoutMethod: true } });
    return shape(fresh);
  });
}
