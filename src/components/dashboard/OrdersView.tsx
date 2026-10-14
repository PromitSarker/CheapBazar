"use client";

import React, { useState } from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface OrderItemVM {
  rawId?: string;
  id: string;
  customer: string;
  items: string;
  total: number;
  paymentMethod: string;
  status: string;
  date: string;
}

interface OrdersViewProps {
  initialOrders?: OrderItemVM[];
}

export default function OrdersView({ initialOrders = [] }: OrdersViewProps) {
  const { t, formatMoney, toNumerals } = useLanguage();

  const defaultSampleOrders: OrderItemVM[] = [
    {
      id: "ORD-9421",
      customer: "Elena Rostova (01711223344)",
      items: "2x Sourdough Loaf, 1x Basque Cheesecake",
      total: 3100.00,
      paymentMethod: "SSLCommerz (Online)",
      status: "CONFIRMED",
      date: "Today, 11:20 AM",
    },
    {
      id: "ORD-9418",
      customer: "Tariq Mansoor (01899887766)",
      items: "4x Butter Croissant",
      total: 1300.00,
      paymentMethod: "Cash On Delivery (COD)",
      status: "CONFIRMED",
      date: "Today, 09:45 AM",
    },
  ];

  const [orders, setOrders] = useState<OrderItemVM[]>(
    initialOrders.length > 0 ? initialOrders : defaultSampleOrders
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleUpdateStatus = async (order: OrderItemVM, newStatus: string) => {
    if (!order.rawId) {
      // Mock order
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      );
      setFeedback(`Order ${order.id} status updated to ${newStatus}`);
      return;
    }

    setUpdatingId(order.id);
    setFeedback(null);

    try {
      const res = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.rawId,
          newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      );
      setFeedback(`Order ${order.id} updated to ${newStatus}. Financial ledger & stock adjusted.`);
    } catch (err: any) {
      console.error("Status update error:", err);
      setFeedback(`Error: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.orderManagement}</h1>
          <p className="muted">{t.orderManagementSub}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <span className="hero-badge" style={{ margin: 0 }}>
            {toNumerals(orders.length)} {t.orders}
          </span>
        </div>
      </div>

      {feedback && (
        <div style={{
          backgroundColor: feedback.startsWith("Error") ? "rgba(239, 68, 68, 0.15)" : "rgba(74, 222, 128, 0.15)",
          border: `1px solid ${feedback.startsWith("Error") ? "rgba(239, 68, 68, 0.3)" : "rgba(74, 222, 128, 0.3)"}`,
          color: feedback.startsWith("Error") ? "#f87171" : "#4ade80",
          borderRadius: "6px",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          fontSize: "0.85rem",
        }}>
          {feedback}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>{t.orderId}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.customer}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.items}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.total}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.paymentType}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.status}</th>
              <th style={{ padding: "0.85rem 1rem" }}>Actions</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.date}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((ord) => {
              const isTerminal = ord.status === "DELIVERED" || ord.status === "CANCELLED" || ord.status === "REFUSED";

              return (
                <tr key={ord.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: "#38bdf8" }}>{toNumerals(ord.id)}</td>
                  <td style={{ padding: "0.85rem 1rem" }}>{ord.customer}</td>
                  <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa" }}>{ord.items}</td>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{formatMoney(ord.total)}</td>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "#cbd5e1" }}>{ord.paymentMethod}</td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        backgroundColor:
                          ord.status === "DELIVERED"
                            ? "rgba(34, 197, 94, 0.15)"
                            : ord.status === "CONFIRMED" || ord.status === "PROCESSING"
                            ? "rgba(59, 130, 246, 0.15)"
                            : ord.status === "SHIPPED"
                            ? "rgba(168, 85, 247, 0.15)"
                            : "rgba(239, 68, 68, 0.15)",
                        color:
                          ord.status === "DELIVERED"
                            ? "#4ade80"
                            : ord.status === "CONFIRMED" || ord.status === "PROCESSING"
                            ? "#60a5fa"
                            : ord.status === "SHIPPED"
                            ? "#c084fc"
                            : "#f87171",
                      }}
                    >
                      ● {ord.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    {isTerminal ? (
                      <span className="muted" style={{ fontSize: "0.75rem" }}>Settled</span>
                    ) : (
                      <select
                        disabled={updatingId === ord.id}
                        value={ord.status}
                        onChange={(e) => handleUpdateStatus(ord, e.target.value)}
                        style={{
                          backgroundColor: "#27272a",
                          color: "#fff",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "4px",
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="SHIPPED">SHIPPED</option>
                        <option value="DELIVERED">DELIVERED (Settle Hold)</option>
                        <option value="CANCELLED">CANCELLED (Release Hold)</option>
                        <option value="REFUSED">REFUSED (Restock)</option>
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", color: "#71717a", fontSize: "0.8rem" }}>{ord.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
