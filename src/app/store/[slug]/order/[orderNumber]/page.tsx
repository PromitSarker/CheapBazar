import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { servicesEnabled } from "@/lib/bff/client";
import { getOrderViewViaServices, type OrderView } from "@/lib/bff/orders";

async function loadOrder(slug: string, orderNumber: string): Promise<{ store: { name: string; slug: string }; order: OrderView } | null> {
  if (servicesEnabled()) {
    const r = await getOrderViewViaServices(slug, orderNumber);
    return r ? { store: { name: r.storeName, slug: r.storeSlug }, order: r.order } : null;
  }
  const store = await prisma.store.findUnique({ where: { slug } });
  if (!store) return null;
  const o = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: { include: { product: true } }, payment: true },
  });
  if (!o || o.storeId !== store.id) return null;
  return {
    store: { name: store.name, slug: store.slug },
    order: {
      orderNumber: o.orderNumber,
      paymentMethod: o.paymentMethod,
      status: o.status,
      totalAmount: Number(o.totalAmount),
      buyerName: o.buyerName,
      buyerPhone: o.buyerPhone,
      shippingAddress: o.shippingAddress,
      shippingCity: o.shippingCity,
      items: o.items.map((it) => ({ id: it.id, name: it.product.name, quantity: it.quantity, lineTotal: Number(it.price) * it.quantity })),
      payment: o.payment ? { tranId: o.payment.tranId, cardType: o.payment.cardType, bankTranId: o.payment.bankTranId } : null,
    },
  };
}
import { formatTaka } from "@/modules/i18n/translations";

interface PageProps {
  params: {
    slug: string;
    orderNumber: string;
  };
  searchParams: {
    status?: string;
  };
}

export const dynamic = "force-dynamic";

export default async function OrderConfirmationPage({ params, searchParams }: PageProps) {
  const loaded = await loadOrder(params.slug, params.orderNumber);
  if (!loaded) return notFound();
  const { store, order } = loaded;

  const isPaid = order.status === "CONFIRMED";

  return (
    <div style={{ maxWidth: "680px", margin: "3rem auto", padding: "0 1.5rem" }}>
      <div className="card" style={{ padding: "2.5rem 2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>
          
        </div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "0.5rem" }}>
          {isPaid ? "Payment Confirmed!" : "Order Placed Successfully"}
        </h1>
        <p className="muted" style={{ marginBottom: "1.5rem" }}>
          Thank you for ordering from <strong>{store.name}</strong>. Your order is now recorded on the ledger.
        </p>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "1rem",
          marginBottom: "1.5rem",
          textAlign: "left",
        }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>Order Number</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{order.orderNumber}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>Payment Method</div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
              {order.paymentMethod === "SSLCOMMERZ" ? "SSLCommerz (Online)" : "Cash On Delivery"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>Status</div>
            <span style={{
              display: "inline-block",
              padding: "0.2rem 0.6rem",
              borderRadius: "999px",
              fontSize: "0.8rem",
              fontWeight: 600,
              backgroundColor: isPaid ? "rgba(74, 222, 128, 0.15)" : "rgba(250, 204, 21, 0.15)",
              color: isPaid ? "var(--success)" : "var(--warning)",
            }}>
              ● {order.status}
            </span>
          </div>
        </div>

        {order.payment && (
          <div style={{
            fontSize: "0.85rem",
            color: "var(--text-tertiary)",
            textAlign: "left",
            backgroundColor: "var(--surface-muted)",
            border: "1px solid var(--surface-muted)",
            borderRadius: "6px",
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
          }}>
            <div><strong>Transaction Reference:</strong> <code>{order.payment.tranId}</code></div>
            {order.payment.cardType && <div><strong>Gateway Method:</strong> {order.payment.cardType}</div>}
            {order.payment.bankTranId && <div><strong>Bank Ref:</strong> {order.payment.bankTranId}</div>}
          </div>
        )}

        <div style={{ textAlign: "left", marginBottom: "2rem" }}>
          <h3 style={{ fontSize: "1.1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            Items Ordered
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0" }}>
            {order.items.map((it) => (
              <li key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{it.name}</span>
                  <span className="muted" style={{ marginLeft: "0.5rem" }}>&times; {it.quantity}</span>
                </div>
                <div style={{ fontWeight: 600 }}>
                  {formatTaka(it.lineTotal)}
                </div>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2rem", fontWeight: 700, paddingTop: "0.5rem" }}>
            <span>Total</span>
            <span style={{ color: "var(--text-primary)" }}>{formatTaka(order.totalAmount)}</span>
          </div>
        </div>

        <div style={{ textAlign: "left", marginBottom: "2rem", backgroundColor: "var(--bg-secondary)", padding: "1rem", borderRadius: "6px" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>Shipping Details</h4>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            <strong>{order.buyerName}</strong> ({order.buyerPhone})<br />
            {order.shippingAddress}, {order.shippingCity}
          </p>
        </div>

        <Link href={`/store/${store.slug}`} className="button glow-button" style={{ width: "100%" }}>
          Continue Shopping at {store.name}
        </Link>
      </div>
    </div>
  );
}
