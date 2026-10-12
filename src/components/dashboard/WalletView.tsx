"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function WalletView({
  storeStatus,
}: {
  storeStatus: string;
}) {
  const { t, formatMoney, toNumerals } = useLanguage();

  const totalBalance = 4850.00;
  const walletHolds = 450.00;
  const availableBalance = totalBalance - walletHolds;
  const softThreshold = 500.00;
  const hardThreshold = 200.00;

  const ledgerHistory = [
    {
      id: "TXN-8812",
      type: "ORDER_SPLIT_SETTLEMENT",
      desc: "Net settlement from Order ORD-9390",
      debit: null,
      credit: 1620.00,
      timestamp: "Oct 11, 2026, 04:30 PM",
    },
    {
      id: "TXN-8811",
      type: "PLATFORM_FEE",
      desc: "10% Platform Commission on ORD-9390",
      debit: 180.00,
      credit: null,
      timestamp: "Oct 11, 2026, 04:30 PM",
    },
    {
      id: "TXN-8790",
      type: "COD_FEE_HOLD",
      desc: "Platform fee hold for active COD Order ORD-9418",
      debit: 150.00,
      credit: null,
      timestamp: "Oct 11, 2026, 09:45 AM",
    },
    {
      id: "TXN-8500",
      type: "WALLET_TOP_UP",
      desc: "Merchant prepaid balance top-up via bKash / Card",
      debit: null,
      credit: 2500.00,
      timestamp: "Oct 08, 2026, 02:15 PM",
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.walletLedger}</h1>
          <p className="muted">Double-entry ledger balance in Bangladeshi Taka, COD fee holds, and Store Status thresholds.</p>
        </div>
        <button className="button glow-button" type="button">
          {t.topUpBalance}
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#38bdf8" }}>{formatMoney(totalBalance)}</span>
          <span className="muted">{t.totalLedgerBalance}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#facc15" }}>{formatMoney(walletHolds)}</span>
          <span className="muted">{t.activeCodHolds}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#4ade80" }}>{formatMoney(availableBalance)}</span>
          <span className="muted">{t.availableBalance}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ fontSize: "1.25rem", color: storeStatus === "ACTIVE" ? "#4ade80" : "#f87171" }}>
            ● {storeStatus}
          </span>
          <span className="muted">{t.storeStatusEnforcer}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "2rem", padding: "1.25rem" }}>
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Store Status Threshold Monitoring (Diagram 2)</h3>
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
          Automated enforcer evaluates your <strong>Available Balance</strong> ({formatMoney(availableBalance)}) against the platform policy:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.85rem" }}>
          <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <strong>{t.softThresholdLabel}:</strong>
            <span style={{ color: "#4ade80", marginLeft: "0.5rem" }}>Safe (+{formatMoney(availableBalance - softThreshold)} buffer)</span>
            <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem" }}>
              Alerts merchant via Email/SMS when available balance dips below {formatMoney(softThreshold)}.
            </p>
          </div>
          <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <strong>{t.hardThresholdLabel}:</strong>
            <span style={{ color: "#4ade80", marginLeft: "0.5rem" }}>Safe</span>
            <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem" }}>
              Blocks new COD orders immediately if balance drops below {formatMoney(hardThreshold)} to prevent platform liability.
            </p>
          </div>
        </div>
      </div>

      <h2>{t.doubleEntryTransactions}</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>Transaction ID</th>
              <th style={{ padding: "0.85rem 1rem" }}>Reference / Reason</th>
              <th style={{ padding: "0.85rem 1rem" }}>Debit (-)</th>
              <th style={{ padding: "0.85rem 1rem" }}>Credit (+)</th>
              <th style={{ padding: "0.85rem 1rem" }}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {ledgerHistory.map((txn) => (
              <tr key={txn.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{toNumerals(txn.id)}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <div>{txn.desc}</div>
                  <small className="muted" style={{ fontSize: "0.75rem" }}>{txn.type}</small>
                </td>
                <td style={{ padding: "0.85rem 1rem", color: txn.debit ? "#f87171" : "#71717a" }}>
                  {txn.debit ? `-${formatMoney(txn.debit)}` : "—"}
                </td>
                <td style={{ padding: "0.85rem 1rem", color: txn.credit ? "#4ade80" : "#71717a", fontWeight: txn.credit ? 600 : 400 }}>
                  {txn.credit ? `+${formatMoney(txn.credit)}` : "—"}
                </td>
                <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa", fontSize: "0.8rem" }}>{txn.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
