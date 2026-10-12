import { getAdminStats } from "@/modules/admin/service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await getAdminStats();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>Platform Administration</h1>
          <p className="muted">System-wide monitoring, compliance, store moderation, and platform health.</p>
        </div>
        <span className="hero-badge" style={{ margin: 0, borderColor: "rgba(239, 68, 68, 0.4)", color: "#f87171" }}>
          ● Live Production Node
        </span>
      </div>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <span className="stat-value">{stats.totalStores}</span>
          <span className="muted">Total Registered Stores</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#4ade80" }}>{stats.activeStores}</span>
          <span className="muted">Active & Operational</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: stats.suspendedStores > 0 ? "#f87171" : "#a1a1aa" }}>
            {stats.suspendedStores}
          </span>
          <span className="muted">Suspended / Paused Stores</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#38bdf8" }}>{stats.totalProducts}</span>
          <span className="muted">Global Catalog Units</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.totalUsers}</span>
          <span className="muted">Total Users ({stats.sellersCount} Sellers, {stats.buyersCount} Buyers)</span>
        </div>
      </div>

      <div className="card-grid">
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🏪</div>
          <h3>Store Moderation & KYC</h3>
          <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "1.25rem" }}>
            Inspect store details, review merchant identity proofs, and apply status actions (Active, Warning, Suspended, Banned).
          </p>
          <Link href="/admin/stores" className="button button-small button-outline">
            Review Stores &rarr;
          </Link>
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📢</div>
          <h3>Sponsored Ads Moderation</h3>
          <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "1.25rem" }}>
            Review merchant ad creative submissions, inspect slot collisions, and approve campaigns into the Ads Cache.
          </p>
          <Link href="/admin/ads" className="button button-small button-outline">
            Moderate Ads &rarr;
          </Link>
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👥</div>
          <h3>Identity & Role Partitioning</h3>
          <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "1.25rem" }}>
            Manage user accounts, assign Administrator privileges, and inspect buyer/seller subscriptions.
          </p>
          <Link href="/admin/users" className="button button-small button-outline">
            Manage Users &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
