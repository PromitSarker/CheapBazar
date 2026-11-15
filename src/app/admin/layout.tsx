import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { requireRole } from "@/modules/identity/service";
import { servicesEnabled } from "@/lib/bff/client";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireRole("ADMIN");

  return (
    <div className="dashboard admin-dashboard">
      <aside className="dash-nav">
        <div className="dash-nav-header">
          <div className="dash-store-identity">
            <div className="dash-store-avatar">
              <Icon name="shield" />
            </div>
            <div className="dash-store-details">
              <span className="dash-store-name">Admin Back-Office</span>
              <span className="dash-store-type">Platform Governance</span>
            </div>
          </div>
          <div className="dash-status-pill error">
            <span className="dash-status-dot" />
            <span>Superadmin Access</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="dash-nav-section-title">Admin Controls</div>
          <nav className="dash-nav-list">
            <Link href="/admin" className="dash-nav-item">
              <span className="dash-nav-icon"><Icon name="chart" size={18} /></span>
              <span>Platform Overview</span>
            </Link>
            <Link href="/admin/stores" className="dash-nav-item">
              <span className="dash-nav-icon"><Icon name="store" size={18} /></span>
              <span>Stores & KYC</span>
            </Link>
            <Link href="/admin/ads" className="dash-nav-item">
              <span className="dash-nav-icon"><Icon name="megaphone" size={18} /></span>
              <span>Ad Moderation</span>
            </Link>
            {servicesEnabled() && (
              <Link href="/admin/topups" className="dash-nav-item">
                <span className="dash-nav-icon"><Icon name="card" size={18} /></span>
                <span>Payment Review</span>
              </Link>
            )}
            {servicesEnabled() && (
              <Link href="/admin/billing" className="dash-nav-item">
                <span className="dash-nav-icon"><Icon name="dollar" size={18} /></span>
                <span>Pricing & Revenue</span>
              </Link>
            )}
            <Link href="/admin/users" className="dash-nav-item">
              <span className="dash-nav-icon"><Icon name="users" size={18} /></span>
              <span>Users & Roles</span>
            </Link>
          </nav>
        </div>

        <div className="dash-nav-footer">
          <Link href="/dashboard" className="dash-live-store-card">
            <div className="dash-live-store-card-header">
              <span className="dash-live-store-label">Merchant Portal</span>
              <span className="dash-live-store-link">Switch ↗</span>
            </div>
            <span className="dash-live-store-url">/dashboard</span>
          </Link>
        </div>
      </aside>
      <section className="dash-content">{children}</section>
    </div>

  );
}
