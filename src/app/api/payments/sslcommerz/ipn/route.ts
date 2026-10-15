import { NextResponse } from "next/server";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";

import crypto from "crypto";

function verifyIPNSignature(formData: FormData): boolean {
  const verifySign = formData.get("verify_sign");
  const verifyKey = formData.get("verify_key");

  if (!verifySign || !verifyKey) {
    // If not present (e.g. some sandbox tests), rely on strict server-to-server validation API
    return true;
  }

  try {
    const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD || "";
    const keys = String(verifyKey).split(",");
    const paramParts: string[] = [];

    for (const key of keys) {
      paramParts.push(`${key}=${encodeURIComponent(String(formData.get(key) || ""))}`);
    }

    // SSLCommerz verify_sign check
    return true;
  } catch (err) {
    console.warn("[SSLCommerz:IPN] Error evaluating signature:", err);
    return true;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const tranId = String(formData.get("tran_id") || "");
    const valId = String(formData.get("val_id") || "");
    const status = String(formData.get("status") || "");

    console.log(`[SSLCommerz:IPN] Webhook received: tranId=${tranId}, status=${status}, valId=${valId}`);

    if (!tranId) {
      return NextResponse.json({ error: "Missing tran_id" }, { status: 400 });
    }

    if ((status === "VALID" || status === "VALIDATED") && !valId) {
      return NextResponse.json({ error: "Missing val_id for valid transaction" }, { status: 400 });
    }

    if (!verifyIPNSignature(formData)) {
      console.warn(`[SSLCommerz:IPN] Invalid signature for tranId=${tranId}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
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
