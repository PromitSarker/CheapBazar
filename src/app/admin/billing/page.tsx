import Link from "next/link";
import { servicesEnabled } from "@/lib/bff/client";
import { billingOverviewViaServices } from "@/lib/bff/admin";
import { requireRole } from "@/modules/identity/service";
import { savePlan, saveSlot, revokePayment } from "./actions";

export const dynamic = "force-dynamic";

const th = { padding: "0.8rem 1rem", fontSize: "0.75rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" } as const;
const td = { padding: "0.8rem 1rem", color: "#334155" } as const;
const box = { padding: 0, overflow: "hidden", border: "1px solid #e2e8f0", backgroundColor: "#ffffff", marginBottom: "2rem" } as const;
const input = { padding: "0.35rem 0.5rem", border: "1px solid #cbd5e1", borderRadius: 6 } as const;
const taka = (n: number) => `৳${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LABEL: Record<string, string> = {
  PLATFORM_CASH: "Cash held (bank / MFS)", PLATFORM_FEE_REVENUE: "Online order fees earned", PLATFORM_AD_REVENUE: "Ad revenue",
  PLATFORM_SUBSCRIPTION_REVENUE: "Buyer Pro revenue", GATEWAY_CLEARING: "Online payments in transit", PAYOUT_CLEARING: "Seller payouts in flight", PLATFORM_EQUITY: "Opening balances / adjustments",
};

export default async function AdminBillingPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  await requireRole("ADMIN");

  if (!servicesEnabled()) {
    return (
      <div>
        <h1>Pricing &amp; Revenue</h1>
        <p className="muted">This screen is part of the new platform and is not enabled yet.</p>
      </div>
    );
  }

  const o = await billingOverviewViaServices();

  return (
    <div>
      <Link href="/admin" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; Admin Overview</Link>
      <h1>Pricing &amp; Revenue</h1>
      <p className="muted" style={{ marginBottom: "1.25rem" }}>What the platform has earned, the prices it charges, and the Buyer Pro subscriptions. Prices apply to new purchases; existing ad bookings keep the price they were booked at.</p>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.done && <p style={{ color: "green", marginBottom: "1rem" }}>{searchParams.done}.</p>}

      <h3 style={{ marginBottom: "0.75rem" }}>Buyer Pro revenue</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem", marginBottom: "2rem" }}>
        {[["Net", o.revenue.net], ["Gross", o.revenue.gross], ["Reversed", o.revenue.chargedBack], ["Last 30 days", o.revenue.last30Days]].map(([l, v]) => (
          <div key={String(l)} className="card" style={{ padding: "1rem", border: "1px solid #e2e8f0", background: "#fff" }}>
            <div className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{taka(Number(v))}</div>
          </div>
        ))}
        <div className="card" style={{ padding: "1rem", border: "1px solid #e2e8f0", background: "#fff" }}>
          <div className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase" }}>Paid invoices</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{o.revenue.invoices}</div>
        </div>
      </div>

      <h3 style={{ marginBottom: "0.75rem" }}>Platform books (ledger)</h3>
      <div className="card" style={box}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
          <tbody>
            {o.accounts.length === 0 && <tr><td style={{ ...td, textAlign: "center" }}>No postings yet.</td></tr>}
            {o.accounts.map((a) => (
              <tr key={a.code} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}>{LABEL[a.code] ?? a.code}<br /><small className="muted">{a.code}</small></td>
                <td style={{ ...td, textAlign: "right" }}><strong>{taka(a.net)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: "0.75rem" }}>Buyer Pro price</h3>
      <div className="card" style={{ ...box, padding: "1rem 1.1rem" }}>
        <form action={savePlan} style={{ display: "flex", gap: "0.75rem", alignItems: "end", flexWrap: "wrap" }}>
          <label>Price (৳)<br /><input name="price" type="number" step="0.01" min="1" defaultValue={o.plan?.price ?? 499} style={input} required /></label>
          <label>Period (days)<br /><input name="periodDays" type="number" min="1" max="366" defaultValue={o.plan?.periodDays ?? 30} style={input} required /></label>
          <label>Grace (days)<br /><input name="graceDays" type="number" min="0" max="366" defaultValue={o.plan?.graceDays ?? 3} style={input} required /></label>
          <button type="submit" className="button button-small">Save plan</button>
        </form>
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: "0.6rem" }}>Buyers pay by hand each period; after it ends they keep access for the grace days, then wholesale prices lock again.</p>
      </div>

      <h3 style={{ marginBottom: "0.75rem" }}>Advertising slots</h3>
      <div className="card" style={box}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
          <thead><tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}><th style={th}>Slot</th><th style={th}>Where</th><th style={th}>Price / day (৳)</th><th style={th}>Capacity</th><th style={th}>On sale</th><th style={th} /></tr></thead>
          <tbody>
            {o.slots.map((s) => (
              <tr key={s.code} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}><strong>{s.name}</strong><br /><small className="muted">{s.code}</small></td>
                <td style={td}>{s.placement}</td>
                <td colSpan={4} style={td}>
                  <form action={saveSlot} style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input type="hidden" name="code" value={s.code} /><input type="hidden" name="name" value={s.name} /><input type="hidden" name="placement" value={s.placement} />
                    <input name="pricePerDay" type="number" step="0.01" min="1" defaultValue={s.pricePerDay} style={{ ...input, width: 110 }} required />
                    <input name="capacity" type="number" min="1" max="20" defaultValue={s.capacity} style={{ ...input, width: 70 }} required />
                    <label><input name="active" type="checkbox" defaultChecked={s.active} /> active</label>
                    <button type="submit" className="button button-small button-outline">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: "0.75rem" }}>Buyer Pro subscriptions</h3>
      <div className="card" style={box}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
          <tbody>
            {o.subscriptions.length === 0 && <tr><td style={{ ...td, textAlign: "center" }}>No subscriptions yet.</td></tr>}
            {o.subscriptions.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}>{s.buyer}</td><td style={td}><strong>{s.status}</strong></td><td style={td}>until {s.endsLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: "0.25rem" }}>Approved Buyer Pro payments</h3>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>If a transaction id turns out to be fake or the money never arrived, revoke it: the invoice is voided, the access it bought is taken back and the revenue is reversed in the books. The transaction id stays used and cannot be submitted again. Wallet top-ups cannot be revoked yet.</p>
      <div className="card" style={box}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
          <tbody>
            {o.approved.length === 0 && <tr><td style={{ ...td, textAlign: "center" }}>No approved payments.</td></tr>}
            {o.approved.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td}>{p.buyer}<br /><small className="muted">approved by {p.reviewedBy ?? "?"}</small></td>
                <td style={td}><strong>{taka(p.amount)}</strong></td>
                <td style={td}>{p.method} <code>{p.trxId}</code></td>
                <td style={td}>
                  <form action={revokePayment} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input name="reason" placeholder="Reason (required)" style={input} required />
                    <button type="submit" className="button button-small button-outline">Revoke</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
