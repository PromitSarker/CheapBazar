"use client";

import React, { useState } from "react";

interface WithdrawalItem {
  id: string;
  withdrawalNumber: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  ownerName: string;
  ownerEmail: string;
  amount: number;
  status: string;
  payoutType: string;
  payoutDetails: any;
  disbursementTxId?: string | null;
  rejectionReason?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  createdAt: string;
}

export default function AdminPayoutClient({
  initialWithdrawals,
}: {
  initialWithdrawals: WithdrawalItem[];
}) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>(initialWithdrawals);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Approval modal
  const [approvingItem, setApprovingItem] = useState<WithdrawalItem | null>(null);
  const [disbursementTxId, setDisbursementTxId] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Rejection modal
  const [rejectingItem, setRejectingItem] = useState<WithdrawalItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = withdrawals.filter((w) => {
    const matchesStatus = filterStatus === "ALL" || w.status === filterStatus;
    const matchesSearch =
      w.withdrawalNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleApprove = async () => {
    if (!approvingItem) return;
    if (!disbursementTxId.trim()) {
      setActionError("Please provide a bank transfer reference number or bKash TrxID");
      return;
    }

    setIsSubmittingApproval(true);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalId: approvingItem.id,
          action: "APPROVE",
          disbursementTxId: disbursementTxId.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setWithdrawals((prev) =>
        prev.map((item) =>
          item.id === approvingItem.id
            ? { ...item, status: "COMPLETED", disbursementTxId: disbursementTxId.trim() }
            : item
        )
      );

      setApprovingItem(null);
      setDisbursementTxId("");
    } catch (err: any) {
      setActionError(err.message || "Failed to approve payout");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingItem) return;
    if (!rejectionReason.trim()) {
      setActionError("Please provide a reason for rejecting this payout");
      return;
    }

    setIsSubmittingRejection(true);
    setActionError(null);

    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalId: rejectingItem.id,
          action: "REJECT",
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");

      setWithdrawals((prev) =>
        prev.map((item) =>
          item.id === rejectingItem.id
            ? { ...item, status: "REJECTED", rejectionReason: rejectionReason.trim() }
            : item
        )
      );

      setRejectingItem(null);
      setRejectionReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to reject payout");
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  return (
    <div>
      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["ALL", "PENDING", "COMPLETED", "REJECTED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: "6px",
                border: filterStatus === st ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                backgroundColor: filterStatus === st ? "#0284c7" : "#ffffff",
                color: filterStatus === st ? "#ffffff" : "#475569",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                transition: "all 0.15s ease",
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search by WD Number, Store, or Email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: "0.5rem 0.85rem",
            borderRadius: "6px",
            backgroundColor: "#ffffff",
            border: "1.5px solid #cbd5e1",
            color: "#0f172a",
            fontSize: "0.85rem",
            fontWeight: 500,
            width: "320px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            outline: "none",
          }}
        />
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Withdrawal Ref</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Store & Merchant</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Payout Destination</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Disbursement Proof</th>
              <th style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                  No withdrawal requests found matching your filter.
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: "#0f172a" }}>
                    <div>{w.withdrawalNumber}</div>
                    <small style={{ color: "#64748b", fontSize: "0.75rem" }}>{w.createdAt}</small>
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    <strong style={{ color: "#0f172a" }}>{w.storeName}</strong>
                    <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{w.ownerEmail}</div>
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: "#4ade80", fontSize: "0.95rem" }}>
                    ৳{w.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: "0.85rem 1rem" }}>
                    {w.payoutType === "BANK_TRANSFER" ? (
                      <div style={{ lineHeight: 1.4 }}>
                        <div><strong>{w.payoutDetails.bankName}</strong></div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          A/C: {w.payoutDetails.accountNumber} ({w.payoutDetails.accountName})
                        </div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          Routing: {w.payoutDetails.routingNumber} | {w.payoutDetails.branchName || "Branch N/A"}
                        </div>
                      </div>
                    ) : (
                      <div style={{ lineHeight: 1.4 }}>
                        <div><strong>{w.payoutDetails.provider}</strong> ({w.payoutDetails.accountType})</div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          Mobile: {w.payoutDetails.phoneNumber}
                        </div>
                      </div>
                    )}
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
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "#a1a1aa" }}>
                    {w.disbursementTxId ? (
                      <span style={{ color: "#38bdf8" }}>Ref: {w.disbursementTxId}</span>
                    ) : w.rejectionReason ? (
                      <span style={{ color: "#f87171" }}>Reason: {w.rejectionReason}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                    {w.status === "PENDING" && (
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setApprovingItem(w);
                            setActionError(null);
                          }}
                          style={{
                            padding: "0.3rem 0.6rem",
                            borderRadius: "4px",
                            backgroundColor: "rgba(74, 222, 128, 0.2)",
                            color: "#4ade80",
                            border: "1px solid rgba(74, 222, 128, 0.4)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          ✓ Mark Paid
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingItem(w);
                            setActionError(null);
                          }}
                          style={{
                            padding: "0.3rem 0.6rem",
                            borderRadius: "4px",
                            backgroundColor: "rgba(239, 68, 68, 0.2)",
                            color: "#f87171",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* APPROVE MODAL */}
      {approvingItem && (
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
          onClick={() => setApprovingItem(null)}
        >
          <div
            className="card"
            style={{ maxWidth: "440px", width: "100%", padding: "1.75rem", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#0f172a" }}>Confirm Disbursement</h3>
            <p style={{ fontSize: "0.85rem", marginBottom: "1rem", color: "#64748b" }}>
              Confirm that <strong style={{ color: "#0f172a" }}>৳{approvingItem.amount.toFixed(2)}</strong> has been transferred to {approvingItem.storeName} via corporate bank EFT or bKash.
            </p>

            {actionError && (
              <div style={{
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                padding: "0.6rem",
                borderRadius: "6px",
                fontSize: "0.8rem",
                marginBottom: "0.75rem",
              }}>
                {actionError}
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Bank EFT Reference or MFS TrxID
              </label>
              <input
                type="text"
                placeholder="e.g. EFT-9912048 or bKash BL7129841"
                value={disbursementTxId}
                onChange={(e) => setDisbursementTxId(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  color: "#0f172a",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setApprovingItem(null)}
                style={{ padding: "0.5rem 1rem", background: "#ffffff", border: "1px solid #cbd5e1", color: "#334155", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingApproval}
                onClick={handleApprove}
                className="button"
                style={{ backgroundColor: "#15803d", color: "#fff", fontWeight: 600, padding: "0.5rem 1rem" }}
              >
                {isSubmittingApproval ? "Recording..." : "Confirm & Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingItem && (
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
          onClick={() => setRejectingItem(null)}
        >
          <div
            className="card"
            style={{ maxWidth: "440px", width: "100%", padding: "1.75rem", backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", color: "#b91c1c" }}>Reject Withdrawal</h3>
            <p style={{ fontSize: "0.85rem", marginBottom: "1rem", color: "#64748b" }}>
              Rejecting this request will <strong style={{ color: "#0f172a" }}>automatically restore ৳{rejectingItem.amount.toFixed(2)}</strong> back to the seller's wallet balance.
            </p>

            {actionError && (
              <div style={{
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                padding: "0.6rem",
                borderRadius: "6px",
                fontSize: "0.8rem",
                marginBottom: "0.75rem",
              }}>
                {actionError}
              </div>
            )}

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#334155", marginBottom: "0.4rem" }}>
                Reason for Rejection
              </label>
              <input
                type="text"
                placeholder="e.g. Account number invalid / Beneficiary name mismatch"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  color: "#0f172a",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                style={{ padding: "0.5rem 1rem", background: "#ffffff", border: "1px solid #cbd5e1", color: "#334155", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingRejection}
                onClick={handleReject}
                className="button"
                style={{ backgroundColor: "#b91c1c", color: "#fff", fontWeight: 600, padding: "0.5rem 1rem" }}
              >
                {isSubmittingRejection ? "Refunding..." : "Reject & Refund Wallet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
