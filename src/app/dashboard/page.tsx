import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { servicesEnabled } from "@/lib/bff/client";
import { listProductsViaServices } from "@/lib/bff/portal";
import OverviewView from "@/components/dashboard/OverviewView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const store = await requireStore();

  if (servicesEnabled()) {
    const list = await listProductsViaServices(store.id);
    return (
      <OverviewView
        storeSlug={store.slug}
        template={store.template}
        productCount={list.length}
        unitsInStock={list.reduce((n, p) => n + p.stock, 0)}
        lowStockCount={list.filter((p) => p.stock > 0 && p.stock < 5).length}
      />
    );
  }

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

