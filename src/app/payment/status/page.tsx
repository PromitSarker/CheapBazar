import React from "react";
import Link from "next/link";

interface PageProps {
  searchParams: {
    status?: string;
    tran_id?: string;
    error?: string;
  };
}

export default function PaymentStatusPage({ searchParams }: PageProps) {
  const status = searchParams.status || "unknown";
  const tranId = searchParams.tran_id;
  const error = searchParams.error;

  const isSuccess = status === "success";
  const isCancelled = status === "cancelled";
  const isFailed = status === "failed";

  return (
    <div style={{
      minHeight: "80vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
    }}>
      <div className="card" style={{
        maxWidth: "480px",
        width: "100%",
        padding: "2.5rem 2rem",
        textAlign: "center",
      }}>
        {isSuccess && (
          <>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🎉</div>
            <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "#4ade80" }}>Payment Successful</h1>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              Your transaction has been securely processed and confirmed via SSLCommerz.
            </p>
          </>
        )}

        {isCancelled && (
          <>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>⚠️</div>
            <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "#facc15" }}>Payment Cancelled</h1>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              You chose to cancel the payment on the SSLCommerz gateway. No charges were made.
            </p>
          </>
        )}

        {isFailed && (
          <>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>❌</div>
            <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem", color: "#ef4444" }}>Payment Failed</h1>
            <p className="muted" style={{ marginBottom: "1.5rem" }}>
              {error ? decodeURIComponent(error) : "The transaction could not be completed by your bank or mobile wallet."}
            </p>
          </>
        )}

        {tranId && (
          <div style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            padding: "0.75rem",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
            wordBreak: "break-all",
          }}>
            <span className="muted">Transaction ID:</span> <code>{tranId}</code>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <Link href="/" className="button glow-button">
            Return Home
          </Link>
          <Link href="/dashboard/wallet" className="button" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            Merchant Wallet
          </Link>
        </div>
      </div>
    </div>
  );
}
