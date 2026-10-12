import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStore } from "@/lib/tenant";
import DashboardNav from "@/components/dashboard/DashboardNav";

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
      <section className="dash-content">{children}</section>
    </div>
  );
}

