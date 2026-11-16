import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/tenant";
import DashboardNav from "@/components/dashboard/DashboardNav";
import Link from "next/link";
import { servicesEnabled } from "@/lib/bff/client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const store = await getCurrentStore();
  if (!store) redirect("/onboarding");

  return (
    <div className="dashboard">
      <DashboardNav
        storeName={store.name}
        storeStatus={store.status}
        storeSlug={store.slug}
      />
      <section className="dash-content">
        {servicesEnabled() && !store.hasLocation && (
          <div role="alert" className="error" style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <span><strong>Add your shop location.</strong> Buyers find shops by distance. Without a location your shop can be hidden from them.</span>
            <Link href="/dashboard/settings#location" className="button button-small">Set location</Link>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}

