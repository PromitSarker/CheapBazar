import { requireStore } from "@/lib/tenant";
import AdsView from "@/components/dashboard/AdsView";

export const dynamic = "force-dynamic";

export default async function AdManagerPage() {
  const store = await requireStore();

  return <AdsView storeSlug={store.slug} />;
}

