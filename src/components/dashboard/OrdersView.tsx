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

const STATUS_TONE: Record<string, string> = {
  DELIVERED: "success",
  CONFIRMED: "info",
  PROCESSING: "info",
  SHIPPED: "neutral",
  CANCELLED: "danger",
  REFUSED: "danger",
};

export default function OrdersView({ initialOrders = [] }: OrdersViewProps) {
  const { t, language, formatMoney, toNumerals } = useLanguage();
  const bn = language === "bn";

  const [orders, setOrders] = useState<OrderItemVM[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleUpdateStatus = async (order: OrderItemVM, newStatus: string) => {
    if (!order.rawId) return;

    setUpdatingId(order.id);
    setFeedback(null);

    try {
      const res = await fetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.rawId, newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
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
      <div className="page-head">
        <div>
          <h1>{t.orderManagement}</h1>
          <p className="muted">{t.orderManagementSub}</p>
        </div>
        <span className="count-chip">
          {toNumerals(orders.length)} {t.orders}
        </span>
      </div>

      {feedback && (
        <div className={`notice ${feedback.startsWith("Error") ? "notice-error" : "notice-success"}`} role="status">
          {feedback}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="empty-state">
          <strong>{bn ? "এখনো কোনো অর্ডার নেই" : "No orders yet"}</strong>
          <p className="muted">
            {bn
              ? "আপনার স্টোরফ্রন্ট থেকে অর্ডার এলে এখানে দেখা যাবে।"
              : "Orders placed on your storefront will show up here."}
          </p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table orders-table">
            <thead>
              <tr>
                <th>{t.orderId}</th>
                <th>{t.customer}</th>
                <th>{t.items}</th>
                <th className="num">{t.total}</th>
                <th>{t.status}</th>
                <th>{bn ? "আপডেট" : "Update"}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((ord) => {
                const isTerminal = ord.status === "DELIVERED" || ord.status === "CANCELLED" || ord.status === "REFUSED";
                return (
                  <tr key={ord.id}>
                    <td className="nowrap">
                      <strong>{toNumerals(ord.id)}</strong>
                      <div className="muted small">{ord.date}</div>
                    </td>
                    <td>{ord.customer}</td>
                    <td className="items-cell">{ord.items}</td>
                    <td className="num">
                      <strong className="nowrap">{formatMoney(ord.total)}</strong>
                      <div className="muted small">{ord.paymentMethod}</div>
                    </td>
                    <td>
                      <span className={`status-badge status-${STATUS_TONE[ord.status] ?? "neutral"}`}>{ord.status}</span>
                    </td>
                    <td>
                      {isTerminal ? (
                        <span className="muted small">{bn ? "নিষ্পত্তি হয়েছে" : "Settled"}</span>
                      ) : (
                        <select
                          className="status-select"
                          aria-label={`Update status of ${ord.id}`}
                          disabled={updatingId === ord.id}
                          value={ord.status}
                          onChange={(e) => handleUpdateStatus(ord, e.target.value)}
                        >
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="PROCESSING">Processing</option>
                          <option value="SHIPPED">Shipped</option>
                          <option value="DELIVERED">Delivered (settle hold)</option>
                          <option value="CANCELLED">Cancelled (release hold)</option>
                          <option value="REFUSED">Refused (restock)</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
