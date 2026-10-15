import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import WalletView from "@/components/dashboard/WalletView";

export const dynamic = "force-dynamic";

export default async function WalletPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const store = await requireStore();

  const fullStore = await prisma.store.findUnique({
    where: { id: store.id },
  });

  const rawEntries = await prisma.ledgerEntry.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const rawMethods = await prisma.storePayoutMethod.findMany({
    where: { storeId: store.id, isArchived: false },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const rawWithdrawals = await prisma.withdrawalRequest.findMany({
    where: { storeId: store.id },
    include: { payoutMethod: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const ledgerEntries = rawEntries.map((e) => ({
    id: e.transactionId || e.id.slice(0, 8),
    type: e.entryType,
    desc: e.description,
    debit: e.debit ? Number(e.debit) : null,
    credit: e.credit ? Number(e.credit) : null,
    timestamp: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(e.createdAt),
  }));

  const payoutMethods = rawMethods.map((m) => ({
    id: m.id,
    type: m.type,
    accountType: m.accountType,
    phoneNumber: m.phoneNumber,
    bankName: m.bankName,
    branchName: m.branchName,
    routingNumber: m.routingNumber,
    accountName: m.accountName,
    accountNumber: m.accountNumber,
    isDefault: m.isDefault,
    coolingUntil: m.coolingUntil ? m.coolingUntil.toISOString() : null,
  }));

  const withdrawals = rawWithdrawals.map((w) => {
    const destination =
      w.payoutMethod.type === "BANK_TRANSFER"
        ? `${w.payoutMethod.bankName} (A/C: ${w.payoutMethod.accountNumber?.slice(-4).padStart(w.payoutMethod.accountNumber?.length || 4, "*")})`
        : `${w.payoutMethod.type} (${w.payoutMethod.phoneNumber})`;

    return {
      id: w.id,
      withdrawalNumber: w.withdrawalNumber,
      amount: Number(w.amount),
      status: w.status,
      disbursementTxId: w.disbursementTxId,
      rejectionReason: w.rejectionReason,
      createdAt: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(w.createdAt),
      payoutMethodType: w.payoutMethod.type,
      destination,
    };
  });

  return (
    <WalletView
      storeId={store.id}
      storeStatus={fullStore?.status || store.status}
      totalBalance={Number(fullStore?.walletBalance ?? 4850.00)}
      walletHolds={Number(fullStore?.walletHolds ?? 0.00)}
      initialLedgerEntries={ledgerEntries}
      initialPayoutMethods={payoutMethods}
      initialWithdrawals={withdrawals}
      initialStatusAlert={searchParams?.status}
    />
  );
}
