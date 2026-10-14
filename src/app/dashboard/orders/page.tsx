import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import OrdersView from "@/components/dashboard/OrdersView";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const store = await requireStore();

  const dbOrders = await prisma.order.findMany({
    where: { storeId: store.id },
    include: {
      items: { include: { product: true } },
      payment: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const formattedOrders = dbOrders.map((o) => ({
    rawId: o.id,
    id: o.orderNumber,
    customer: `${o.buyerName} (${o.buyerPhone})`,
    items: o.items.map((it) => `${it.quantity}x ${it.product.name}`).join(", ") || "No items",
    total: Number(o.totalAmount),
    paymentMethod: o.paymentMethod === "SSLCOMMERZ" ? "SSLCommerz (Online)" : "Cash On Delivery (COD)",
    status: o.status,
    date: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(o.createdAt),
  }));

  return <OrdersView initialOrders={formattedOrders} />;
}
