import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import OverviewView from "@/components/dashboard/OverviewView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const store = await requireStore();
  const [productCount, stockAgg, lowStock] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.product.aggregate({ where: { storeId: store.id }, _sum: { stock: true } }),
    prisma.product.count({ where: { storeId: store.id, stock: { gt: 0, lt: 5 } } }),
  ]);

  return (
    <OverviewView
      storeSlug={store.slug}
      template={store.template}
      productCount={productCount}
      unitsInStock={stockAgg._sum.stock ?? 0}
      lowStockCount={lowStock}
    />
  );
}

