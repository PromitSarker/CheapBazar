import { getAllStoresForAdmin } from "@/modules/admin/service";
import { changeStoreStatus, toggleStoreKYC } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminStoresPage() {
  const stores = await getAllStoresForAdmin();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>Store Moderation & KYC (Diagram 2)</h1>
          <p className="muted">Inspect stores, verify seller credentials, and enforce operational lifecycle statuses.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>
          {stores.length} Registered Stores
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>Store</th>
              <th style={{ padding: "0.85rem 1rem" }}>Owner</th>
              <th style={{ padding: "0.85rem 1rem" }}>Custom Domain</th>
              <th style={{ padding: "0.85rem 1rem" }}>Catalog</th>
              <th style={{ padding: "0.85rem 1rem" }}>KYC Status</th>
              <th style={{ padding: "0.85rem 1rem" }}>Lifecycle Status</th>
              <th style={{ padding: "0.85rem 1rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <strong style={{ display: "block" }}>{s.name}</strong>
                  <a href={`/store/${s.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "#38bdf8" }}>
                    /store/{s.slug} ↗
                  </a>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <div>{s.owner.name}</div>
                  <small className="muted">{s.owner.email}</small>
                </td>
                <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem", color: s.customDomain ? "#38bdf8" : "#71717a" }}>
                  {s.customDomain || "None"}
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  {s._count.products} products ({s.template})
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <form action={toggleStoreKYC}>
                    <input type="hidden" name="storeId" value={s.id} />
                    <input type="hidden" name="currentKyc" value={s.kycVerified ? "true" : "false"} />
                    <button
                      type="submit"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: s.kycVerified ? "#4ade80" : "#facc15",
                      }}
                    >
                      {s.kycVerified ? "✅ Verified" : "⏳ Pending"}
                    </button>
                  </form>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      backgroundColor:
                        s.status === "ACTIVE"
                          ? "rgba(34, 197, 94, 0.15)"
                          : s.status === "WARNING"
                          ? "rgba(234, 179, 8, 0.15)"
                          : "rgba(239, 68, 68, 0.15)",
                      color:
                        s.status === "ACTIVE"
                          ? "#4ade80"
                          : s.status === "WARNING"
                          ? "#facc15"
                          : "#f87171",
                    }}
                  >
                    ● {s.status}
                  </span>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <form action={changeStoreStatus} style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="hidden" name="storeId" value={s.id} />
                    <select
                      name="status"
                      defaultValue={s.status}
                      style={{
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.8rem",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        color: "white",
                      }}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="WARNING">WARNING</option>
                      <option value="COD_BLOCKED">COD_BLOCKED</option>
                      <option value="PAUSED">PAUSED</option>
                      <option value="DELISTED">DELISTED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="BANNED">BANNED</option>
                    </select>
                    <button type="submit" className="button button-small" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                      Set
                    </button>
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
