import { notFound } from "next/navigation";
import { getPublicStoreWithProducts } from "@/modules/catalog/service";
import TemplateClassic from "@/components/templates/TemplateClassic";
import TemplateModern from "@/components/templates/TemplateModern";
import { servicesEnabled } from "@/lib/bff/client";
import { sponsoredForStorefront } from "@/lib/bff/ads";
import { headers } from "next/headers";
import { isMarketplaceHost } from "@/lib/hosts";
import { getBuyerLocation } from "@/lib/location";
import { storeVisibility, visibilityMessage } from "@/lib/bff/location";
import { getCurrentUser } from "@/lib/auth";
import LocationGate from "@/components/location/LocationGate";
import OutOfRange from "@/components/location/OutOfRange";

export const dynamic = "force-dynamic";

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const data = await getPublicStoreWithProducts(params.slug);
  if (!data) notFound();

  const { store, products } = data;

  // Check store operational lifecycle status (Diagram 2)
  if (store.status === "SUSPENDED" || store.status === "BANNED") {
    return (
      <div className="status-screen" style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ color: "#ff6b6b" }}>Store Suspended</h1>
        <p className="muted">This storefront is currently suspended due to policy or verification review.</p>
      </div>
    );
  }

  // The admin's range limit: on the marketplace host a shop outside the buyer's range is not shown. A seller's own subdomain or
  // custom domain is their own website and stays open to everyone; the shop's owner and admins always see it.
  if (servicesEnabled() && isMarketplaceHost(headers().get("host"))) {
    const v = await storeVisibility(store.slug, getBuyerLocation()).catch(() => null); // an outage never hides a shop
    if (v && v.found && !v.visible) {
      const viewer = await getCurrentUser();
      const exempt = viewer && (viewer.role === "ADMIN" || viewer.id === store.ownerId);
      if (!exempt) {
        return v.reason === "LOCATION_REQUIRED"
          ? <LocationGate radiusKm={v.radiusKm} shopName={store.name} />
          : <OutOfRange message={visibilityMessage(v)} />;
      }
    }
  }

  const Template = store.template === "modern" ? TemplateModern : TemplateClassic;
  // Services path: show a real paid banner (or none). Legacy path keeps the old placeholder.
  const sponsored = servicesEnabled() ? await sponsoredForStorefront(store.id) : undefined;
  return <Template store={store} products={products} sponsored={sponsored} />;
}

