/**
 * Admin back-office through the services (identity: users/stores/KYC, ledger: store status
 * and payouts, catalog: counts, payment-billing: manual top-up review).
 * Used only when USE_SERVICES=true. Every function re-checks the ADMIN role first and
 * records the acting admin's email as the audit actor.
 */
import { callService } from "./client";
import { requireRole } from "@/modules/identity/service";
import type { StoreStatus, UserRole } from "@/modules/identity/types";

const q = encodeURIComponent;

async function admin() {
  return requireRole("ADMIN");
}

async function walletStatuses(): Promise<Map<string, string>> {
  const r = await callService<{ wallets: { storeId: string; status: string }[] }>("ledger", "GET", "/wallets?limit=1000");
  return new Map(r.wallets.map((w) => [w.storeId, w.status]));
}

export async function adminStatsViaServices() {
  await admin();
  const [idn, wallets, cat] = await Promise.all([
    callService<any>("identity", "GET", "/admin/stats"),
    walletStatuses(),
    callService<any>("catalog", "GET", "/admin/stats"),
  ]);
  const statuses = Array.from(wallets.values());
  const notActive = statuses.filter((s) => s !== "ACTIVE").length;
  return {
    totalStores: idn.stores as number,
    activeStores: Math.max(0, idn.stores - notActive), // a store with no wallet row yet counts as active
    suspendedStores: statuses.filter((s) => ["SUSPENDED", "BANNED", "PAUSED"].includes(s)).length,
    totalProducts: cat.products as number,
    totalUsers: idn.users as number,
    sellersCount: (idn.roles?.SELLER ?? 0) as number,
    buyersCount: (idn.roles?.BUYER ?? 0) as number,
  };
}

export async function allStoresViaServices() {
  await admin();
  const [stores, wallets] = await Promise.all([
    callService<{ stores: any[] }>("identity", "GET", "/stores?limit=500"),
    walletStatuses(),
  ]);
  const counts = await Promise.all(
    stores.stores.map((s) =>
      callService<{ products: unknown[] }>("catalog", "GET", `/stores/${q(s.id)}/products`).then((r) => r.products.length).catch(() => 0)
    )
  );
  return stores.stores.map((s, i) => ({
    id: s.id, name: s.name, slug: s.slug, template: s.template, customDomain: s.customDomain ?? null,
    kycVerified: !!s.kycVerified, status: wallets.get(s.id) ?? "ACTIVE", createdAt: s.createdAt,
    owner: { id: s.owner?.id ?? s.ownerId, name: s.owner?.name ?? "", email: s.owner?.email ?? "" },
    _count: { products: counts[i] },
  }));
}

export async function setStoreStatusViaServices(storeId: string, status: StoreStatus, kycVerified?: boolean) {
  const a = await admin();
  await callService("ledger", "POST", `/wallets/${q(storeId)}/status`, { status, reason: "Admin action from the back-office", admin: a.email });
  if (typeof kycVerified === "boolean") {
    await callService("identity", "PATCH", `/stores/${q(storeId)}/kyc`, { kycVerified, admin: a.email });
  }
}

export async function setStoreKycViaServices(storeId: string, kycVerified: boolean) {
  const a = await admin();
  await callService("identity", "PATCH", `/stores/${q(storeId)}/kyc`, { kycVerified, admin: a.email });
}

export async function allUsersViaServices() {
  await admin();
  const [users, wallets] = await Promise.all([
    callService<{ users: any[] }>("identity", "GET", "/users?limit=1000"),
    walletStatuses(),
  ]);
  return users.users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role as UserRole, createdAt: new Date(u.createdAt),
    store: u.store ? { id: u.store.id, name: u.store.name, slug: u.store.slug, status: wallets.get(u.store.id) ?? "ACTIVE" } : null,
  }));
}

export async function setUserRoleViaServices(userId: string, role: UserRole) {
  const a = await admin();
  await callService("identity", "PATCH", `/users/${q(userId)}/role`, { role, admin: a.email });
}

// ------------------------------------------------------------------ payouts

const fmt = (d: string | Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true }).format(new Date(d));

async function storesById(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const r = await callService<{ stores: any[] }>("identity", "GET", `/stores?ids=${q(Array.from(new Set(ids)).join(","))}&limit=500`);
  return new Map(r.stores.map((s) => [s.id, s]));
}

export async function payoutQueueViaServices(status?: string) {
  await admin();
  const r = await callService<{ withdrawals: any[]; stats: { pendingCount: number; pendingAmount: number } }>(
    "ledger", "GET", `/admin/withdrawals${status ? `?status=${q(status)}` : ""}`
  );
  const stores = await storesById(r.withdrawals.map((w) => w.storeId));
  const rows = r.withdrawals.map((w) => {
    const s = stores.get(w.storeId);
    const m = w.payoutMethod ?? {};
    return {
      id: w.id, withdrawalNumber: w.withdrawalNumber, storeId: w.storeId,
      storeName: s?.name ?? "(unknown store)", storeSlug: s?.slug ?? "", ownerName: s?.owner?.name ?? "", ownerEmail: s?.owner?.email ?? "",
      amount: w.amount as number, status: w.status as string, payoutType: m.type ?? "",
      payoutDetails: m.type === "BANK_TRANSFER"
        ? { bankName: m.bankName, branchName: m.branchName, routingNumber: m.routingNumber, accountName: m.accountName, accountNumber: m.accountNumber }
        : { provider: m.type, phoneNumber: m.phoneNumber, accountType: m.accountType },
      disbursementTxId: w.disbursementTxId ?? null, rejectionReason: w.rejectionReason ?? null,
      processedAt: w.processedAt ? new Date(w.processedAt).toISOString() : null, processedBy: w.processedBy ?? null,
      createdAt: fmt(w.createdAt), createdRaw: w.createdAt as string,
    };
  });
  return { rows, stats: r.stats };
}

export async function reviewWithdrawalViaServices(id: string, action: "APPROVE" | "REJECT", disbursementTxId?: string, rejectionReason?: string) {
  const a = await admin();
  return callService<any>("ledger", "POST", `/admin/withdrawals/${q(id)}/review`, {
    action, admin: a.email, disbursementTxId, rejectionReason: rejectionReason?.trim() || (action === "REJECT" ? "Rejected by administration" : undefined),
  });
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Bulk-disbursement CSVs for the PENDING queue (same columns as the monolith exports). */
export async function payoutExportViaServices(format: string): Promise<{ filename: string; body: string }> {
  const { rows } = await payoutQueueViaServices("PENDING");
  const pending = rows.sort((x, y) => +new Date(x.createdRaw) - +new Date(y.createdRaw));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "bkash") {
    const mfs = pending.filter((w) => ["BKASH", "NAGAD", "ROCKET"].includes(w.payoutType));
    const lines = [["Wallet_Number", "Amount", "Invoice_Number", "Channel", "Store_Name"].join(",")].concat(
      mfs.map((w) => [csv((w.payoutDetails as any).phoneNumber), w.amount.toFixed(2), csv(w.withdrawalNumber), csv(w.payoutType), csv(w.storeName)].join(","))
    );
    return { filename: `bulk_mfs_disbursement_${stamp}.csv`, body: lines.join("\n") };
  }
  const bank = pending.filter((w) => w.payoutType === "BANK_TRANSFER");
  const lines = [["Beneficiary_Name", "Account_Number", "Routing_Number", "Bank_Name", "Branch_Name", "Amount", "Payment_Reference", "Store_Name"].join(",")].concat(
    bank.map((w) => {
      const d = w.payoutDetails as any;
      return [csv(d.accountName), csv(d.accountNumber), csv(d.routingNumber), csv(d.bankName), csv(d.branchName), w.amount.toFixed(2), csv(w.withdrawalNumber), csv(w.storeName)].join(",");
    })
  );
  return { filename: `beftn_bank_payouts_${stamp}.csv`, body: lines.join("\n") };
}

// ------------------------------------------------------- manual top-up review

export async function manualPaymentsViaServices(status?: string) {
  await admin();
  const r = await callService<{ payments: any[] }>("payment", "GET", `/admin/manual-payments${status ? `?status=${q(status)}` : ""}${status ? "&" : "?"}limit=100`);
  const stores = await storesById(r.payments.map((p) => p.storeId).filter(Boolean));
  const buyerIds = Array.from(new Set(r.payments.filter((p) => p.purpose === "SUBSCRIPTION" && p.userId).map((p) => p.userId as string)));
  const buyers = new Map<string, { name: string; email: string }>();
  await Promise.all(buyerIds.map(async (id) => {
    try { const u = await callService<any>("identity", "GET", `/users/${q(id)}`); buyers.set(id, { name: u.name, email: u.email }); } catch { /* shown as unknown */ }
  }));
  return r.payments.map((p) => {
    const sub = p.purpose === "SUBSCRIPTION";
    const b = sub ? buyers.get(p.userId) : undefined;
    return {
      ...p,
      kind: sub ? "Buyer Pro" : "Wallet top-up",
      storeName: sub ? (b ? `${b.name} (${b.email})` : "(unknown buyer)") : stores.get(p.storeId)?.name ?? "(unknown store)",
      storeSlug: sub ? "" : stores.get(p.storeId)?.slug ?? "",
      createdLabel: fmt(p.createdAt),
    };
  });
}

export async function reviewManualPaymentViaServices(id: string, decision: "APPROVE" | "REJECT", note?: string) {
  const a = await admin();
  return callService<any>("payment", "PATCH", `/admin/manual-payments/${q(id)}/review`, { decision, admin: a.email, note });
}
