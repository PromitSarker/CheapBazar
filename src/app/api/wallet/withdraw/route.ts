import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStore } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const MIN_OPERATING_RESERVE = 500.00;
const MIN_WITHDRAWAL_AMOUNT = 500.00;

export async function GET() {
  try {
    const store = await requireStore();

    const fullStore = await prisma.store.findUnique({
      where: { id: store.id },
      select: { walletBalance: true, walletHolds: true, status: true },
    });

    const totalBalance = Number(fullStore?.walletBalance || 0);
    const walletHolds = Number(fullStore?.walletHolds || 0);
    const availableBalance = totalBalance - walletHolds;
    const withdrawableBalance = Math.max(0, availableBalance - MIN_OPERATING_RESERVE);

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { storeId: store.id },
      include: { payoutMethod: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      totalBalance,
      walletHolds,
      minReserve: MIN_OPERATING_RESERVE,
      availableBalance,
      withdrawableBalance,
      withdrawals,
    });
  } catch (error: any) {
    console.error("[API:wallet/withdraw:GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch withdrawal data" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const store = await requireStore();
    const body = await request.json();

    const { payoutMethodId, amount } = body as {
      payoutMethodId: string;
      amount: number;
    };

    if (!payoutMethodId || !amount) {
      return NextResponse.json(
        { error: "Payout method and amount are required" },
        { status: 400 }
      );
    }

    const requestedAmount = Number(amount);
    if (isNaN(requestedAmount) || requestedAmount < MIN_WITHDRAWAL_AMOUNT) {
      return NextResponse.json(
        { error: `Minimum withdrawal amount is ৳${MIN_WITHDRAWAL_AMOUNT.toFixed(2)} BDT` },
        { status: 400 }
      );
    }

    // 1. Check for duplicate pending requests (anti-spam)
    const existingPending = await prisma.withdrawalRequest.findFirst({
      where: {
        storeId: store.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });

    if (existingPending) {
      return NextResponse.json(
        {
          error: `You already have an active withdrawal request (${existingPending.withdrawalNumber}) in progress. Please wait for it to be processed.`,
        },
        { status: 400 }
      );
    }

    // 2. Validate Payout Method ownership and security cooldown
    const payoutMethod = await prisma.storePayoutMethod.findFirst({
      where: { id: payoutMethodId, storeId: store.id },
    });

    if (!payoutMethod) {
      return NextResponse.json(
        { error: "Payout method not found or access denied" },
        { status: 404 }
      );
    }

    if (payoutMethod.coolingUntil && new Date() < payoutMethod.coolingUntil) {
      const remainingHours = Math.ceil(
        (payoutMethod.coolingUntil.getTime() - Date.now()) / (1000 * 60 * 60)
      );
      return NextResponse.json(
        {
          error: `Security Protection: This payout account was registered recently. Withdrawals to this destination are locked for ${remainingHours} more hour(s) to protect against unauthorized account changes.`,
        },
        { status: 403 }
      );
    }

    // 3. Atomically evaluate balance and execute withdrawal
    const result = await prisma.$transaction(async (tx) => {
      // Re-fetch store inside transaction for row-level isolation
      const freshStore = await tx.store.findUnique({
        where: { id: store.id },
        select: { id: true, walletBalance: true, walletHolds: true },
      });

      if (!freshStore) throw new Error("Store not found");

      const currentBalance = Number(freshStore.walletBalance);
      const currentHolds = Number(freshStore.walletHolds);
      const available = currentBalance - currentHolds;
      const maxWithdrawable = Math.max(0, available - MIN_OPERATING_RESERVE);

      if (requestedAmount > maxWithdrawable) {
        throw new Error(
          `Insufficient withdrawable funds. Eligible: ৳${maxWithdrawable.toFixed(
            2
          )} (after deducting active COD holds and ৳${MIN_OPERATING_RESERVE.toFixed(
            2
          )} platform reserve bond).`
        );
      }

      // Generate unique withdrawal reference
      const withdrawalNumber = `WD-${Date.now().toString().slice(-5)}${Math.floor(
        100 + Math.random() * 900
      )}`;

      // Deduct from wallet balance
      await tx.store.update({
        where: { id: store.id },
        data: {
          walletBalance: { decrement: requestedAmount },
        },
      });

      // Target description
      const destination =
        payoutMethod.type === "BANK_TRANSFER"
          ? `${payoutMethod.bankName} (A/C: ${payoutMethod.accountNumber?.slice(-4).padStart(payoutMethod.accountNumber?.length || 4, "*")})`
          : `${payoutMethod.type} (${payoutMethod.phoneNumber})`;

      // Record in double-entry ledger
      await tx.ledgerEntry.create({
        data: {
          storeId: store.id,
          transactionId: withdrawalNumber,
          entryType: "WITHDRAWAL_HOLD",
          description: `Withdrawal request ${withdrawalNumber} to ${destination}`,
          debit: requestedAmount,
          credit: null,
        },
      });

      // Create formal WithdrawalRequest record
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          withdrawalNumber,
          storeId: store.id,
          payoutMethodId: payoutMethod.id,
          amount: requestedAmount,
          fee: 0,
          netAmount: requestedAmount,
          status: "PENDING",
        },
      });

      return withdrawal;
    });

    return NextResponse.json({
      success: true,
      withdrawalNumber: result.withdrawalNumber,
      amount: Number(result.amount),
    });
  } catch (error: any) {
    console.error("[API:wallet/withdraw:POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process withdrawal request" },
      { status: 400 }
    );
  }
}
