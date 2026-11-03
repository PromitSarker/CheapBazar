import { ServiceError, serviceClient, serviceUrl } from "../../../packages/service-kit";

/** The two things ad-service needs from billing: the store's standing and the ability to charge it. */
export interface LedgerGateway {
  walletStatus(storeId: string): Promise<{ exists: boolean; status: string; available: number }>;
  /** Idempotent by idempotencyKey. Throws ServiceError(402) when funds are insufficient. */
  charge(p: { storeId: string; amount: number; reference: string; description: string; idempotencyKey: string }): Promise<{ ledgerTxId: string; duplicate: boolean }>;
}

export function httpLedger(secret: string): LedgerGateway {
  const c = () => serviceClient({ baseUrl: serviceUrl("ledger"), secret, caller: "ad", timeoutMs: 8000 });
  return {
    walletStatus: async (storeId) => {
      const w = await c().get<any>(`/wallets/${encodeURIComponent(storeId)}/status`);
      return { exists: !!w.exists, status: String(w.status), available: Number(w.available) };
    },
    charge: (p) =>
      c().post<any>(`/wallets/${encodeURIComponent(p.storeId)}/charge`, {
        amount: p.amount, kind: "AD_FEE", reference: p.reference, description: p.description, idempotencyKey: p.idempotencyKey,
      }),
  };
}

export const isInsufficient = (e: unknown) => e instanceof ServiceError && e.status === 402;
