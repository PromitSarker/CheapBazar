import { getAllUsersForAdmin } from "@/modules/admin/service";
import { changeUserRole } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams?: { error?: string } }) {
  const users = await getAllUsersForAdmin();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0c2b24", letterSpacing: "-0.03em" }}>
            User & Role Management
          </h1>
          <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.95rem" }}>
            Multi-role identity management: Sellers, Buyers, Admins, and Pro Wholesale accounts.
          </p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>
          {users.length} Platform Users
        </span>
      </div>

      {searchParams?.error && <p className="error">{searchParams.error}</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #e2e8dc", backgroundColor: "#ffffff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e2e8dc", background: "#f3f8f2" }}>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#4f6159", textTransform: "uppercase", letterSpacing: "0.05em" }}>User</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#4f6159", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#4f6159", textTransform: "uppercase", letterSpacing: "0.05em" }}>Associated Store</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#4f6159", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Role</th>
              <th style={{ padding: "0.9rem 1.1rem", fontSize: "0.78rem", fontWeight: 700, color: "#4f6159", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleBadgeColors: Record<string, { bg: string; color: string; border: string }> = {
                ADMIN: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
                SELLER: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
                BUYER: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
                PRO_BUYER: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
              };
              const badge = roleBadgeColors[u.role] || roleBadgeColors.BUYER;

              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #eaf4ec" }}>
                  <td style={{ padding: "0.9rem 1.1rem", fontWeight: 600, color: "#123b32" }}>{u.name}</td>
                  <td style={{ padding: "0.9rem 1.1rem", color: "#5c6b64" }}>{u.email}</td>
                  <td style={{ padding: "0.9rem 1.1rem" }}>
                    {u.store ? (
                      <a href={`/store/${u.store.slug}`} target="_blank" rel="noreferrer" style={{ color: "#0284c7", fontWeight: 500 }}>
                        {u.store.name} ↗
                      </a>
                    ) : (
                      <span className="muted" style={{ color: "#8a9a92" }}>None (Buyer)</span>
                    )}
                  </td>
                  <td style={{ padding: "0.9rem 1.1rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "0.25rem 0.55rem",
                        borderRadius: "6px",
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: "0.9rem 1.1rem" }}>
                    <form action={changeUserRole} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue={u.role}
                        style={{
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          backgroundColor: "#ffffff",
                          border: "1.5px solid #c5d0c0",
                          borderRadius: "6px",
                          color: "#123b32",
                          cursor: "pointer",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                          outline: "none",
                        }}
                      >
                        <option value="SELLER" style={{ color: "#123b32", backgroundColor: "#ffffff" }}>SELLER</option>
                        <option value="BUYER" style={{ color: "#123b32", backgroundColor: "#ffffff" }}>BUYER</option>
                        <option value="ADMIN" style={{ color: "#123b32", backgroundColor: "#ffffff" }}>ADMIN</option>
                        <option value="PRO_BUYER" style={{ color: "#123b32", backgroundColor: "#ffffff" }}>PRO_BUYER</option>
                      </select>
                      <button
                        type="submit"
                        className="button button-small"
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          backgroundColor: "#0c2b24",
                          color: "#ffffff",
                          borderRadius: "6px",
                          border: "none",
                          cursor: "pointer",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
