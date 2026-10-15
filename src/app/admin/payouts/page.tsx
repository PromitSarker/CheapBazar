import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/identity/service";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminPayoutClient from "./AdminPayoutClient";

export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin");
  }

  const rawWithdrawals = await prisma.withdrawalRequest.findMany({
    include: {
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          walletBalance: true,
          owner: { select: { name: true, email: true } },
        },
      },
      payoutMethod: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingCount = rawWithdrawals.filter((w) => w.status === "PENDING").length;
  const pendingTotal = rawWithdrawals
    .filter((w) => w.status === "PENDING")
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const completedCount = rawWithdrawals.filter((w) => w.status === "COMPLETED").length;
  const completedTotal = rawWithdrawals
    .filter((w) => w.status === "COMPLETED")
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const serializedWithdrawals = rawWithdrawals.map((w) => ({
    id: w.id,
    withdrawalNumber: w.withdrawalNumber,
    storeId: w.storeId,
    storeName: w.store.name,
    storeSlug: w.store.slug,
    ownerName: w.store.owner.name,
    ownerEmail: w.store.owner.email,
    amount: Number(w.amount),
    status: w.status,
    payoutType: w.payoutMethod.type,
    payoutDetails:
      w.payoutMethod.type === "BANK_TRANSFER"
        ? {
            bankName: w.payoutMethod.bankName,
            branchName: w.payoutMethod.branchName,
            routingNumber: w.payoutMethod.routingNumber,
            accountName: w.payoutMethod.accountName,
            accountNumber: w.payoutMethod.accountNumber,
          }
        : {
            provider: w.payoutMethod.type,
            phoneNumber: w.payoutMethod.phoneNumber,
            accountType: w.payoutMethod.accountType,
          },
    disbursementTxId: w.disbursementTxId,
    rejectionReason: w.rejectionReason,
    processedAt: w.processedAt ? w.processedAt.toISOString() : null,
    processedBy: w.processedBy,
    createdAt: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(w.createdAt),
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <Link href="/admin" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>
              &larr; Admin Overview
            </Link>
          </div>
          <h1>Seller Disbursements & Payout Queue</h1>
          <p className="muted">Approve seller withdrawals, export batch banking files, and verify MFS transactions.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a
            href="/api/admin/payouts/export?format=beftn"
            className="button button-small"
            style={{
              backgroundColor: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              fontWeight: 600,
              textDecoration: "none",
            }}
            download
          >
            📥 Export Bank BEFTN CSV
          </a>
          <a
            href="/api/admin/payouts/export?format=bkash"
            className="button button-small"
            style={{
              backgroundColor: "rgba(244, 63, 94, 0.15)",
              color: "#f43f5e",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              fontWeight: 600,
              textDecoration: "none",
            }}
            download
          >
            📥 Export bKash Bulk CSV
          </a>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#facc15" }}>৳{pendingTotal.toFixed(2)}</span>
          <span className="muted">Pending Payouts ({pendingCount} requests)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#4ade80" }}>৳{completedTotal.toFixed(2)}</span>
          <span className="muted">Settled to Date ({completedCount} disbursements)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#38bdf8" }}>{rawWithdrawals.length}</span>
          <span className="muted">Total Lifetime Claims</span>
        </div>
      </div>

      <AdminPayoutClient initialWithdrawals={serializedWithdrawals} />
    </div>
  );
}
