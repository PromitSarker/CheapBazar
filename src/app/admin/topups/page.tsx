import Link from "next/link";
import { servicesEnabled } from "@/lib/bff/client";
import { manualPaymentsViaServices } from "@/lib/bff/admin";
import { requireRole } from "@/modules/identity/service";
import { reviewTopUp } from "./actions";

export const dynamic = "force-dynamic";

const th = { padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" } as const;
const td = { padding: "0.9rem 1.1rem", color: "#334155" } as const;

export default async function AdminTopUpsPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  await requireRole("ADMIN");

  if (!servicesEnabled()) {
    return (
      <div>
        <h1>Wallet Top-up Review</h1>
        <p className="muted">Manual top-ups are part of the new platform and are not enabled yet. Wallets are topped up online until the switch-over.</p>
      </div>
    );
  }

  const pending = await manualPaymentsViaServices("PENDING");
  const recent = (await manualPaymentsViaServices()).filter((p) => p.status !== "PENDING").slice(0, 15);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <Link href="/admin" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; Admin Overview</Link>
          <h1>Payment Review</h1>
          <p className="muted">Sellers (wallet top-ups) and buyers (Buyer Pro) pay the platform by bKash, Nagad, Rocket, bank or cash and submit the transaction ID. Check it against your account statement before approving: approval credits the seller's wallet or starts the buyer's Buyer Pro plan.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>{pending.length} awaiting review</span>
      </div>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.done && <p className="success" style={{ color: "green", marginBottom: "1rem" }}>Top-up {searchParams.done}.</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #e2e8f0", backgroundColor: "#ffffff", marginBottom: "2rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={th}>Payer</th><th style={th}>Amount</th><th style={th}>Method / TrxID</th><th style={th}>Submitted</th><th style={th}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, textAlign: "center" }}>Nothing is waiting for review.</td></tr>
            )}
            {pending.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}><strong>{p.storeName}</strong><br /><small>{p.kind}{p.storeSlug ? ` · /store/${p.storeSlug}` : ""}</small></td>
                <td style={td}><strong>৳{Number(p.amount).toFixed(2)}</strong></td>
                <td style={td}>{p.method}<br /><code>{p.trxId}</code></td>
                <td style={td}>{p.createdLabel}</td>
                <td style={td}>
                  <form action={reviewTopUp} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input name="note" placeholder="Reason (needed to reject)" style={{ padding: "0.35rem 0.5rem", border: "1px solid #cbd5e1", borderRadius: 6 }} />
                    <button type="submit" name="decision" value="APPROVE" className="button button-small">Approve</button>
                    <button type="submit" name="decision" value="REJECT" className="button button-small button-outline">Reject</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: "0.75rem" }}>Recently reviewed</h3>
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <tbody>
            {recent.length === 0 && <tr><td style={{ ...td, textAlign: "center" }}>No reviewed top-ups yet.</td></tr>}
            {recent.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}>{p.storeName}<br /><small>{p.kind}</small></td>
                <td style={td}>৳{Number(p.amount).toFixed(2)}</td>
                <td style={td}>{p.method} <code>{p.trxId}</code></td>
                <td style={td}><strong>{p.status}</strong>{p.reviewNote ? ` — ${p.reviewNote}` : ""}</td>
                <td style={td}>{p.reviewedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
