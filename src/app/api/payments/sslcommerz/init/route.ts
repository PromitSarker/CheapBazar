import { NextResponse } from "next/server";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";
import { getCurrentUser } from "@/modules/identity/service";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purpose } = body;

    if (purpose === "STORE_ORDER") {
      const { orderId } = body;
      if (!orderId) {
        return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
      }

      const result = await sslcommerzService.initiateOrderCheckout(orderId);
      return NextResponse.json(result);
    }

    if (purpose === "WALLET_TOPUP") {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { amount, storeId } = body;
      if (!amount || Number(amount) < 10) {
        return NextResponse.json({ error: "Amount must be at least ৳10.00 BDT" }, { status: 400 });
      }

      // Verify the user owns this store or is admin
      const store = await prisma.store.findFirst({
        where: { id: storeId, ownerId: user.id },
      });

      if (!store) {
        return NextResponse.json({ error: "Store not found or access denied" }, { status: 403 });
      }

      const result = await sslcommerzService.initiateWalletTopUp({
        storeId: store.id,
        amount: Number(amount),
        userName: user.name,
        userEmail: user.email,
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unsupported payment purpose" }, { status: 400 });
  } catch (error: any) {
    console.error("[API:payments/sslcommerz/init] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initialize payment session" },
      { status: 500 }
    );
  }
}
