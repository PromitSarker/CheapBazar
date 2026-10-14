"use client";

import React, { useState } from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface LedgerItem {
  id: string;
  type: string;
  desc: string;
  debit: number | null;
  credit: number | null;
  timestamp: string;
}

interface WalletViewProps {
  storeId?: string;
  storeStatus: string;
  totalBalance?: number;
  walletHolds?: number;
  initialLedgerEntries?: LedgerItem[];
  initialStatusAlert?: string;
}

export default function WalletView({
  storeId,
  storeStatus,
  totalBalance = 4850.00,
  walletHolds = 450.00,
  initialLedgerEntries = [],
  initialStatusAlert,
}: WalletViewProps) {
  const { t, formatMoney, toNumerals } = useLanguage();

  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableBalance = totalBalance - walletHolds;
  const softThreshold = 500.00;
  const hardThreshold = 200.00;

  // Use real entries if available, otherwise display sample baseline ledger
  const defaultHistory: LedgerItem[] = [
    {
      id: "TXN-8812",
      type: "ORDER_SPLIT_SETTLEMENT",
      desc: "Net settlement from Order ORD-9390 via SSLCommerz",
      debit: null,
      credit: 1620.00,
      timestamp: "Oct 11, 2026, 04:30 PM",
    },
    {
      id: "TXN-8811",
      type: "PLATFORM_FEE",
      desc: "5% Platform Commission on ORD-9390",
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
      desc: "Merchant prepaid balance top-up via SSLCommerz (bKash/Card)",
      debit: null,
      credit: 2500.00,
      timestamp: "Oct 08, 2026, 02:15 PM",
    },
  ];

  const ledgerHistory = initialLedgerEntries.length > 0 ? initialLedgerEntries : defaultHistory;

  const handleInitiateTopUp = async () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : topUpAmount;
    if (!finalAmount || finalAmount < 10) {
      setErrorMessage("Please enter an amount of at least ৳10.00 BDT");
      return;
    }

    if (!storeId) {
      setErrorMessage("Store ID not found");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/payments/sslcommerz/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "WALLET_TOPUP",
          storeId,
          amount: finalAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize SSLCommerz gateway session");
      }

      if (data.gatewayUrl) {
        window.location.href = data.gatewayUrl;
      }
    } catch (err: any) {
      console.error("Top-up initiation error:", err);
      setErrorMessage(err.message || "Failed to initiate top-up. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div>
      {initialStatusAlert === "topup_success" && (
        <div style={{
          backgroundColor: "rgba(74, 222, 128, 0.15)",
          border: "1px solid rgba(74, 222, 128, 0.3)",
          color: "#4ade80",
          borderRadius: "8px",
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1.25rem" }}>🎉</span>
          <div>
            <strong>Wallet Top-Up Successful!</strong>
            <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
              Your payment has been validated with SSLCommerz and your available ledger balance has been credited.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.walletLedger}</h1>
          <p className="muted">Double-entry ledger balance in Bangladeshi Taka, COD fee holds, and Store Status thresholds.</p>
        </div>
        <button
          className="button glow-button"
          type="button"
          onClick={() => setIsTopUpOpen(true)}
        >
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
            <span style={{ color: availableBalance >= softThreshold ? "#4ade80" : "#facc15", marginLeft: "0.5rem" }}>
              {availableBalance >= softThreshold
                ? `Safe (+${formatMoney(availableBalance - softThreshold)} buffer)`
                : `Low Balance Alert`}
            </span>
            <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem" }}>
              Alerts merchant via Email/SMS when available balance dips below {formatMoney(softThreshold)}.
            </p>
          </div>
          <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <strong>{t.hardThresholdLabel}:</strong>
            <span style={{ color: availableBalance >= hardThreshold ? "#4ade80" : "#ef4444", marginLeft: "0.5rem" }}>
              {availableBalance >= hardThreshold ? "Safe" : "COD Blocked"}
            </span>
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

      {/* TOP-UP MODAL */}
      {isTopUpOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setIsTopUpOpen(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "460px",
              width: "100%",
              padding: "2rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Top-Up Wallet Balance</h2>
              <button
                type="button"
                onClick={() => setIsTopUpOpen(false)}
                style={{ background: "none", border: "none", color: "#a1a1aa", fontSize: "1.5rem", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              Add funds in Bangladeshi Taka (৳ BDT) to keep your available balance above COD thresholds and maintain an Active storefront.
            </p>

            {errorMessage && (
              <div style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}>
                {errorMessage}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.5rem" }}>
                Select Top-Up Amount
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {[500, 1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTopUpAmount(amt);
                      setCustomAmount("");
                    }}
                    style={{
                      padding: "0.6rem",
                      borderRadius: "6px",
                      border: (!customAmount && topUpAmount === amt) ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: (!customAmount && topUpAmount === amt) ? "rgba(56, 189, 248, 0.1)" : "rgba(255,255,255,0.03)",
                      color: "#fff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {formatMoney(amt)}
                  </button>
                ))}
              </div>

              <div>
                <input
                  type="number"
                  placeholder="Or enter custom amount in ৳ BDT"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "6px",
              padding: "0.75rem",
              fontSize: "0.8rem",
              color: "#a1a1aa",
              marginBottom: "1.5rem",
            }}>
              🔒 Payment Gateway: <strong>SSLCommerz</strong> (Supported: bKash, Nagad, Rocket, VISA, Mastercard, Amex, DBBL Nexus).
            </div>

            <button
              type="button"
              onClick={handleInitiateTopUp}
              disabled={isLoading}
              className="button glow-button"
              style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
            >
              {isLoading
                ? "Connecting SSLCommerz..."
                : `Pay ${formatMoney(customAmount ? parseFloat(customAmount) || 0 : topUpAmount)} via SSLCommerz`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
