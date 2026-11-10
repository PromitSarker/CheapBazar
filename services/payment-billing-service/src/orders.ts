import { ServiceError, serviceClient, serviceUrl } from "../../../packages/service-kit";

export interface OrderInfo {
  orderNumber: string;
  storeId: string;
  storeName?: string;
  status: string;
  paymentMethod: string;
  totalAmount: number;
  platformFee: number;
  sellerNet: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  shippingAddress?: string;
  shippingCity?: string;
}

/** Billing never trusts the caller for what an order costs: it asks order-service. */
export interface OrderGateway {
  get(orderNumber: string): Promise<OrderInfo | null>;
}

export function httpOrders(secret: string): OrderGateway {
  return {
    async get(orderNumber) {
      try {
        return await serviceClient({ baseUrl: serviceUrl("order"), secret, caller: "payment", timeoutMs: 6000 })
          .get<OrderInfo>(`/orders/by-number/${encodeURIComponent(orderNumber)}`);
      } catch (e) {
        if (e instanceof ServiceError && e.status === 404) return null;
        throw e;
      }
    },
  };
}
