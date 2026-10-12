import { requireStore } from "@/lib/tenant";
import WalletView from "@/components/dashboard/WalletView";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const store = await requireStore();

  return <WalletView storeStatus={store.status} />;
}

