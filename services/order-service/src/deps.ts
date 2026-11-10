import { HttpError, ServiceError, serviceClient, serviceUrl } from "../../../packages/service-kit";

/**
 * Everything order-service needs from other services, behind one interface so the
 * saga is unit-testable and each integration has a single place to change.
 */
export interface StoreRef {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
}
export interface Quote {
  lines: Array<{ productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
}
export interface WalletStatus {
  status: string;
  acceptsOrders: boolean;
  codAllowed: boolean;
}

export interface Deps {
  identity: { getStore(ref: { id?: string; slug?: string }): Promise<StoreRef | null> };
  catalog: {
    quote(p: { storeId: string; orderType: "RETAIL" | "WHOLESALE"; items: Array<{ productId: string; quantity: number }> }): Promise<Quote>;
    reserve(p: { orderRef: string; storeId: string; items: Array<{ productId: string; quantity: number }>; ttlMinutes: number }): Promise<void>;
    commit(orderRef: string): Promise<void>;
    release(orderRef: string): Promise<void>;
  };
  ledger: {
    walletStatus(storeId: string): Promise<WalletStatus>;
    placeHold(storeId: string, reference: string, amount: number): Promise<void>;
    releaseHold(storeId: string, reference: string, reason: string): Promise<void>;
  };
  billing: {
    buyerProActive(userId: string): Promise<boolean>;
  };
}

/** Turn a downstream failure into the HTTP error the buyer should see. */
export function asHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof ServiceError) {
    if (e.code === "UNREACHABLE" || e.status >= 500) {
      return new HttpError(503, "A required service is temporarily unavailable. Please try again.", "SERVICE_UNAVAILABLE");
    }
    return new HttpError(e.status, e.message, e.code, e.body?.details);
  }
  return new HttpError(500, "Unexpected error while processing the order.", "INTERNAL");
}

export function httpDeps(secret: string): Deps {
  const c = (svc: string, timeoutMs = 8000) => serviceClient({ baseUrl: serviceUrl(svc), secret, caller: "order", timeoutMs });
  return {
    identity: {
      async getStore(ref) {
        try {
          const q = ref.id ? `/stores/${encodeURIComponent(ref.id)}` : `/tenants/resolve?slug=${encodeURIComponent(ref.slug ?? "")}`;
          const s = await c("identity").get<any>(q);
          return { id: s.id, slug: s.slug, name: s.name, ownerId: s.ownerId };
        } catch (e) {
          if (e instanceof ServiceError && e.status === 404) return null;
          throw e;
        }
      },
    },
    catalog: {
      quote: (p) => c("catalog").post("/pricing/quote", p),
      async reserve(p) { await c("catalog").post("/inventory/reserve", p); },
      async commit(orderRef) { await c("catalog").post("/inventory/commit", { orderRef }); },
      async release(orderRef) { await c("catalog").post("/inventory/release", { orderRef }); },
    },
    ledger: {
      walletStatus: (storeId) => c("ledger").get(`/wallets/${encodeURIComponent(storeId)}/status`),
      async placeHold(storeId, reference, amount) { await c("ledger").post(`/wallets/${encodeURIComponent(storeId)}/holds`, { reference, amount }); },
      async releaseHold(storeId, reference, reason) { await c("ledger").post(`/wallets/${encodeURIComponent(storeId)}/release-hold`, { reference, reason }); },
    },
    billing: {
      async buyerProActive(userId) { return (await c("payment").get<{ active: boolean }>(`/subscriptions/buyer/${encodeURIComponent(userId)}/status`)).active === true; },
    },
  };
}
