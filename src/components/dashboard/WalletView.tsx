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

export interface PayoutMethodItem {
  id: string;
  type: "BKASH" | "NAGAD" | "ROCKET" | "BANK_TRANSFER";
  accountType: string;
  phoneNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  routingNumber?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  isDefault: boolean;
  coolingUntil?: string | null;
}

export interface WithdrawalItem {
  id: string;
  withdrawalNumber: string;
  amount: number;
  status: string;
  disbursementTxId?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  payoutMethodType: string;
  destination: string;
}

interface WalletViewProps {
  storeId?: string;
  storeStatus: string;
  totalBalance?: number;
  walletHolds?: number;
  initialLedgerEntries?: LedgerItem[];
  initialPayoutMethods?: PayoutMethodItem[];
  initialWithdrawals?: WithdrawalItem[];
  initialStatusAlert?: string;
}

export default function WalletView({
  storeId,
  storeStatus,
  totalBalance = 4850.00,
  walletHolds = 450.00,
  initialLedgerEntries = [],
  initialPayoutMethods = [],
  initialWithdrawals = [],
  initialStatusAlert,
}: WalletViewProps) {
  const { t, formatMoney, toNumerals } = useLanguage();

  // Top-Up state
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isLoadingTopUp, setIsLoadingTopUp] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  // Payout Methods state
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethodItem[]>(initialPayoutMethods);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [accountCategory, setAccountCategory] = useState<"MFS" | "BANK">("MFS");
  const [mfsType, setMfsType] = useState<"BKASH" | "NAGAD" | "ROCKET">("BKASH");
  const [mfsAccountType, setMfsAccountType] = useState<"PERSONAL" | "MERCHANT" | "AGENT">("PERSONAL");
  const [mfsPhone, setMfsPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);

  // Withdrawal state
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>(initialWithdrawals);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string>(
    initialPayoutMethods.find((m) => m.isDefault)?.id || initialPayoutMethods[0]?.id || ""
  );
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"ledger" | "payouts" | "withdrawals">("ledger");

  const minReserve = 500.00;
  const availableBalance = totalBalance - walletHolds;
  const withdrawableBalance = Math.max(0, availableBalance - minReserve);

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

  // Handle Top-Up
  const handleInitiateTopUp = async () => {
    const finalAmount = customAmount ? parseFloat(customAmount) : topUpAmount;
    if (!finalAmount || finalAmount < 10) {
      setTopUpError("Please enter an amount of at least ৳10.00 BDT");
      return;
    }

    if (!storeId) {
      setTopUpError("Store ID not found");
      return;
    }

    setIsLoadingTopUp(true);
    setTopUpError(null);

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
      setTopUpError(err.message || "Failed to initiate top-up. Please try again.");
      setIsLoadingTopUp(false);
    }
  };

  // Handle Add Payout Account
  const handleAddPayoutMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddAccountError(null);
    setIsSavingAccount(true);

    try {
      const payload: any = {
        type: accountCategory === "MFS" ? mfsType : "BANK_TRANSFER",
      };

      if (accountCategory === "MFS") {
        if (!mfsPhone) throw new Error("Phone number is required");
        payload.phoneNumber = mfsPhone;
        payload.accountType = mfsAccountType;
      } else {
        if (!bankName || !routingNumber || !accountName || !accountNumber) {
          throw new Error("All bank fields are required");
        }
        payload.bankName = bankName;
        payload.branchName = branchName;
        payload.routingNumber = routingNumber;
        payload.accountName = accountName;
        payload.accountNumber = accountNumber;
      }

      const res = await fetch("/api/wallet/payout-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save payout method");

      setPayoutMethods((prev) => [data.method, ...prev]);
      if (!selectedMethodId) setSelectedMethodId(data.method.id);
      setIsAddAccountOpen(false);

      // Reset form
      setMfsPhone("");
      setBankName("");
      setBranchName("");
      setRoutingNumber("");
      setAccountName("");
      setAccountNumber("");
    } catch (err: any) {
      setAddAccountError(err.message || "Failed to add payout method");
    } finally {
      setIsSavingAccount(false);
    }
  };

  // Handle Delete Payout Account
  const handleDeletePayoutMethod = async (id: string) => {
    if (!confirm("Are you sure you want to remove this payout destination?")) return;
    try {
      const res = await fetch(`/api/wallet/payout-methods?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete payout method");
      setPayoutMethods((prev) => prev.filter((m) => m.id !== id));
      if (selectedMethodId === id) setSelectedMethodId("");
    } catch (err: any) {
      alert(err.message || "Could not delete payout method");
    }
  };

  // Handle Request Withdrawal
  const handleRequestWithdrawal = async () => {
    setWithdrawError(null);
    setWithdrawSuccess(null);

    const amountNum = parseFloat(withdrawAmount);
    if (!amountNum || amountNum < 500) {
      setWithdrawError("Minimum withdrawal amount is ৳500.00 BDT");
      return;
    }

    const targetMethodId = selectedMethodId || payoutMethods[0]?.id;
    if (!targetMethodId) {
      setWithdrawError("Please select a payout destination account");
      return;
    }

    if (amountNum > withdrawableBalance) {
      setWithdrawError(`Eligible withdrawable balance is ${formatMoney(withdrawableBalance)}.`);
      return;
    }

    setIsWithdrawing(true);

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutMethodId: targetMethodId,
          amount: amountNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");

      setWithdrawSuccess(`Success! Withdrawal ${data.withdrawalNumber} of ৳${data.amount} has been queued for disbursement.`);
      setWithdrawAmount("");
      setIsWithdrawOpen(false);

      // Refresh page to reflect new ledger balance
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setWithdrawError(err.message || "Failed to process withdrawal");
    } finally {
      setIsWithdrawing(false);
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

      {withdrawSuccess && (
        <div style={{
          backgroundColor: "rgba(74, 222, 128, 0.15)",
          border: "1px solid rgba(74, 222, 128, 0.3)",
          color: "#4ade80",
          borderRadius: "8px",
          padding: "1rem",
          marginBottom: "1.5rem",
        }}>
          {withdrawSuccess}
        </div>
      )}

      {/* Top Header & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>{t.walletLedger} & Payouts</h1>
          <p className="muted">Double-entry bookkeeping, multi-rail Bank/MFS withdrawals, and platform reserves.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            className="button"
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.15)",
              color: "#4ade80",
              border: "1px solid rgba(74, 222, 128, 0.4)",
              fontWeight: 600,
            }}
            type="button"
            onClick={() => {
              if (payoutMethods.length === 0) {
                setIsAddAccountOpen(true);
              } else {
                setIsWithdrawOpen(true);
              }
            }}
          >
            💸 Withdraw Profits
          </button>
          <button
            className="button glow-button"
            type="button"
            onClick={() => setIsTopUpOpen(true)}
          >
            {t.topUpBalance}
          </button>
        </div>
      </div>

      {/* Stat Grid with 4 Key Pillars */}
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
          <span className="stat-value" style={{ color: "#a1a1aa" }}>{formatMoney(minReserve)}</span>
          <span className="muted">Platform Reserve Bond</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: withdrawableBalance > 0 ? "#4ade80" : "#f87171" }}>
            {formatMoney(withdrawableBalance)}
          </span>
          <span className="muted">Eligible to Withdraw</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "ledger" ? "2px solid #38bdf8" : "2px solid transparent",
            color: activeTab === "ledger" ? "#38bdf8" : "#a1a1aa",
            padding: "0.75rem 0.5rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📜 Transaction Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payouts")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "payouts" ? "2px solid #38bdf8" : "2px solid transparent",
            color: activeTab === "payouts" ? "#38bdf8" : "#a1a1aa",
            padding: "0.75rem 0.5rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🏦 Payout Accounts ({payoutMethods.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("withdrawals")}
          style={{
            background: "none",
            border: "none",
            borderBottom: activeTab === "withdrawals" ? "2px solid #38bdf8" : "2px solid transparent",
            color: activeTab === "withdrawals" ? "#38bdf8" : "#a1a1aa",
            padding: "0.75rem 0.5rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          💸 Withdrawal History ({withdrawals.length})
        </button>
      </div>

      {/* TAB 1: LEDGER */}
      {activeTab === "ledger" && (
        <>
          <div className="card" style={{ marginBottom: "2rem", padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Store Status & Safety Float Policy</h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
              Available Balance ({formatMoney(availableBalance)}) must exceed ৳500 to keep your storefront and Cash On Delivery (COD) active.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.85rem" }}>
              <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <strong>Soft Threshold (৳500):</strong>
                <span style={{ color: availableBalance >= 500 ? "#4ade80" : "#facc15", marginLeft: "0.5rem" }}>
                  {availableBalance >= 500 ? "Active & Healthy" : "Low Balance Warning"}
                </span>
              </div>
              <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <strong>Hard Threshold (৳200):</strong>
                <span style={{ color: availableBalance >= 200 ? "#4ade80" : "#ef4444", marginLeft: "0.5rem" }}>
                  {availableBalance >= 200 ? "Normal" : "COD Blocked"}
                </span>
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
        </>
      )}

      {/* TAB 2: PAYOUT DESTINATIONS */}
      {activeTab === "payouts" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ margin: 0 }}>Registered Payout Accounts</h2>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                Connect your personal or business Bank Account or MFS wallet (bKash, Nagad, Rocket) to receive withdrawals.
              </p>
            </div>
            <button
              type="button"
              className="button button-small glow-button"
              onClick={() => setIsAddAccountOpen(true)}
            >
              + Add Payout Account
            </button>
          </div>

          {payoutMethods.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>💳</div>
              <h3>No Payout Destination Registered</h3>
              <p className="muted" style={{ maxWidth: "420px", margin: "0 auto 1.5rem auto", fontSize: "0.9rem" }}>
                To withdraw profits from your online sales, add your Bank Account (BEFTN/NPSB) or bKash/Nagad/Rocket account.
              </p>
              <button
                type="button"
                className="button glow-button"
                onClick={() => setIsAddAccountOpen(true)}
              >
                Connect Bank or MFS Wallet
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {payoutMethods.map((m) => {
                const isCooling = m.coolingUntil && new Date(m.coolingUntil) > new Date();
                return (
                  <div key={m.id} className="card" style={{ padding: "1.25rem", position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "1.25rem" }}>
                          {m.type === "BANK_TRANSFER" ? "🏦" : m.type === "BKASH" ? "🌸" : m.type === "NAGAD" ? "🔥" : "🚀"}
                        </span>
                        <strong>{m.type === "BANK_TRANSFER" ? m.bankName : m.type}</strong>
                        {m.isDefault && (
                          <span style={{ fontSize: "0.7rem", backgroundColor: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                            Default
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePayoutMethod(m.id)}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.85rem" }}
                      >
                        Remove
                      </button>
                    </div>

                    {m.type === "BANK_TRANSFER" ? (
                      <div style={{ fontSize: "0.85rem", color: "#d4d4d8", lineHeight: 1.6 }}>
                        <div><strong>A/C Title:</strong> {m.accountName}</div>
                        <div><strong>A/C Number:</strong> {m.accountNumber}</div>
                        <div><strong>Branch:</strong> {m.branchName || "N/A"}</div>
                        <div><strong>Routing No:</strong> {m.routingNumber}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "#d4d4d8", lineHeight: 1.6 }}>
                        <div><strong>Wallet Number:</strong> {m.phoneNumber}</div>
                        <div><strong>Account Type:</strong> {m.accountType}</div>
                      </div>
                    )}

                    {isCooling && (
                      <div style={{
                        marginTop: "0.75rem",
                        padding: "0.4rem 0.6rem",
                        backgroundColor: "rgba(56, 189, 248, 0.1)",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        color: "#38bdf8",
                      }}>
                        ❄️ Security Lock: Active until {new Date(m.coolingUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WITHDRAWAL REQUESTS */}
      {activeTab === "withdrawals" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ margin: 0 }}>Withdrawal History</h2>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                Track submitted disbursement requests to your bank or MFS wallet.
              </p>
            </div>
            <button
              type="button"
              className="button button-small"
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.15)",
                color: "#4ade80",
                border: "1px solid rgba(74, 222, 128, 0.4)",
              }}
              onClick={() => setIsWithdrawOpen(true)}
            >
              + Request Withdrawal
            </button>
          </div>

          {withdrawals.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>💸</div>
              <h3>No Withdrawal Requests Yet</h3>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                When you withdraw your sales earnings, all records and bank reference numbers will appear here.
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                    <th style={{ padding: "0.85rem 1rem" }}>Withdrawal ID</th>
                    <th style={{ padding: "0.85rem 1rem" }}>Destination</th>
                    <th style={{ padding: "0.85rem 1rem" }}>Amount</th>
                    <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                    <th style={{ padding: "0.85rem 1rem" }}>Bank/Trx Reference</th>
                    <th style={{ padding: "0.85rem 1rem" }}>Requested On</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{w.withdrawalNumber}</td>
                      <td style={{ padding: "0.85rem 1rem" }}>{w.destination}</td>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: "#4ade80" }}>
                        {formatMoney(w.amount)}
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor:
                            w.status === "COMPLETED"
                              ? "rgba(74, 222, 128, 0.2)"
                              : w.status === "REJECTED"
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(250, 204, 21, 0.2)",
                          color:
                            w.status === "COMPLETED"
                              ? "#4ade80"
                              : w.status === "REJECTED"
                              ? "#f87171"
                              : "#facc15",
                        }}>
                          ● {w.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa", fontSize: "0.8rem" }}>
                        {w.disbursementTxId ? `Ref: ${w.disbursementTxId}` : w.rejectionReason ? `Reason: ${w.rejectionReason}` : "Pending Admin Review"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa", fontSize: "0.8rem" }}>{w.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: WITHDRAW FUNDS MODAL */}
      {isWithdrawOpen && (
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
          onClick={() => setIsWithdrawOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: "460px", width: "100%", padding: "2rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Withdraw Sales Profits</h2>
              <button
                type="button"
                onClick={() => setIsWithdrawOpen(false)}
                style={{ background: "none", border: "none", color: "#a1a1aa", fontSize: "1.5rem", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            <div style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              padding: "0.85rem",
              marginBottom: "1.25rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                <span className="muted">Total Ledger Balance:</span>
                <span>{formatMoney(totalBalance)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                <span className="muted">Active COD Holds:</span>
                <span style={{ color: "#facc15" }}>-{formatMoney(walletHolds)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                <span className="muted">Required Platform Reserve:</span>
                <span style={{ color: "#a1a1aa" }}>-{formatMoney(minReserve)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem", fontWeight: 600, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
                <span>Eligible to Withdraw:</span>
                <span style={{ color: "#4ade80" }}>{formatMoney(withdrawableBalance)}</span>
              </div>
            </div>

            {withdrawError && (
              <div style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}>
                {withdrawError}
              </div>
            )}

            {payoutMethods.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1rem" }}>
                <p className="muted" style={{ fontSize: "0.85rem" }}>Please add a Bank or MFS payout method before requesting a withdrawal.</p>
                <button
                  type="button"
                  className="button glow-button"
                  onClick={() => {
                    setIsWithdrawOpen(false);
                    setIsAddAccountOpen(true);
                  }}
                >
                  Add Payout Destination
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.4rem" }}>
                    Select Destination Account
                  </label>
                  <select
                    value={selectedMethodId}
                    onChange={(e) => setSelectedMethodId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      fontSize: "0.9rem",
                    }}
                  >
                    {payoutMethods.map((m) => (
                      <option key={m.id} value={m.id} style={{ background: "#18181b", color: "#fff" }}>
                        {m.type === "BANK_TRANSFER"
                          ? `Bank: ${m.bankName} (A/C: ${m.accountNumber})`
                          : `${m.type}: ${m.phoneNumber} (${m.accountType})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.4rem" }}>
                    Withdrawal Amount (৳ BDT)
                  </label>
                  <input
                    type="number"
                    placeholder="Min ৳500.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#fff",
                      fontSize: "0.9rem",
                      marginBottom: "0.5rem",
                    }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {[500, 1000, 2000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setWithdrawAmount(String(preset))}
                        style={{
                          padding: "0.3rem 0.6rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: "none",
                          color: "#a1a1aa",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        ৳{preset}
                      </button>
                    ))}
                    {withdrawableBalance >= 500 && (
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(String(Math.floor(withdrawableBalance)))}
                        style={{
                          padding: "0.3rem 0.6rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(74, 222, 128, 0.3)",
                          background: "rgba(74, 222, 128, 0.1)",
                          color: "#4ade80",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        Max Eligible
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestWithdrawal}
                  disabled={isWithdrawing || withdrawableBalance < 500}
                  className="button"
                  style={{
                    width: "100%",
                    padding: "0.85rem",
                    fontSize: "1rem",
                    backgroundColor: withdrawableBalance >= 500 ? "#22c55e" : "#52525b",
                    color: "#fff",
                    fontWeight: 600,
                  }}
                >
                  {isWithdrawing
                    ? "Submitting Withdrawal..."
                    : withdrawableBalance < 500
                    ? "Minimum ৳500 Eligible Balance Required"
                    : `Submit Withdrawal of ৳${withdrawAmount || "0.00"}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: ADD PAYOUT ACCOUNT MODAL */}
      {isAddAccountOpen && (
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
          onClick={() => setIsAddAccountOpen(false)}
        >
          <div
            className="card"
            style={{ maxWidth: "500px", width: "100%", padding: "2rem", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Add Payout Destination</h2>
              <button
                type="button"
                onClick={() => setIsAddAccountOpen(false)}
                style={{ background: "none", border: "none", color: "#a1a1aa", fontSize: "1.5rem", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            {/* Category Toggle: MFS vs Bank */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <button
                type="button"
                onClick={() => setAccountCategory("MFS")}
                style={{
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: accountCategory === "MFS" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: accountCategory === "MFS" ? "rgba(56, 189, 248, 0.15)" : "transparent",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📱 Mobile Wallet (bKash/Nagad)
              </button>
              <button
                type="button"
                onClick={() => setAccountCategory("BANK")}
                style={{
                  padding: "0.6rem",
                  borderRadius: "6px",
                  border: accountCategory === "BANK" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: accountCategory === "BANK" ? "rgba(56, 189, 248, 0.15)" : "transparent",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🏦 Bank Account (BEFTN)
              </button>
            </div>

            {addAccountError && (
              <div style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}>
                {addAccountError}
              </div>
            )}

            <form onSubmit={handleAddPayoutMethod}>
              {accountCategory === "MFS" ? (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.4rem" }}>
                      Select Provider
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                      {(["BKASH", "NAGAD", "ROCKET"] as const).map((prov) => (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => setMfsType(prov)}
                          style={{
                            padding: "0.5rem",
                            borderRadius: "6px",
                            border: mfsType === prov ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                            backgroundColor: mfsType === prov ? "rgba(56, 189, 248, 0.1)" : "transparent",
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                          }}
                        >
                          {prov}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.4rem" }}>
                      Wallet Type
                    </label>
                    <select
                      value={mfsAccountType}
                      onChange={(e) => setMfsAccountType(e.target.value as any)}
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    >
                      <option value="PERSONAL" style={{ background: "#18181b" }}>Personal Wallet</option>
                      <option value="MERCHANT" style={{ background: "#18181b" }}>Merchant Account</option>
                      <option value="AGENT" style={{ background: "#18181b" }}>Agent Account</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: "1.25rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.4rem" }}>
                      Registered Mobile Number (11 digits)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 017XXXXXXXX"
                      value={mfsPhone}
                      onChange={(e) => setMfsPhone(e.target.value)}
                      required
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
                </>
              ) : (
                <>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.3rem" }}>
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BRAC Bank PLC, City Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.3rem" }}>
                      Branch Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Gulshan 1 Branch"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.3rem" }}>
                      Bangladesh Bank 9-digit Routing Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 060261389"
                      value={routingNumber}
                      onChange={(e) => setRoutingNumber(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.3rem" }}>
                      Account Holder Name (Must match KYC/NID)
                    </label>
                    <input
                      type="text"
                      placeholder="Exact title on bank statement"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "1.25rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.3rem" }}>
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 150120XXXXXXXXX"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "0.6rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "#fff",
                        fontSize: "0.9rem",
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{
                backgroundColor: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "6px",
                padding: "0.75rem",
                fontSize: "0.75rem",
                color: "#a1a1aa",
                marginBottom: "1.25rem",
              }}>
                🔒 <strong>Fraud Prevention:</strong> For your protection, newly added payout destinations have a 24-hour security cooling period before withdrawals can be initiated to that account.
              </div>

              <button
                type="submit"
                disabled={isSavingAccount}
                className="button glow-button"
                style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
              >
                {isSavingAccount ? "Verifying & Saving..." : "Save Payout Destination"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TOP-UP MODAL (EXISTING) */}
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
            style={{ maxWidth: "460px", width: "100%", padding: "2rem" }}
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

            {topUpError && (
              <div style={{
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                marginBottom: "1rem",
              }}>
                {topUpError}
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
              disabled={isLoadingTopUp}
              className="button glow-button"
              style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
            >
              {isLoadingTopUp
                ? "Connecting SSLCommerz..."
                : `Pay ${formatMoney(customAmount ? parseFloat(customAmount) || 0 : topUpAmount)} via SSLCommerz`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
