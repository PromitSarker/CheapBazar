import { adminBookingsViaServices } from "@/lib/bff/ads";
import { reviewAd } from "./actions";

const th = { padding: "0.85rem 1rem" } as const;
const td = { padding: "0.85rem 1rem" } as const;

export default async function ServicesAds({ error, done }: { error?: string; done?: string }) {
  const [pending, rest] = await Promise.all([adminBookingsViaServices("PENDING_REVIEW"), adminBookingsViaServices()]);
  const live = rest.filter((b) => b.status !== "PENDING_REVIEW");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>Sponsored Ads Moderation</h1>
          <p className="muted">Check the banner and headline, then approve. Approval charges the seller's wallet and the ad goes live on its start date. Dates that overlap a full slot are blocked automatically.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>{pending.length} Awaiting Approval</span>
      </div>

      {error && <p className="error">{error}</p>}
      {done && <p className="success" style={{ color: "green" }}>Ad {done}.</p>}

      <h2>Pending Review Queue</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "2.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
            {["Campaign", "Merchant", "Slot", "Creative", "Dates & fee", "Decision"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {pending.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center" }} className="muted">Nothing is waiting for review.</td></tr>}
            {pending.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{b.bookingNumber}</td>
                <td style={td}>{b.storeName}</td>
                <td style={td}>{b.slot?.name}</td>
                <td style={td}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt="" width={72} height={48} style={{ objectFit: "cover", borderRadius: 4, display: "block", marginBottom: 4 }} />
                  <div style={{ fontWeight: 500 }}>&ldquo;{b.headline}&rdquo;</div>
                  <small className="muted">Target: {b.targetUrl}</small>
                </td>
                <td style={td}>{b.startDate} → {b.endDate} ({b.days} d)<br /><strong style={{ color: "#38bdf8" }}>৳ {b.totalPrice.toFixed(2)}</strong></td>
                <td style={td}>
                  <form action={reviewAd} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <input type="hidden" name="id" value={b.id} />
                    <input name="note" placeholder="Reason (needed to reject)" style={{ padding: "0.35rem 0.5rem", borderRadius: 6 }} />
                    <button type="submit" name="decision" value="APPROVE" className="button button-small glow-button">Approve</button>
                    <button type="submit" name="decision" value="REJECT" className="button button-small button-outline" style={{ color: "#f87171" }}>Reject</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Reviewed &amp; Live Ads</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
            {["ID", "Merchant", "Slot", "Headline", "Dates", "Status"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {live.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center" }} className="muted">No reviewed ads yet.</td></tr>}
            {live.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ ...td, fontWeight: 600 }}>{b.bookingNumber}</td>
                <td style={td}>{b.storeName}</td>
                <td style={td}>{b.slot?.name}</td>
                <td style={td}>{b.headline}{b.reviewNote ? <small className="muted" style={{ display: "block" }}>{b.reviewNote}</small> : null}</td>
                <td style={{ ...td, color: "#a1a1aa", fontSize: "0.85rem" }}>{b.startDate} → {b.endDate}</td>
                <td style={td}><strong>{b.status}</strong>{b.chargeState && b.chargeState !== "NONE" ? ` · ${b.chargeState}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
