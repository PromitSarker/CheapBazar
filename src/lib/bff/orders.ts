/**
 * Checkout and order lookup through order-service. Keeps the response contract the
 * cart drawer already uses: { success, redirectUrl, orderNumber } or { error }.
 * Prices, stock and fees are decided by the services, never by the browser.
 */
import { callService, ServiceCallError } from "./client";

export interface PlaceOrderResult {
  status: number;
  body: { success: true; redirectUrl: string; orderNumber: string } | { error: string; code?: string };
}

export async function placeOrderViaServices(
  input: any,
  opts: { buyerId?: string | null; idempotencyKey?: string } = {}
): Promise<PlaceOrderResult> {
  const payload = {
    storeSlug: String(input.storeSlug),
    paymentMethod: String(input.paymentMethod || "COD").toUpperCase(),
    orderType: "RETAIL",
    buyer: {
      id: opts.buyerId ?? null,
      name: input.buyerName,
      email: input.buyerEmail || "",
      phone: input.buyerPhone,
    },
    shipping: { address: input.shippingAddress, city: input.shippingCity || "Dhaka" },
    items: (Array.isArray(input.items) ? input.items : []).map((i: any) => ({ productId: i?.id, quantity: i?.quantity })),
    idempotencyKey: opts.idempotencyKey,
  };
  try {
    const order = await callService<any>("order", "POST", "/orders", payload, { timeoutMs: 20_000 });
    if (order.status === "PENDING_PAYMENT") {
      // Online payment hand-off belongs to payment-billing and is switched off for now.
      return { status: 400, body: { error: "Online payment is temporarily unavailable. Please choose Cash on Delivery.", code: "ONLINE_DISABLED" } };
    }
    return {
      status: 200,
      body: { success: true, redirectUrl: `/store/${order.storeSlug}/order/${order.orderNumber}`, orderNumber: order.orderNumber },
    };
  } catch (e) {
    if (e instanceof ServiceCallError) {
      // 4xx messages from the services are written for customers; hide infrastructure errors.
      if (e.status >= 500) return { status: 503, body: { error: "We could not place your order right now. Please try again shortly." } };
      return { status: e.status, body: { error: e.message, code: e.code } };
    }
    throw e;
  }
}

export interface OrderView {
  orderNumber: string;
  paymentMethod: string;
  status: string;
  totalAmount: number;
  buyerName: string;
  buyerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  items: { id: string; name: string; quantity: number; lineTotal: number }[];
  payment: { tranId: string; cardType?: string | null; bankTranId?: string | null } | null;
}

export async function getOrderViewViaServices(slug: string, orderNumber: string): Promise<{ storeName: string; storeSlug: string; order: OrderView } | null> {
  try {
    const o = await callService<any>("order", "GET", `/orders/by-number/${encodeURIComponent(orderNumber)}`);
    if (o.storeSlug !== slug) return null; // an order never shows under another store's URL
    return {
      storeName: o.storeName,
      storeSlug: o.storeSlug,
      order: {
        orderNumber: o.orderNumber,
        paymentMethod: o.paymentMethod,
        status: o.status,
        totalAmount: Number(o.totalAmount),
        buyerName: o.buyerName,
        buyerPhone: o.buyerPhone,
        shippingAddress: o.shippingAddress,
        shippingCity: o.shippingCity,
        items: (o.items ?? []).map((i: any) => ({
          id: i.productId,
          name: i.productName,
          quantity: i.quantity,
          lineTotal: Math.round(Number(i.unitPrice) * i.quantity * 100) / 100,
        })),
        payment: o.paymentRef ? { tranId: o.paymentRef } : null,
      },
    };
  } catch (e) {
    if (e instanceof ServiceCallError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}
