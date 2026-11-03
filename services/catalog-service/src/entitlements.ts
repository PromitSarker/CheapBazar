import { serviceClient, serviceUrl } from "../../../packages/service-kit";

/** What catalog needs to know from payment-billing-service. Injectable for tests. */
export interface Entitlements {
  /** Does this store hold an active (or in-grace) Seller Pro plan? Must fail CLOSED. */
  sellerPlanActive(storeId: string): Promise<boolean>;
}

export function httpEntitlements(secret: string): Entitlements {
  const client = () => serviceClient({ baseUrl: serviceUrl("payment"), secret, caller: "catalog", timeoutMs: 4000 });
  return {
    async sellerPlanActive(storeId: string) {
      try {
        const r = await client().get<{ active: boolean }>(`/subscriptions/seller/${encodeURIComponent(storeId)}/status`);
        return r.active === true;
      } catch {
        return false; // billing unreachable => do not allow wholesale publishing
      }
    },
  };
}
