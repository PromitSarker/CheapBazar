import { NextResponse } from "next/server";
import { sslcommerzService } from "@/modules/payments/sslcommerz/service";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const tranId = String(formData.get("tran_id") || "");

    if (tranId) {
      await sslcommerzService.handlePaymentFailure(tranId, "CANCELLED");
    }

    return NextResponse.redirect(
      new URL(`/payment/status?status=cancelled&tran_id=${tranId}`, APP_URL),
      { status: 303 }
    );
  } catch (error: any) {
    console.error("[SSLCommerz:cancel] Error:", error);
    return NextResponse.redirect(new URL("/payment/status?status=cancelled", APP_URL), { status: 303 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tranId = searchParams.get("tran_id") || "";
  try {
    if (tranId) {
      await sslcommerzService.handlePaymentFailure(tranId, "CANCELLED");
    }
  } catch (error) {
    console.error("[SSLCommerz:cancel/GET] Error:", error);
  }
  return NextResponse.redirect(new URL(`/payment/status?status=cancelled&tran_id=${tranId}`, APP_URL), { status: 303 });
}
