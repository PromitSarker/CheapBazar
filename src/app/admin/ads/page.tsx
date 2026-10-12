export const dynamic = "force-dynamic";

export default function AdminAdsPage() {
  const pendingAds = [
    {
      id: "AD-502",
      storeName: "Demo Bakery",
      slot: "Buyer Aggregator Top Spotlight",
      dates: "Oct 18, 2026 – Oct 25, 2026",
      headline: "Artisan Fermented Breads & Croissants",
      targetUrl: "/store/demo-bakery",
      fee: 17500.00,
      collisionCheck: "FREE (No Overlap)",
      status: "PENDING_REVIEW",
    },
    {
      id: "AD-503",
      storeName: "Golden Grain",
      slot: "Storefront Header Banner",
      dates: "Oct 20, 2026 – Oct 27, 2026",
      headline: "50% Off First Wholesale Order",
      targetUrl: "/store/golden-grain",
      fee: 7000.00,
      collisionCheck: "FREE (No Overlap)",
      status: "PENDING_REVIEW",
    },
  ];

  const approvedAds = [
    {
      id: "AD-501",
      storeName: "Demo Bakery",
      slot: "Storefront Header Banner",
      dates: "Oct 10, 2026 – Oct 17, 2026",
      headline: "Free Local Pickup on Orders Over ৳ 500",
      fee: 7000.00,
      status: "ACTIVE (In Ads Cache)",
    },
  ];


  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>Sponsored Ads Moderation (Diagram 5)</h1>
          <p className="muted">Review creative assets, verify date collisions, and approve sponsored campaigns.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>
          {pendingAds.length} Awaiting Approval
        </span>
      </div>

      <h2>Pending Review Queue</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "2.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>Campaign ID</th>
              <th style={{ padding: "0.85rem 1rem" }}>Merchant</th>
              <th style={{ padding: "0.85rem 1rem" }}>Slot</th>
              <th style={{ padding: "0.85rem 1rem" }}>Headline & Target</th>
              <th style={{ padding: "0.85rem 1rem" }}>Dates & Pricing</th>
              <th style={{ padding: "0.85rem 1rem" }}>Collision Engine</th>
              <th style={{ padding: "0.85rem 1rem" }}>Review Action</th>
            </tr>
          </thead>
          <tbody>
            {pendingAds.map((ad) => (
              <tr key={ad.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{ad.id}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{ad.storeName}</td>
                <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>{ad.slot}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <div style={{ fontWeight: 500 }}>&ldquo;{ad.headline}&rdquo;</div>
                  <small className="muted" style={{ fontSize: "0.75rem" }}>Target: {ad.targetUrl}</small>
                </td>
                <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                  <div>{ad.dates}</div>
                  <strong style={{ color: "#38bdf8" }}>৳ {ad.fee.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <span style={{ fontSize: "0.8rem", color: "#4ade80", fontWeight: 600 }}>
                    ● {ad.collisionCheck}
                  </span>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="button button-small glow-button" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                      Approve
                    </button>
                    <button type="button" className="button button-small button-outline" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", color: "#f87171" }}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Live & Cached Ads</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>ID</th>
              <th style={{ padding: "0.85rem 1rem" }}>Merchant</th>
              <th style={{ padding: "0.85rem 1rem" }}>Slot</th>
              <th style={{ padding: "0.85rem 1rem" }}>Headline</th>
              <th style={{ padding: "0.85rem 1rem" }}>Dates</th>
              <th style={{ padding: "0.85rem 1rem" }}>Cache Status</th>
            </tr>
          </thead>
          <tbody>
            {approvedAds.map((ad) => (
              <tr key={ad.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{ad.id}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{ad.storeName}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{ad.slot}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{ad.headline}</td>
                <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem", color: "#a1a1aa" }}>{ad.dates}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#4ade80", backgroundColor: "rgba(34, 197, 94, 0.15)", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
                    ● {ad.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
