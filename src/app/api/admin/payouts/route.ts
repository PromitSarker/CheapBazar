import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/identity/service";
import type { WithdrawalStatus } from "@prisma/client";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { payoutQueueViaServices, reviewWithdrawalViaServices } from "@/lib/bff/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as WithdrawalStatus | null;

    if (servicesEnabled()) {
      const { rows, stats } = await payoutQueueViaServices(status ?? undefined);
      return NextResponse.json({ withdrawals: rows, stats });
    }

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where,
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            walletBalance: true,
            walletHolds: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        payoutMethod: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const pendingCount = await prisma.withdrawalRequest.count({ where: { status: "PENDING" } });
    const pendingTotal = await prisma.withdrawalRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
    });

    return NextResponse.json({
      withdrawals,
      stats: {
        pendingCount,
        pendingAmount: Number(pendingTotal._sum.amount || 0),
      },
    });
  } catch (error: any) {
    console.error("[API:admin/payouts:GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch withdrawal queue" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
    }

    const body = await request.json();
    const { withdrawalId, action, disbursementTxId, rejectionReason } = body as {
      withdrawalId: string;
      action: "APPROVE" | "REJECT";
      disbursementTxId?: string;
      rejectionReason?: string;
    };

    if (!withdrawalId || !action) {
      return NextResponse.json(
        { error: "Withdrawal ID and action (APPROVE or REJECT) are required" },
        { status: 400 }
      );
    }

    if (servicesEnabled()) {
      if (action !== "APPROVE" && action !== "REJECT") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      try {
        const r = await reviewWithdrawalViaServices(withdrawalId, action, disbursementTxId, rejectionReason);
        return NextResponse.json({ success: true, withdrawal: r.withdrawal });
      } catch (e) {
        if (e instanceof ServiceCallError) {
          return NextResponse.json({ error: e.status >= 500 ? "The ledger service is unavailable. Try again shortly." : e.message }, { status: e.status >= 500 ? 503 : e.status });
        }
        throw e;
      }
    }

    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      include: { store: true, payoutMethod: true },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: "Withdrawal request not found" }, { status: 404 });
    }

    if (withdrawal.status !== "PENDING" && withdrawal.status !== "PROCESSING") {
      return NextResponse.json(
        { error: `Cannot process a withdrawal that is already ${withdrawal.status}` },
        { status: 400 }
      );
    }

    if (action === "APPROVE") {
      if (!disbursementTxId) {
        return NextResponse.json(
          { error: "Disbursement Transaction ID / Banking Reference is required to approve" },
          { status: 400 }
        );
      }

      const updated = await prisma.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: "COMPLETED",
          disbursementTxId: disbursementTxId.trim(),
          processedAt: new Date(),
          processedBy: user.email,
        },
      });

      return NextResponse.json({ success: true, withdrawal: updated });
    }

    if (action === "REJECT") {
      const reason = rejectionReason?.trim() || "Rejected by administration";

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Refund the amount back to store walletBalance
        await tx.store.update({
          where: { id: withdrawal.storeId },
          data: {
            walletBalance: { increment: withdrawal.amount },
          },
        });

        // 2. Record refund in Ledger
        await tx.ledgerEntry.create({
          data: {
            storeId: withdrawal.storeId,
            transactionId: withdrawal.withdrawalNumber,
            entryType: "WITHDRAWAL_REFUNDED",
            description: `Withdrawal ${withdrawal.withdrawalNumber} rejected: ${reason}. Funds returned to wallet.`,
            credit: withdrawal.amount,
            debit: null,
          },
        });

        // 3. Mark withdrawal status REJECTED
        return await tx.withdrawalRequest.update({
          where: { id: withdrawal.id },
          data: {
            status: "REJECTED",
            rejectionReason: reason,
            processedAt: new Date(),
            processedBy: user.email,
          },
        });
      });

      return NextResponse.json({ success: true, withdrawal: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[API:admin/payouts:POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process withdrawal action" },
      { status: 500 }
    );
  }
}
