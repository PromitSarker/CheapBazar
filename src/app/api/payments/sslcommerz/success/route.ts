import { NextResponse } from "next/server";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const tranId = String(formData.get("tran_id") || "");
    const valId = String(formData.get("val_id") || "");

    if (!tranId || !valId) {
      console.error("[SSLCommerz:success] Missing tran_id or val_id");
      return NextResponse.redirect(new URL("/payment/status?status=failed&error=missing_params", APP_URL), {
        status: 303,
      });
    }

    const result = await sslcommerzService.handlePaymentValidation(valId, tranId);

    if (result.purpose === "STORE_ORDER" && result.storeSlug && result.orderNumber) {
      return NextResponse.redirect(
        new URL(`/store/${result.storeSlug}/order/${result.orderNumber}?status=success`, APP_URL),
        { status: 303 }
      );
    }

    if (result.purpose === "WALLET_TOPUP") {
      return NextResponse.redirect(
        new URL("/dashboard/wallet?status=topup_success", APP_URL),
        { status: 303 }
      );
    }

    return NextResponse.redirect(
      new URL(`/payment/status?status=success&tran_id=${tranId}`, APP_URL),
      { status: 303 }
    );
  } catch (error: any) {
    console.error("[SSLCommerz:success] Validation failed:", error);
    return NextResponse.redirect(
      new URL(`/payment/status?status=failed&error=${encodeURIComponent(error.message || "validation_error")}`, APP_URL),
      { status: 303 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tranId = searchParams.get("tran_id") || "";
  const valId = searchParams.get("val_id") || "";

  if (tranId && valId) {
    try {
      const result = await sslcommerzService.handlePaymentValidation(valId, tranId);
      if (result.purpose === "STORE_ORDER" && result.storeSlug && result.orderNumber) {
        return NextResponse.redirect(
          new URL(`/store/${result.storeSlug}/order/${result.orderNumber}?status=success`, APP_URL),
          { status: 303 }
        );
      }
      return NextResponse.redirect(new URL("/dashboard/wallet?status=topup_success", APP_URL), { status: 303 });
    } catch (e: any) {
      console.error("[SSLCommerz:success/GET] Validation error:", e);
      return NextResponse.redirect(
        new URL(`/payment/status?status=failed&error=${encodeURIComponent(e.message || "validation_error")}`, APP_URL),
        { status: 303 }
      );
    }
  }

  return NextResponse.redirect(new URL("/payment/status?status=success", APP_URL), { status: 303 });
}
