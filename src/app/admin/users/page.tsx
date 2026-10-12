import { getAllUsersForAdmin } from "@/modules/admin/service";
import { changeUserRole } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await getAllUsersForAdmin();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>User & Role Management</h1>
          <p className="muted">Multi-role identity management: Sellers, Buyers, Admins, and Pro Wholesale accounts.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0 }}>
          {users.length} Platform Users
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>User</th>
              <th style={{ padding: "0.85rem 1rem" }}>Email</th>
              <th style={{ padding: "0.85rem 1rem" }}>Associated Store</th>
              <th style={{ padding: "0.85rem 1rem" }}>Current Role</th>
              <th style={{ padding: "0.85rem 1rem" }}>Assign Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa" }}>{u.email}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  {u.store ? (
                    <a href={`/store/${u.store.slug}`} target="_blank" rel="noreferrer" style={{ color: "#38bdf8" }}>
                      {u.store.name} ↗
                    </a>
                  ) : (
                    <span className="muted">None (Buyer)</span>
                  )}
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
                        u.role === "ADMIN"
                          ? "rgba(239, 68, 68, 0.15)"
                          : u.role === "SELLER"
                          ? "rgba(59, 130, 246, 0.15)"
                          : "rgba(34, 197, 94, 0.15)",
                      color:
                        u.role === "ADMIN"
                          ? "#f87171"
                          : u.role === "SELLER"
                          ? "#60a5fa"
                          : "#4ade80",
                    }}
                  >
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <form action={changeUserRole} style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      style={{
                        padding: "0.3rem 0.5rem",
                        fontSize: "0.8rem",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        color: "white",
                      }}
                    >
                      <option value="SELLER">SELLER</option>
                      <option value="BUYER">BUYER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="PRO_BUYER">PRO_BUYER</option>
                    </select>
                    <button type="submit" className="button button-small" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}>
                      Update
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
