import { serviceClient, serviceUrl } from "../../../packages/service-kit";

/** What the aggregator needs from payment-billing-service. Injectable for tests. */
export interface Entitlements {
  /** Does this user hold an active (or in-grace) Buyer Pro plan? Must fail CLOSED. */
  buyerProActive(userId: string): Promise<boolean>;
}

export function httpEntitlements(secret: string): Entitlements {
  return {
    async buyerProActive(userId) {
      try {
        const c = serviceClient({ baseUrl: serviceUrl("payment"), secret, caller: "aggregator", timeoutMs: 3000 });
        return (await c.get<{ active: boolean }>(`/subscriptions/buyer/${encodeURIComponent(userId)}/status`)).active === true;
      } catch {
        return false; // billing unreachable => show the locked preview, never leak prices
      }
    },
  };
}
