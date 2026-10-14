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

  return (
    <WalletView
      storeId={store.id}
      storeStatus={fullStore?.status || store.status}
      totalBalance={Number(fullStore?.walletBalance ?? 4850.00)}
      walletHolds={Number(fullStore?.walletHolds ?? 0.00)}
      initialLedgerEntries={ledgerEntries}
      initialStatusAlert={searchParams?.status}
    />
  );
}
