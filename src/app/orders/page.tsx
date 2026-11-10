import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { myOrdersViaServices } from "@/lib/bff/orders";
import { cancelOrder } from "./actions";

export const dynamic = "force-dynamic";

const COLOR: Record<string, string> = {
  CONFIRMED: "#38bdf8", PENDING_PAYMENT: "#facc15", PROCESSING: "#38bdf8", SHIPPED: "#a78bfa",
  DELIVERED: "#4ade80", CANCELLED: "#94a3b8", REFUSED: "#f87171",
};
const LABEL: Record<string, string> = { PENDING_PAYMENT: "Awaiting payment", REFUSED: "Refused at delivery" };
const day = (v: string) => new Date(v).toISOString().slice(0, 10);

export default async function MyOrdersPage({ searchParams }: { searchParams: { error?: string; cancelled?: string } }) {
  if (!servicesEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orders = await myOrdersViaServices(user.id);

  return (
    <div style={{ maxWidth: 760, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>My orders</h1>
      <p className="muted">Orders you placed while signed in to this account. Orders placed as a guest are not listed here; use the link on their confirmation page.</p>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.cancelled && <p style={{ color: "#4ade80" }}>Your order was cancelled.</p>}

      {orders.length === 0 && (
        <div className="card" style={{ padding: "1.5rem", margin: "1.25rem 0" }}>
          <p style={{ margin: 0 }}>You have not placed any orders yet.</p>
          <Link href="/browse" className="button button-small glow-button" style={{ marginTop: "0.75rem" }}>Browse the marketplace</Link>
        </div>
      )}

      {orders.map((o) => (
        <div key={o.id} className="card" style={{ padding: "1.25rem 1.5rem", margin: "1rem 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <Link href={`/store/${o.storeSlug}/order/${o.orderNumber}`}><strong>{o.orderNumber}</strong></Link>
              {o.orderType === "WHOLESALE" && <span className="hero-badge" style={{ marginLeft: "0.5rem", padding: "1px 8px", fontSize: "0.7rem" }}>Wholesale</span>}
              <div className="muted small">{o.storeName} · {day(o.createdAt)} · {o.paymentMethod === "COD" ? "Cash on Delivery" : o.paymentMethod}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong style={{ color: COLOR[o.status] ?? "inherit" }}>{LABEL[o.status] ?? o.status.charAt(0) + o.status.slice(1).toLowerCase()}</strong>
              <div style={{ fontWeight: 700 }}>৳{o.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
          <ul style={{ margin: "0.75rem 0 0 0", paddingLeft: "1.1rem" }}>
            {o.items.map((i, idx) => <li key={idx}>{i.quantity} × {i.name}</li>)}
          </ul>
          {o.trackingNumber && <p className="small muted" style={{ margin: "0.6rem 0 0 0" }}>{o.courierName ? `${o.courierName} · ` : ""}Tracking: <code>{o.trackingNumber}</code></p>}
          {o.canCancel && (
            <form action={cancelOrder} style={{ marginTop: "0.75rem" }}>
              <input type="hidden" name="id" value={o.id} />
              <button type="submit" className="button button-small button-outline">Cancel this order</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
