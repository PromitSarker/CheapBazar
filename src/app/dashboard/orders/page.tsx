import { requireStore } from "@/lib/tenant";
import OrdersView from "@/components/dashboard/OrdersView";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireStore();

  return <OrdersView />;
}

