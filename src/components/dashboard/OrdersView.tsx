"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function OrdersView() {
  const { t, formatMoney, toNumerals } = useLanguage();

  const sampleOrders = [
    {
      id: "ORD-9421",
      customer: "Elena Rostova",
      items: "2x Sourdough Loaf, 1x Basque Cheesecake",
      total: 3100.00,
      paymentMethod: "ONLINE (bKash / Card)",
      status: "PROCESSING",
      date: "Today, 11:20 AM",
    },
    {
      id: "ORD-9418",
      customer: "Tariq Mansoor",
      items: "4x Butter Croissant",
      total: 1300.00,
      paymentMethod: "CASH ON DELIVERY (Hold Active)",
      status: "PENDING",
      date: "Today, 09:45 AM",
    },
    {
      id: "ORD-9390",
      customer: "Marcus Vance",
      items: "1x Basque Cheesecake",
      total: 1800.00,
      paymentMethod: "ONLINE (Split Settled)",
      status: "DELIVERED",
      date: "Yesterday",
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.orderManagement}</h1>
          <p className="muted">{t.orderManagementSub}</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <span className="hero-badge" style={{ margin: 0 }}>
            {toNumerals(sampleOrders.length)} {t.orders}
          </span>
        </div>
      </div>

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
              <th style={{ padding: "0.85rem 1rem" }}>{t.date}</th>
            </tr>
          </thead>
          <tbody>
            {sampleOrders.map((ord) => (
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
                          : ord.status === "PROCESSING"
                          ? "rgba(59, 130, 246, 0.15)"
                          : "rgba(234, 179, 8, 0.15)",
                      color:
                        ord.status === "DELIVERED"
                          ? "#4ade80"
                          : ord.status === "PROCESSING"
                          ? "#60a5fa"
                          : "#facc15",
                    }}
                  >
                    {ord.status}
                  </span>
                </td>
                <td style={{ padding: "0.85rem 1rem", color: "#71717a", fontSize: "0.8rem" }}>{ord.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
