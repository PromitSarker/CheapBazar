/**
 * Seller wallet through the services: balance and statement (ledger), payout methods
 * and withdrawals (ledger), manual top-ups (payment-billing). Used only when
 * USE_SERVICES=true. Store scope always comes from the logged-in seller.
 */
import crypto from "crypto";
import { callService, ServiceCallError } from "./client";

const q = encodeURIComponent;
const stamp = (d: string | Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true }).format(new Date(d));

export interface WalletSnapshot {
  status: string;
  balance: number;
  holds: number;
  available: number;
  withdrawable: number;
  minReserve: number;
}

export async function walletSnapshot(storeId: string): Promise<WalletSnapshot> {
  const w = await callService<any>("ledger", "GET", `/wallets/${q(storeId)}/status`);
  return {
    status: w.status, balance: w.balance, holds: w.holds, available: w.available,
    withdrawable: w.withdrawable, minReserve: w.thresholds?.reserve ?? 500,
  };
}

export async function walletPageData(storeId: string) {
  const [w, st, pm, wd] = await Promise.all([
    walletSnapshot(storeId),
    callService<{ entries: any[] }>("ledger", "GET", `/wallets/${q(storeId)}/statement?limit=25`),
    callService<{ methods: any[] }>("ledger", "GET", `/wallets/${q(storeId)}/payout-methods`),
    callService<{ withdrawals: any[] }>("ledger", "GET", `/wallets/${q(storeId)}/withdrawals?limit=15`),
  ]);
  return {
    wallet: w,
    ledgerEntries: st.entries.map((e) => ({
      id: e.transactionId || String(e.id).slice(0, 8), type: e.entryType, desc: e.description,
      debit: e.debit ?? null, credit: e.credit ?? null, timestamp: stamp(e.createdAt),
    })),
    payoutMethods: pm.methods.map((m) => ({
      id: m.id, type: m.type, accountType: m.accountType, phoneNumber: m.phoneNumber, bankName: m.bankName,
      branchName: m.branchName, routingNumber: m.routingNumber, accountName: m.accountName, accountNumber: m.accountNumber,
      isDefault: m.isDefault, coolingUntil: m.coolingUntil ? new Date(m.coolingUntil).toISOString() : null,
    })),
    withdrawals: wd.withdrawals.map((w2) => ({
      id: w2.id, withdrawalNumber: w2.withdrawalNumber, amount: w2.amount, status: w2.status,
      disbursementTxId: w2.disbursementTxId, rejectionReason: w2.rejectionReason, createdAt: stamp(w2.createdAt),
      payoutMethodType: w2.payoutMethod?.type ?? "", destination: w2.destination ?? "",
    })),
  };
}

/** Run a service call and turn its answer into { status, body } for a route handler. */
export async function asRoute<T>(fn: () => Promise<T>, map: (v: T) => unknown): Promise<{ status: number; body: any }> {
  try {
    return { status: 200, body: map(await fn()) };
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.status >= 500) return { status: 503, body: { error: "The wallet service is unavailable right now. Please try again shortly." } };
      return { status: e.status, body: { error: e.message } };
    }
    throw e;
  }
}

export const withdrawViaServices = (storeId: string, payoutMethodId: string, amount: number) =>
  asRoute(
    () => callService<any>("ledger", "POST", `/wallets/${q(storeId)}/withdrawals`, { payoutMethodId, amount }),
    (r) => ({ success: true, withdrawalNumber: r.withdrawal.withdrawalNumber, amount: r.withdrawal.amount })
  );

export const addPayoutMethodViaServices = (storeId: string, body: any) =>
  asRoute(() => callService<any>("ledger", "POST", `/wallets/${q(storeId)}/payout-methods`, body), (r) => ({ success: true, method: r.method }));

export const listPayoutMethodsViaServices = (storeId: string) =>
  asRoute(() => callService<any>("ledger", "GET", `/wallets/${q(storeId)}/payout-methods`), (r) => ({ methods: r.methods }));

export const deletePayoutMethodViaServices = (storeId: string, id: string) =>
  asRoute(() => callService<any>("ledger", "DELETE", `/wallets/${q(storeId)}/payout-methods/${q(id)}`), () => ({ success: true }));

export const withdrawalSummaryViaServices = (storeId: string) =>
  asRoute(
    async () => ({
      w: await walletSnapshot(storeId),
      list: await callService<{ withdrawals: any[] }>("ledger", "GET", `/wallets/${q(storeId)}/withdrawals?limit=20`),
    }),
    ({ w, list }) => ({
      totalBalance: w.balance, walletHolds: w.holds, minReserve: w.minReserve,
      availableBalance: w.available, withdrawableBalance: w.withdrawable, withdrawals: list.withdrawals,
    })
  );

/**
 * Manual top-up: the seller pays the platform by bKash/Nagad/Rocket/bank/cash and submits
 * the transaction id; an admin approves it and the ledger credits the wallet.
 * One idempotency key per (store, method, trxId) so a double click never submits twice.
 */
export const submitTopUpViaServices = (storeId: string, userId: string, amount: number, method: string, trxId: string) =>
  asRoute(
    () =>
      callService<any>("payment", "POST", "/topups/manual", {
        purpose: "WALLET_TOPUP", storeId, userId, amount, method, trxId,
        idempotencyKey: crypto.createHash("sha256").update(`${storeId}|${method}|${trxId}`).digest("hex").slice(0, 40),
      }),
    (p) => ({ success: true, status: p.status ?? "PENDING", reference: p.id ?? p.reference ?? null })
  );

export const listTopUpsViaServices = (storeId: string) =>
  asRoute(() => callService<any>("payment", "GET", `/topups/manual?storeId=${q(storeId)}&limit=10`), (r) => ({ payments: r.payments }));

export async function updateStoreViaServices(
  storeId: string, actorId: string, input: { name: string; slug: string; template: string; customDomain: string | null }
): Promise<"ok" | "slug-taken" | "domain-taken" | "invalid"> {
  try {
    await callService("identity", "PATCH", `/stores/${q(storeId)}`, { ...input, actorId });
    return "ok";
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.code === "SLUG_TAKEN") return "slug-taken";
      if (e.code === "DOMAIN_TAKEN") return "domain-taken";
      if (e.status === 400 || e.status === 403 || e.status === 404) return "invalid";
    }
    throw e;
  }
}
