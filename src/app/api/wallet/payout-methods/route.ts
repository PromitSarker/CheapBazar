import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStore } from "@/lib/tenant";
import type { PayoutMethodType, PayoutAccountType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await requireStore();

    const methods = await prisma.storePayoutMethod.findMany({
      where: { storeId: store.id, isArchived: false },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ methods });
  } catch (error: any) {
    console.error("[API:wallet/payout-methods:GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch payout methods" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const store = await requireStore();
    const body = await request.json();

    const {
      type,
      accountType = "PERSONAL",
      phoneNumber,
      bankName,
      branchName,
      routingNumber,
      accountName,
      accountNumber,
      isDefault = false,
    } = body as {
      type: PayoutMethodType;
      accountType?: PayoutAccountType;
      phoneNumber?: string;
      bankName?: string;
      branchName?: string;
      routingNumber?: string;
      accountName?: string;
      accountNumber?: string;
      isDefault?: boolean;
    };

    if (!type) {
      return NextResponse.json({ error: "Payout method type is required" }, { status: 400 });
    }

    // Validation for Mobile Financial Services (MFS)
    if (type === "BKASH" || type === "NAGAD" || type === "ROCKET") {
      if (!phoneNumber) {
        return NextResponse.json({ error: "Phone number is required for mobile wallet" }, { status: 400 });
      }

      const cleanPhone = phoneNumber.replace(/[\s-]/g, "");
      // Bangladesh mobile regex: 013 to 019 followed by 8 digits
      const bdPhoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;
      if (!bdPhoneRegex.test(cleanPhone)) {
        return NextResponse.json(
          { error: "Invalid Bangladeshi mobile number format (e.g., 01712345678)" },
          { status: 400 }
        );
      }
    }

    // Validation for Bank Account (BEFTN/NPSB)
    if (type === "BANK_TRANSFER") {
      if (!bankName || !routingNumber || !accountName || !accountNumber) {
        return NextResponse.json(
          { error: "Bank name, routing number, account name, and account number are required" },
          { status: 400 }
        );
      }

      const cleanRouting = routingNumber.trim();
      if (!/^\d{9}$/.test(cleanRouting)) {
        return NextResponse.json(
          { error: "Routing number must be exactly 9 numeric digits as per Bangladesh Bank standard" },
          { status: 400 }
        );
      }
    }

    // 24-hour anti-hijack cooling period
    const coolingUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const existingCount = await prisma.storePayoutMethod.count({
      where: { storeId: store.id },
    });

    const shouldBeDefault = existingCount === 0 || isDefault;

    // If making default, unset other defaults
    if (shouldBeDefault) {
      await prisma.storePayoutMethod.updateMany({
        where: { storeId: store.id },
        data: { isDefault: false },
      });
    }

    const newMethod = await prisma.storePayoutMethod.create({
      data: {
        storeId: store.id,
        type,
        accountType: type === "BANK_TRANSFER" ? "PERSONAL" : accountType,
        phoneNumber: phoneNumber ? phoneNumber.replace(/[\s-]/g, "") : null,
        bankName: bankName?.trim() || null,
        branchName: branchName?.trim() || null,
        routingNumber: routingNumber?.trim() || null,
        accountName: accountName?.trim() || null,
        accountNumber: accountNumber?.trim() || null,
        isDefault: shouldBeDefault,
        coolingUntil,
      },
    });

    return NextResponse.json({ success: true, method: newMethod });
  } catch (error: any) {
    console.error("[API:wallet/payout-methods:POST] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add payout method" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const store = await requireStore();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing payout method ID" }, { status: 400 });
    }

    // Check if any pending withdrawals are linked to this method
    const activeWithdrawals = await prisma.withdrawalRequest.count({
      where: {
        payoutMethodId: id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });

    if (activeWithdrawals > 0) {
      return NextResponse.json(
        { error: "Cannot delete a payout method that has active pending withdrawals" },
        { status: 400 }
      );
    }

    const totalWithdrawals = await prisma.withdrawalRequest.count({
      where: { payoutMethodId: id },
    });

    if (totalWithdrawals > 0) {
      // Soft-delete to preserve audit trail
      await prisma.storePayoutMethod.updateMany({
        where: { id, storeId: store.id },
        data: { isArchived: true, isDefault: false },
      });
    } else {
      // Hard-delete if never used in any withdrawal
      await prisma.storePayoutMethod.deleteMany({
        where: { id, storeId: store.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API:wallet/payout-methods:DELETE] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete payout method" },
      { status: 500 }
    );
  }
}
