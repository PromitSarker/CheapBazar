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

      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #e2e8f0", backgroundColor: "#ffffff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Store</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Owner</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Custom Domain</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Catalog</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>KYC Status</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lifecycle Status</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.9rem 1.1rem" }}>
                  <strong style={{ display: "block", color: "#0f172a" }}>{s.name}</strong>
                  <a href={`/store/${s.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.82rem", color: "#0284c7", fontWeight: 500 }}>
                    /store/{s.slug} ↗
                  </a>
                </td>
                <td style={{ padding: "0.9rem 1.1rem" }}>
                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{s.owner.name}</div>
                  <small style={{ color: "#64748b" }}>{s.owner.email}</small>
                </td>
                <td style={{ padding: "0.9rem 1.1rem", fontSize: "0.85rem", color: s.customDomain ? "#0284c7" : "#94a3b8" }}>
                  {s.customDomain || "None"}
                </td>
                <td style={{ padding: "0.9rem 1.1rem", color: "#334155" }}>
                  {s._count.products} products ({s.template})
                </td>
                <td style={{ padding: "0.9rem 1.1rem" }}>
                  <form action={toggleStoreKYC}>
                    <input type="hidden" name="storeId" value={s.id} />
                    <input type="hidden" name="currentKyc" value={s.kycVerified ? "true" : "false"} />
                    <button
                      type="submit"
                      style={{
                        background: s.kycVerified ? "#f0fdf4" : "#fefce8",
                        border: s.kycVerified ? "1px solid #bbf7d0" : "1px solid #fef08a",
                        borderRadius: "6px",
                        cursor: "pointer",
                        padding: "0.25rem 0.55rem",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: s.kycVerified ? "#15803d" : "#a16207",
                      }}
                    >
                      {s.kycVerified ? "✅ Verified" : "⏳ Pending"}
                    </button>
                  </form>
                </td>
                <td style={{ padding: "0.9rem 1.1rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.25rem 0.55rem",
                      borderRadius: "6px",
                      backgroundColor:
                        s.status === "ACTIVE"
                          ? "#f0fdf4"
                          : s.status === "WARNING"
                          ? "#fefce8"
                          : "#fef2f2",
                      color:
                        s.status === "ACTIVE"
                          ? "#15803d"
                          : s.status === "WARNING"
                          ? "#a16207"
                          : "#b91c1c",
                      border:
                        s.status === "ACTIVE"
                          ? "1px solid #bbf7d0"
                          : s.status === "WARNING"
                          ? "1px solid #fef08a"
                          : "1px solid #fecaca",
                    }}
                  >
                    ● {s.status}
                  </span>
                </td>
                <td style={{ padding: "0.9rem 1.1rem" }}>
                  <form action={changeStoreStatus} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input type="hidden" name="storeId" value={s.id} />
                    <select
                      name="status"
                      defaultValue={s.status}
                      style={{
                        padding: "0.4rem 0.75rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        border: "1.5px solid #cbd5e1",
                        borderRadius: "6px",
                        color: "#0f172a",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                        outline: "none",
                      }}
                    >
                      <option value="ACTIVE" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>ACTIVE</option>
                      <option value="WARNING" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>WARNING</option>
                      <option value="COD_BLOCKED" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>COD_BLOCKED</option>
                      <option value="PAUSED" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>PAUSED</option>
                      <option value="DELISTED" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>DELISTED</option>
                      <option value="SUSPENDED" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>SUSPENDED</option>
                      <option value="BANNED" style={{ color: "#0f172a", backgroundColor: "#ffffff" }}>BANNED</option>
                    </select>
                    <button
                      type="submit"
                      className="button button-small"
                      style={{
                        padding: "0.4rem 0.8rem",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        backgroundColor: "#09090b",
                        color: "#ffffff",
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                      }}
                    >
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
