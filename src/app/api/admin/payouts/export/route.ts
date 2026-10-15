import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/identity/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "beftn"; // "beftn" | "bkash" | "all"

    // Fetch all PENDING withdrawals
    const pendingWithdrawals = await prisma.withdrawalRequest.findMany({
      where: { status: "PENDING" },
      include: {
        store: { select: { name: true, slug: true } },
        payoutMethod: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "bkash") {
      // Filter only BKASH, NAGAD, ROCKET
      const mfsRows = pendingWithdrawals.filter((w) =>
        ["BKASH", "NAGAD", "ROCKET"].includes(w.payoutMethod.type)
      );

      const header = ["Wallet_Number", "Amount", "Invoice_Number", "Channel", "Store_Name"];
      const rows = mfsRows.map((w) => [
        `"${w.payoutMethod.phoneNumber || ""}"`,
        Number(w.amount).toFixed(2),
        `"${w.withdrawalNumber}"`,
        `"${w.payoutMethod.type}"`,
        `"${w.store.name.replace(/"/g, '""')}"`,
      ]);

      const csvContent = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bulk_mfs_disbursement_${timestamp}.csv"`,
        },
      });
    }

    // Default: BEFTN Bank Batch Transfer File
    const bankRows = pendingWithdrawals.filter(
      (w) => w.payoutMethod.type === "BANK_TRANSFER"
    );

    const header = [
      "Beneficiary_Name",
      "Account_Number",
      "Routing_Number",
      "Bank_Name",
      "Branch_Name",
      "Amount",
      "Payment_Reference",
      "Store_Name",
    ];

    const rows = bankRows.map((w) => [
      `"${(w.payoutMethod.accountName || "").replace(/"/g, '""')}"`,
      `"${w.payoutMethod.accountNumber || ""}"`,
      `"${w.payoutMethod.routingNumber || ""}"`,
      `"${(w.payoutMethod.bankName || "").replace(/"/g, '""')}"`,
      `"${(w.payoutMethod.branchName || "").replace(/"/g, '""')}"`,
      Number(w.amount).toFixed(2),
      `"${w.withdrawalNumber}"`,
      `"${w.store.name.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beftn_bank_payouts_${timestamp}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[API:admin/payouts/export] Error:", error);
    return new NextResponse(error.message || "Failed to generate export file", { status: 500 });
  }
}
