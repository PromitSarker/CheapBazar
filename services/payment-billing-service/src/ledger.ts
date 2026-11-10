import { serviceClient, serviceUrl } from "../../../packages/service-kit";

/** What billing needs from ledger-service. */
export interface LedgerGateway {
  walletExists(storeId: string): Promise<boolean>;
  /** Idempotent: reverses the split settlement recorded for this payment (refund / chargeback). */
  reverseSettlement(p: { storeId: string; tranId: string; reason: string }): Promise<{ reversed: boolean }>;
}

export function httpLedger(secret: string): LedgerGateway {
  const c = () => serviceClient({ baseUrl: serviceUrl("ledger"), secret, caller: "payment", timeoutMs: 8000 });
  return {
    async walletExists(storeId) {
      const w = await c().get<any>(`/wallets/${encodeURIComponent(storeId)}/status`);
      return !!w.exists;
    },
    reverseSettlement: (p) =>
      c().post<any>(`/wallets/${encodeURIComponent(p.storeId)}/reverse-settlement`, { tranId: p.tranId, reason: p.reason }),
  };
}

