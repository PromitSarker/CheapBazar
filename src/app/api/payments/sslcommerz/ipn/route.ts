import { NextResponse } from "next/server";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const tranId = String(formData.get("tran_id") || "");
    const valId = String(formData.get("val_id") || "");
    const status = String(formData.get("status") || "");

    console.log(`[SSLCommerz:IPN] Received webhook for tranId=${tranId}, status=${status}, valId=${valId}`);

    if (!tranId || !valId) {
      return NextResponse.json({ error: "Missing tran_id or val_id" }, { status: 400 });
    }

    if (status === "VALID" || status === "VALIDATED") {
      await sslcommerzService.handlePaymentValidation(valId, tranId);
    } else if (status === "FAILED") {
      await sslcommerzService.handlePaymentFailure(tranId, "FAILED");
    } else if (status === "CANCELLED") {
      await sslcommerzService.handlePaymentFailure(tranId, "CANCELLED");
    }

    return NextResponse.json({ message: "IPN processed successfully", tranId }, { status: 200 });
  } catch (error: any) {
    console.error("[SSLCommerz:IPN] Processing error:", error);
    // Return 200/500 depending on idempotency
    return NextResponse.json({ error: error.message || "IPN error" }, { status: 500 });
  }
}
